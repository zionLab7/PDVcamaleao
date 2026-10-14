import React from 'react';
import { createRoot } from 'react-dom/client';
import { ReceiptModal } from '../../src/components/POS/ReceiptModal';
import type { Sale, StoreSettings } from '../../src/types';
import '../../src/index.css';

const params = new URLSearchParams(location.search);
const count = Number(params.get('items') || 1);
const fiscal = params.get('fiscal') === 'true';
const settings: StoreSettings = {
  storeName: 'GP DISTRIBUIDORA', tradeName: 'Loja de teste',
  document: '00.000.000/0001-00', phone: '(11) 99999-9999',
  address: 'Rua de teste com endereço bastante longo, 1234', city: 'São Paulo - SP',
  receiptWidth: params.get('width') === '80mm' ? '80mm' : '58mm',
  receiptFooter: 'Obrigado pela preferência! Volte sempre!',
  pixKey: '', pixReceiver: '', pixCity: '', enableSound: false,
  cloudSyncEnabled: false, cloudStoreId: '', cloudApiKey: '', appVersion: 'test',
};
const sale: Sale = {
  id: 'test', sequenceNumber: 123, timestamp: Date.UTC(2026, 9, 10, 12),
  items: Array.from({ length: count }, (_, i) => ({
    product: {
      id: String(i), barcode: '7890000000000',
      name: `PRODUTO ${i + 1} ÁGUA SANITÁRIA COM CLORO ATIVO 5 LITROS EMBALAGEM ECONÔMICA`,
      category: 'Teste', costPrice: 5, sellPrice: 10, stock: 100,
      minStock: 1, unit: 'UN', ncm: '12345678', createdAt: 0, updatedAt: 0,
    }, quantity: 2, unitPrice: 10, discount: 0, total: 20,
  })),
  subtotal: count * 20, discount: 1, total: count * 20 - 1,
  payments: [{ method: 'dinheiro', amount: count * 20 + 5 }],
  amountPaid: count * 20 + 5, change: 6,
  operatorId: 'test', operatorName: 'Operador com nome muito longo',
  customerName: 'Cliente com nome bastante longo', customerCpf: '000.000.000-00',
  status: 'completed', synced: true,
  fiscalStatus: fiscal ? 'authorized' : 'none',
  nfceNumber: fiscal ? 123 : undefined, nfceSeries: 1,
  nfceAccessKey: fiscal ? '12345678901234567890123456789012345678901234' : undefined,
  nfceProtocol: fiscal ? '123456789012345' : undefined,
  nfceQrCodeUrl: fiscal ? 'https://example.com/nfce?chave=12345678901234567890123456789012345678901234' : undefined,
};
createRoot(document.getElementById('root')!).render(
  <ReceiptModal sale={sale} settings={settings} onClose={() => {}} onNewSale={() => {
    document.body.dataset.newSales = String(Number(document.body.dataset.newSales || 0) + 1);
  }} />
);
