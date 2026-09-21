export type UserRole = 'admin' | 'manager' | 'cashier';

export interface User {
  id: string;
  name: string;
  username: string;
  pin: string; // 4-digit fast pin for cashier change
  role: UserRole;
  createdAt: number;
}

export type UnitType = 'UN' | 'KG' | 'LT' | 'PC' | 'CX';

export interface Product {
  id: string;
  barcode: string;
  name: string;
  category: string;
  costPrice: number;
  sellPrice: number;
  stock: number;
  minStock: number;
  unit: UnitType;
  quickAccess?: boolean;
  color?: string;
  ncm?: string;
  cest?: string;
  cfop?: string;
  origin?: string;
  csosn?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export type PaymentMethod = 'dinheiro' | 'pix' | 'debito' | 'credito' | 'fiado' | 'multiplo';

export interface PaymentDetail {
  method: PaymentMethod;
  amount: number;
  details?: {
    receivedAmount?: number;
    change?: number;
    customerName?: string;
    customerPhone?: string;
    cardBrand?: string;
    installments?: number;
  };
}

export interface Sale {
  id: string;
  sequenceNumber: number;
  timestamp: number;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  payments: PaymentDetail[];
  amountPaid: number;
  change: number;
  operatorId: string;
  operatorName: string;
  customerName?: string;
  customerCpf?: string;
  status: 'completed' | 'cancelled';
  fiscalStatus?: 'none' | 'pending' | 'authorized' | 'rejected' | 'cancelled';
  nfceNumber?: number;
  nfceSeries?: number;
  nfceAccessKey?: string;
  nfceProtocol?: string;
  nfceQrCodeUrl?: string;
  nfceError?: string;
  nfceIssuedAt?: string;
  cancelledAt?: number;
  cancelledBy?: string;
  synced: boolean;
}

export interface CashMovement {
  id: string;
  timestamp: number;
  type: 'opening' | 'inflow' | 'outflow' | 'closing'; // Abertura, Suprimento, Sangria, Fechamento
  amount: number;
  reason: string;
  operatorId: string;
  operatorName: string;
}

export interface CashRegisterState {
  isOpen: boolean;
  openedAt?: number;
  openedBy?: string;
  initialAmount: number;
  currentBalance: number;
  movements: CashMovement[];
}

export interface StoreSettings {
  storeName: string;
  tradeName: string;
  document: string; // CNPJ / CPF
  phone: string;
  address: string;
  city: string;
  pixKey: string;
  pixReceiver: string;
  pixCity: string;
  receiptWidth: '58mm' | '80mm';
  receiptFooter: string;
  enableSound: boolean;
  
  // Fiscal / NFC-e
  enableNfce?: boolean;
  fiscalEnvironment?: 'homologacao' | 'producao';
  stateUf?: string;
  stateRegistration?: string;
  taxRegime?: string;
  cscId?: string;
  cscToken?: string;
  certificateOwner?: string;
  certificateExpiresAt?: string;
  nfceSeries?: number;
  lastNfceNumber?: number;

  cloudSyncEnabled: boolean;
  cloudStoreId: string;
  cloudApiKey: string;
  appVersion: string;
}

export interface CloudSyncStatus {
  online: boolean;
  lastSyncTime: number | null;
  pendingCount: number;
  syncing: boolean;
  lastError?: string;
}
