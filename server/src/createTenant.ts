import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as readline from 'readline';

const prisma = new PrismaClient();

function ask(question: string, defaultValue = ''): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptText = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace(/^--/, '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      parsed[key] = value;
      if (value !== 'true') i++;
    }
  }
  return parsed;
}

export async function createTenantData({
  name,
  email,
  password,
  ownerName = 'Administrador',
  adminPin = '1234',
  document = '',
  phone = '',
  plan = 'pro'
}: {
  name: string;
  email: string;
  password: string;
  ownerName?: string;
  adminPin?: string;
  document?: string;
  phone?: string;
  plan?: string;
}) {
  const existing = await prisma.tenant.findUnique({ where: { email } });
  if (existing) {
    throw new Error(`Já existe um comércio cadastrado com o email: ${email}`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const pinHash = await bcrypt.hash(adminPin, 10);

  const tenant = await prisma.tenant.create({
    data: {
      name,
      email,
      password: passwordHash,
      document,
      phone,
      plan,
      active: true,
      storeSetting: {
        create: {
          storeName: name,
          tradeName: name,
          document,
          phone,
          receiptWidth: '80mm',
          receiptFooter: 'Obrigado pela preferência! Volte sempre!',
          enableSound: true,
        }
      },
      users: {
        create: {
          name: ownerName,
          username: 'admin',
          role: 'admin',
          pin: pinHash,
          active: true,
        }
      }
    },
    include: {
      users: true,
      storeSetting: true
    }
  });

  await prisma.cashRegister.create({
    data: {
      tenantId: tenant.id,
      isOpen: true,
      initialAmount: 0,
      currentBalance: 0,
      openedBy: ownerName,
      movements: {
        create: {
          tenantId: tenant.id,
          operatorName: ownerName,
          type: 'opening',
          amount: 0,
          reason: 'Caixa inicial',
        }
      }
    }
  });

  return tenant;
}

async function main() {
  console.log('\n==========================================');
  console.log('🦎 PDV CAMALEÃO - CADASTRO DE NOVO COMÉRCIO');
  console.log('==========================================\n');

  const args = parseArgs();

  let name = args.name;
  let email = args.email;
  let password = args.password;
  let ownerName = args.ownerName || args.dono || 'Administrador';
  let adminPin = args.pin || '1234';
  let phone = args.phone || args.telefone || '';
  let document = args.doc || args.cnpj || '';

  // Se não passou argumentos pela linha de comando, pergunta interativamente
  if (!name || !email || !password) {
    name = await ask('1. Nome fantasia do Comércio/Loja');
    while (!name) {
      console.log('⚠️ Nome é obrigatório.');
      name = await ask('1. Nome fantasia do Comércio/Loja');
    }

    email = await ask('2. Email de acesso do comércio (login web)');
    while (!email || !email.includes('@')) {
      console.log('⚠️ Email válido é obrigatório.');
      email = await ask('2. Email de acesso do comércio (login web)');
    }

    password = await ask('3. Senha de acesso do comércio');
    while (!password || password.length < 4) {
      console.log('⚠️ Senha deve ter pelo menos 4 caracteres.');
      password = await ask('3. Senha de acesso do comércio');
    }

    ownerName = await ask('4. Nome do responsável/dono', 'Administrador');
    adminPin = await ask('5. PIN de acesso ao caixa (4 dígitos)', '1234');
    phone = await ask('6. Telefone/WhatsApp (opcional)', '');
    document = await ask('7. CNPJ/CPF (opcional)', '');
  }

  try {
    console.log('\n⏳ Criando comércio no banco de dados...');
    const tenant = await createTenantData({
      name,
      email,
      password,
      ownerName,
      adminPin,
      phone,
      document
    });

    console.log('\n✅ COMÉRCIO CRIADO COM SUCESSO!\n');
    console.log('------------------------------------------');
    console.log(`🏪 Loja:       ${tenant.name}`);
    console.log(`📧 Email:      ${tenant.email}`);
    console.log(`🔑 Senha:      ${password}`);
    console.log(`👤 Operador:   ${ownerName} (admin)`);
    console.log(`🔢 PIN Caixa:  ${adminPin}`);
    console.log('------------------------------------------');
    console.log('💡 O cliente já pode acessar o sistema com o email e senha acima!\n');
  } catch (error: any) {
    console.error('\n❌ Erro ao criar comércio:', error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
