import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const defaultProducts = [
  { name: 'Pão Francês Tradicional', barcode: '7891000100010', category: 'Padaria', unit: 'KG', costPrice: 9.5, sellPrice: 17.9, stock: 25.5, minStock: 8.0, quickAccess: true },
  { name: 'Banana Prata Selecionada', barcode: '7891000100020', category: 'Hortifrúti', unit: 'KG', costPrice: 4.2, sellPrice: 7.99, stock: 12.0, minStock: 5.0, quickAccess: true },
  { name: 'Coxinha de Frango com Catupiry', barcode: '7891000100030', category: 'Padaria', unit: 'UN', costPrice: 3.5, sellPrice: 7.5, stock: 18, minStock: 5, quickAccess: true },
  { name: 'Gelo em Cubos 5kg', barcode: '7891000100040', category: 'Bebidas', unit: 'PC', costPrice: 7.0, sellPrice: 14.0, stock: 20, minStock: 6, quickAccess: true },
  { name: 'Sacola Plástica Reforçada', barcode: '7891000100050', category: 'Mercearia', unit: 'UN', costPrice: 0.05, sellPrice: 0.2, stock: 500, minStock: 50, quickAccess: true },
  { name: 'Arroz Tipo 1 Camil 5kg', barcode: '7891000100101', category: 'Mercearia', unit: 'UN', costPrice: 21.5, sellPrice: 28.9, stock: 35, minStock: 8, quickAccess: false },
  { name: 'Feijão Carioca Kicaldo 1kg', barcode: '7891000100102', category: 'Mercearia', unit: 'UN', costPrice: 5.9, sellPrice: 8.49, stock: 40, minStock: 10, quickAccess: false },
  { name: 'Óleo de Soja Liza 900ml', barcode: '7891000100103', category: 'Mercearia', unit: 'UN', costPrice: 4.8, sellPrice: 6.89, stock: 50, minStock: 12, quickAccess: false },
  { name: 'Café Tradicional Pilão 500g', barcode: '7891000100104', category: 'Mercearia', unit: 'UN', costPrice: 14.2, sellPrice: 19.9, stock: 30, minStock: 6, quickAccess: false },
  { name: 'Açúcar Refinado União 1kg', barcode: '7891000100105', category: 'Mercearia', unit: 'UN', costPrice: 3.4, sellPrice: 4.89, stock: 60, minStock: 15, quickAccess: false },
  { name: 'Leite UHT Integral Piracanjuba 1L', barcode: '7891000100106', category: 'Laticínios', unit: 'LT', costPrice: 4.1, sellPrice: 5.49, stock: 80, minStock: 20, quickAccess: false },
  { name: 'Ovos Brancos Grandes c/ 30', barcode: '7891000100107', category: 'Mercearia', unit: 'CX', costPrice: 15.0, sellPrice: 21.9, stock: 15, minStock: 4, quickAccess: false },
  { name: 'Coca-Cola Original 2L', barcode: '7891000100201', category: 'Bebidas', unit: 'UN', costPrice: 7.9, sellPrice: 10.99, stock: 45, minStock: 10, quickAccess: false },
  { name: 'Coca-Cola Original Lata 350ml', barcode: '7891000100202', category: 'Bebidas', unit: 'UN', costPrice: 3.1, sellPrice: 4.99, stock: 60, minStock: 12, quickAccess: false },
  { name: 'Cerveja Heineken Lata 350ml', barcode: '7891000100203', category: 'Bebidas', unit: 'UN', costPrice: 4.5, sellPrice: 6.49, stock: 72, minStock: 18, quickAccess: false },
  { name: 'Água Mineral Crystal s/ Gás 500ml', barcode: '7891000100204', category: 'Bebidas', unit: 'UN', costPrice: 1.2, sellPrice: 2.5, stock: 90, minStock: 24, quickAccess: false },
  { name: 'Manteiga c/ Sal Aviação 200g', barcode: '7891000100301', category: 'Laticínios', unit: 'UN', costPrice: 9.8, sellPrice: 13.9, stock: 22, minStock: 5, quickAccess: false },
  { name: 'Macarrão Espaguete Dona Benta 500g', barcode: '7891000100401', category: 'Mercearia', unit: 'PC', costPrice: 2.9, sellPrice: 4.29, stock: 40, minStock: 10, quickAccess: false },
  { name: 'Molho de Tomate Quero Tradicional 300g', barcode: '7891000100402', category: 'Mercearia', unit: 'UN', costPrice: 1.6, sellPrice: 2.49, stock: 65, minStock: 15, quickAccess: false },
  { name: 'Detergente Líquido Ypê Neutro 500ml', barcode: '7891000100501', category: 'Limpeza', unit: 'UN', costPrice: 1.8, sellPrice: 2.79, stock: 80, minStock: 20, quickAccess: false },
  { name: 'Sabão em Pó Omo Lavagem Perfeita 800g', barcode: '7891000100502', category: 'Limpeza', unit: 'CX', costPrice: 11.5, sellPrice: 15.9, stock: 35, minStock: 8, quickAccess: false },
  { name: 'Papel Higiênico Neve Folha Dupla c/ 4', barcode: '7891000100601', category: 'Higiene', unit: 'PC', costPrice: 6.2, sellPrice: 8.99, stock: 40, minStock: 10, quickAccess: false },
];

async function main() {
  console.log('🌱 Starting seed...');

  const passwordHash = await bcrypt.hash('demo123', 12);
  
  const tenant = await prisma.tenant.upsert({
    where: { email: 'demo@pdvcamaleao.com' },
    update: {},
    create: {
      name: 'Mercadinho & Mercearia São José',
      email: 'demo@pdvcamaleao.com',
      password: passwordHash,
      document: '12.345.678/0001-90',
      phone: '(11) 98765-4321',
      plan: 'pro',
    },
  });

  console.log(`🏪 Tenant criado: ${tenant.name} (${tenant.email})`);

  await prisma.storeSetting.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      storeName: 'Mercadinho & Mercearia São José',
      tradeName: 'Mercearia São José Ltda',
      document: '12.345.678/0001-90',
      phone: '(11) 98765-4321',
      address: 'Rua das Flores, 142 - Centro',
      city: 'São Paulo - SP',
      pixKey: '12345678000190',
      pixReceiver: 'MERCEARIA SAO JOSE',
      pixCity: 'SAO PAULO',
      receiptWidth: '80mm',
      receiptFooter: 'Obrigado pela preferência! Volte sempre!',
      enableSound: true,
    },
  });

  console.log('⚙️ Configurações da loja definidas');

  const adminPin = await bcrypt.hash('1234', 10);
  const managerPin = await bcrypt.hash('2222', 10);
  const cashierPin = await bcrypt.hash('0000', 10);

  const users = [
    { name: 'Carlos Oliveira (Dono)', username: 'admin', role: 'admin', pin: adminPin },
    { name: 'Mariana Santos (Gerente)', username: 'mariana', role: 'manager', pin: managerPin },
    { name: 'João Pedro (Caixa)', username: 'joao', role: 'cashier', pin: cashierPin },
  ];

  for (const u of users) {
    const exists = await prisma.user.findFirst({
      where: { tenantId: tenant.id, username: u.username },
    });
    if (!exists) {
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          name: u.name,
          username: u.username,
          role: u.role,
          pin: u.pin,
        },
      });
    }
  }

  console.log('👥 Operadores criados: Admin (PIN 1234), Gerente (PIN 2222), Caixa (PIN 0000)');

  // Initialize open cash register
  const register = await prisma.cashRegister.findFirst({
    where: { tenantId: tenant.id, isOpen: true },
  });

  if (!register) {
    await prisma.cashRegister.create({
      data: {
        tenantId: tenant.id,
        isOpen: true,
        initialAmount: 150.0,
        currentBalance: 150.0,
        openedBy: 'Carlos Oliveira (Dono)',
        movements: {
          create: {
            tenantId: tenant.id,
            operatorName: 'Carlos Oliveira (Dono)',
            type: 'opening',
            amount: 150.0,
            reason: 'Fundo de troco inicial',
          },
        },
      },
    });
    console.log('💵 Caixa inicial aberto com R$ 150,00 de fundo');
  }

  const existingProducts = await prisma.product.count({
    where: { tenantId: tenant.id },
  });

  if (existingProducts === 0) {
    for (const p of defaultProducts) {
      await prisma.product.create({
        data: {
          ...p,
          tenantId: tenant.id,
        },
      });
    }
    console.log(`📦 Cadastrados ${defaultProducts.length} produtos brasileiros padrão`);
  } else {
    console.log('📦 Produtos já existem, mantendo catálogo atual...');
  }

  console.log('✅ Seed finalizado com sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
