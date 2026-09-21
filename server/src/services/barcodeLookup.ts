import { prisma } from '../prisma';

export interface BarcodeLookupResult {
  found: boolean;
  name?: string;
  category?: string;
  brand?: string;
  unit?: string;
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
      },
      orderBy: { createdAt: 'desc' }
    });

    if (existing) {
      return {
        found: true,
        name: existing.name,
        category: existing.category,
        unit: existing.unit,
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
