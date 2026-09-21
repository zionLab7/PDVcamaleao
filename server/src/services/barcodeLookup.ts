import { prisma } from '../prisma';

export interface BarcodeLookupResult {
  found: boolean;
  name?: string;
  category?: string;
  brand?: string;
  unit?: string;
  ncm?: string;
  source?: string;
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase();

  if (/(bebida|beverage|refrigerante|suco|cerveja|água|agua|soda|vinho|whisky|energético|energetico|vodka|boisson)/.test(lower)) {
    return 'Bebidas';
  }
  if (/(hortifruti|fruta|vegetal|legume|verdura|hortaliça|banana|maçã|tomate|alface|cebola)/.test(lower)) {
    return 'Hortifrúti';
  }
  if (/(padaria|panificação|pão|pao|bolo|biscoito|bolacha|torrada|croissant|confeitaria|bakery)/.test(lower)) {
    return 'Padaria';
  }
  if (/(laticínio|laticinio|leite|queijo|manteiga|iogurte|requeijão|requeijao|creme de leite|dairy)/.test(lower)) {
    return 'Laticínios';
  }
  if (/(açougue|acougue|carne|frango|bovino|suíno|suino|linguiça|linguica|salsicha|peixe|meat)/.test(lower)) {
    return 'Açougue';
  }
  if (/(limpeza|detergente|sabão|sabao|desinfetante|amaciante|cloro|alvejante|esponja|multiuso|cleaning)/.test(lower)) {
    return 'Limpeza';
  }
  if (/(higiene|sabonete|shampoo|condicionador|dental|creme dental|pasta de dente|papel higiênico|desodorante|absorvente)/.test(lower)) {
    return 'Higiene';
  }
  if (/(doce|chocolate|bala|chiclete|snack|salgadinho|amendoim|pirulito|confeitaria)/.test(lower)) {
    return 'Doces & Snacks';
  }

  return 'Mercearia';
}

function detectNcm(name: string, category: string): string {
  const lower = `${name} ${category}`.toLowerCase();

  if (/(refrigerante|coca|guaraná|fanta|pepsi|sprite|sukita)/.test(lower)) return '22021000';
  if (/(cerveja|heineken|amstel|brahma|skol|budweiser|stella)/.test(lower)) return '22030000';
  if (/(água mineral|agua mineral)/.test(lower)) return '22011000';
  if (/(suco|néctar|nectar)/.test(lower)) return '20098990';
  if (/(arroz)/.test(lower)) return '10063021';
  if (/(feijão|feijao)/.test(lower)) return '07133399';
  if (/(café|cafe)/.test(lower)) return '09012100';
  if (/(açúcar|acucar)/.test(lower)) return '17019900';
  if (/(óleo de soja|oleo de soja)/.test(lower)) return '15079011';
  if (/(leite integral|leite desnatado|leite uht)/.test(lower)) return '04012010';
  if (/(manteiga)/.test(lower)) return '04051000';
  if (/(macarrão|macarrao|espaguete)/.test(lower)) return '19021900';
  if (/(molho de tomate|extrato de tomate)/.test(lower)) return '21032010';
  if (/(biscoito|bolacha)/.test(lower)) return '19053100';
  if (/(pão|pao)/.test(lower)) return '19059090';
  if (/(detergente)/.test(lower)) return '34022000';
  if (/(sabão em pó|sabao em po)/.test(lower)) return '34029031';
  if (/(sabonete)/.test(lower)) return '34011190';
  if (/(papel higiênico|papel higienico)/.test(lower)) return '48181000';

  if (category === 'Bebidas') return '22029900';
  if (category === 'Limpeza') return '34029039';
  if (category === 'Higiene') return '33051000';
  if (category === 'Laticínios') return '04061010';

  return '21069090'; // Preparações alimentícias diversas (NCM padrão)
}

export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const cleanBarcode = barcode.trim().replace(/\D/g, '');

  if (!cleanBarcode || cleanBarcode.length < 6) {
    return { found: false };
  }

  // 1. Verificar no catálogo interno do PDV (qualquer comércio que já tenha cadastrado)
  try {
    const existing = await prisma.product.findFirst({
      where: {
        barcode: cleanBarcode,
        name: { not: '' }
      },
      select: {
        name: true,
        category: true,
        unit: true,
        ncm: true,
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existing) {
      return {
        found: true,
        name: existing.name,
        category: existing.category,
        unit: existing.unit,
        ncm: existing.ncm && existing.ncm !== '00000000' ? existing.ncm : detectNcm(existing.name, existing.category),
        source: 'Catálogo Compartilhado PDV'
      };
    }
  } catch (err) {
    console.error('Erro na busca de código de barras interna:', err);
  }

  // 2. Consultar Open Food Facts (Gratuito, livre, amplo catálogo brasileiro)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${cleanBarcode}.json`,
      {
        headers: {
          'User-Agent': 'PDVCamaleao - Commercial POS System - contact@pdvcamaleao.com'
        },
        signal: controller.signal
      }
    );
    clearTimeout(timeout);

    if (response.ok) {
      const data: any = await response.json();
      if (data.status === 1 && data.product) {
        const prod = data.product;
        const name = prod.product_name_pt || prod.product_name || prod.generic_name_pt || prod.generic_name;
        const brand = prod.brands ? prod.brands.split(',')[0].trim() : '';
        const quantity = prod.quantity ? ` ${prod.quantity}` : '';

        if (name) {
          const fullName = brand && !name.toLowerCase().includes(brand.toLowerCase())
            ? `${name} - ${brand}${quantity}`
            : `${name}${quantity}`;

          const categoryStr = `${prod.categories || ''} ${prod.categories_tags?.join(' ') || ''} ${fullName}`;
          const category = detectCategory(categoryStr);

          return {
            found: true,
            name: fullName.trim(),
            brand,
            category,
            unit: 'UN',
            ncm: detectNcm(fullName, category),
            source: 'Open Food Facts'
          };
        }
      }
    }
  } catch (err) {
    // Timeout ou erro de rede não interrompe o fluxo
  }

  // 3. Consultar Open Beauty Facts (Cosméticos, higiene e beleza)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(
      `https://world.openbeautyfacts.org/api/v2/product/${cleanBarcode}.json`,
      {
        headers: {
          'User-Agent': 'PDVCamaleao - Commercial POS System'
        },
        signal: controller.signal
      }
    );
    clearTimeout(timeout);

    if (response.ok) {
      const data: any = await response.json();
      if (data.status === 1 && data.product) {
        const prod = data.product;
        const name = prod.product_name_pt || prod.product_name;
        const brand = prod.brands ? prod.brands.split(',')[0].trim() : '';

        if (name) {
          const fullName = brand && !name.toLowerCase().includes(brand.toLowerCase())
            ? `${name} - ${brand}`
            : name;

          return {
            found: true,
            name: fullName.trim(),
            brand,
            category: 'Higiene',
            unit: 'UN',
            source: 'Open Beauty Facts'
          };
        }
      }
    }
  } catch (err) {
    // Silencioso
  }

  // 4. Se tiver token do Cosmos Bluesoft configurado no .env
  if (process.env.COSMOS_TOKEN) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(
        `https://api.cosmos.bluesoft.com.br/gtins/${cleanBarcode}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Cosmos-Token': process.env.COSMOS_TOKEN,
            'User-Agent': 'Cosmos-API-Client'
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeout);

      if (response.ok) {
        const data: any = await response.json();
        if (data.description) {
          return {
            found: true,
            name: data.description,
            brand: data.brand?.name || '',
            category: detectCategory(`${data.gpc?.description || ''} ${data.description}`),
            unit: 'UN',
            source: 'Bluesoft Cosmos'
          };
        }
      }
    } catch (err) {
      // Silencioso
    }
  }

  return { found: false };
}
