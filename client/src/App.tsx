import React, { useState, useEffect, useCallback } from 'react';
import { LoginPage } from './pages/LoginPage';
import { Header } from './components/Header';
import { POSView } from './components/POS/POSView';
import { PaymentModal } from './components/POS/PaymentModal';
import { ReceiptModal } from './components/POS/ReceiptModal';
import { PriceCheckModal } from './components/POS/PriceCheckModal';
import { CashMovementModal } from './components/POS/CashMovementModal';
import { InventoryView } from './components/Inventory/InventoryView';
import { ProductFormModal } from './components/Inventory/ProductFormModal';
import { ReportsView } from './components/Reports/ReportsView';
import { RemoteMonitorModal } from './components/Remote/RemoteMonitorModal';
import { UsersModal } from './components/Users/UsersModal';
import { SettingsView } from './components/Settings/SettingsView';

import { Product, Sale, CartItem, PaymentDetail, StoreSettings, User, CashRegisterState } from './types';
import * as api from './services/api';
import { sound } from './services/audio';

type AppScreen = 'login' | 'operator' | 'app';

export const App: React.FC = () => {
  // Auth state
  const [screen, setScreen] = useState<AppScreen>(() =>
    api.isAuthenticated() ? (api.getOperator() ? 'app' : 'operator') : 'login'
  );

  // Navigation
  const [activeTab, setActiveTab] = useState<'pos' | 'inventory' | 'reports' | 'settings'>('pos');

  // Application Data States
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [cashRegister, setCashRegister] = useState<CashRegisterState>({
    isOpen: false,
    initialAmount: 0,
    currentBalance: 0,
    movements: [],
  });
  const [settings, setSettings] = useState<StoreSettings>({
    storeName: 'PDV Camaleão',
    tradeName: '',
    document: '',
    phone: '',
    address: '',
    city: '',
    pixKey: '',
    pixReceiver: '',
    pixCity: '',
    receiptWidth: '80mm',
    receiptFooter: '',
    enableSound: true,
    cloudSyncEnabled: false,
    cloudStoreId: '',
    cloudApiKey: '',
    appVersion: '2.0.0',
  });
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Checkout & Sale Modals
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [pendingCartItems, setPendingCartItems] = useState<CartItem[]>([]);
  const [pendingDiscount, setPendingDiscount] = useState(0);

  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [activeReceiptSale, setActiveReceiptSale] = useState<Sale | null>(null);

  // Aux Modals
  const [priceCheckModalOpen, setPriceCheckModalOpen] = useState(false);
  const [cashMovementModalOpen, setCashMovementModalOpen] = useState(false);
  const [remoteMonitorModalOpen, setRemoteMonitorModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);

  // Product Form Modal
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productToEdit, setProductToEdit] = useState<Product | null>(null);

  // ─── Data Loading ──────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    if (screen !== 'app') return;

    try {
      const [productsData, salesData, cashData, settingsData, usersData] = await Promise.all([
        api.products.list(),
        api.sales.list(),
        api.cashRegister.get(),
        api.settings.get(),
        api.users.list(),
      ]);

      setProducts(productsData || []);
      setSales(salesData || []);
      if (cashData) setCashRegister(cashData);
      if (settingsData) {
        setSettings((prev) => ({ ...prev, ...settingsData }));
      }
      setAllUsers(usersData || []);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    }
  }, [screen]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update sound service based on settings
  useEffect(() => {
    sound.enabled = settings.enableSound;
  }, [settings]);

  // Restore operator from localStorage on mount
  useEffect(() => {
    const op = api.getOperator();
    if (op && screen === 'app') {
      setCurrentUser(op);
    }
  }, [screen]);

  // ─── Auth Handlers ─────────────────────────────────────────────────

  const handleLoginSuccess = () => {
    setScreen('operator');
  };

  const handleOperatorSelected = (user: User) => {
    setCurrentUser(user);
    api.setOperator(user);
    setScreen('app');
    // Data will load via useEffect
  };

  const handleLogout = () => {
    api.clearTokens();
    setScreen('login');
    setCurrentUser(null);
    setProducts([]);
    setSales([]);
    setActiveTab('pos');
  };

  const handleSwitchOperator = () => {
    setUsersModalOpen(true);
  };

  // ─── Sale Handlers ─────────────────────────────────────────────────

  const handleInitiatePayment = (items: CartItem[], discount: number) => {
    setPendingCartItems(items);
    setPendingDiscount(discount);
    setPaymentModalOpen(true);
  };

  const handlePaymentSuccess = async (
    payments: PaymentDetail[],
    amountPaid: number,
    change: number,
    customerName?: string,
    customerCpf?: string
  ) => {
    if (!currentUser) return;

    const subtotal = pendingCartItems.reduce((acc, i) => acc + i.total, 0);
    const finalTotal = Math.max(0, subtotal - pendingDiscount);

    try {
      const newSale = await api.sales.create({
        items: pendingCartItems.map((item) => ({
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: item.discount,
          total: item.total,
        })),
        subtotal,
        discount: pendingDiscount,
        total: finalTotal,
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          details: p.details,
        })),
        amountPaid,
        change,
        customerName,
        customerCpf,
      });

      setPaymentModalOpen(false);
      setActiveReceiptSale(newSale);
      setReceiptModalOpen(true);

      // Reload data to reflect updated stock and cash
      loadData();
    } catch (err: any) {
      alert(`Erro ao registrar venda: ${err.message}`);
    }
  };

  const handleNewSale = () => {
    setReceiptModalOpen(false);
    setActiveReceiptSale(null);
    setPendingCartItems([]);
    setPendingDiscount(0);
    setActiveTab('pos');
  };

  // ─── Computed Values ───────────────────────────────────────────────

  const subtotal = pendingCartItems.reduce((acc, i) => acc + i.total, 0);
  const finalTotal = Math.max(0, subtotal - pendingDiscount);

  // ─── Render ────────────────────────────────────────────────────────

  // Screen: Login
  if (screen === 'login') {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Screen: Operator Selection (PIN)
  if (screen === 'operator' || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <UsersModal
          currentUser={currentUser}
          onClose={() => {
            // If no operator selected yet, go back to login
            if (!currentUser) handleLogout();
          }}
          onUserChanged={handleOperatorSelected}
          embedded={true}
        />
      </div>
    );
  }

  // Screen: Main App
  return (
    <div className="min-h-screen flex flex-col bg-slate-100 text-slate-900 select-none">
      
      {/* Header Bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        products={products}
        settings={settings}
        currentUser={currentUser}
        cashRegister={cashRegister}
        onOpenSwitchUser={handleSwitchOperator}
        onOpenCashMovement={() => setCashMovementModalOpen(true)}
        onOpenRemoteMonitor={() => setRemoteMonitorModalOpen(true)}
        onLogout={handleLogout}
        onRefreshData={loadData}
      />

      {/* Main Tab View */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {activeTab === 'pos' && (
          <POSView
            products={products}
            currentUser={currentUser}
            cashRegister={cashRegister}
            onFinalizeSale={handleInitiatePayment}
            onOpenPriceCheck={() => setPriceCheckModalOpen(true)}
            onOpenCashMovement={() => setCashMovementModalOpen(true)}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            products={products}
            currentUser={currentUser}
            onOpenNewProduct={() => {
              setProductToEdit(null);
              setProductFormOpen(true);
            }}
            onEditProduct={(prod) => {
              setProductToEdit(prod);
              setProductFormOpen(true);
            }}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            sales={sales}
            currentUser={currentUser}
            settings={settings}
            onReprintReceipt={(sale) => {
              setActiveReceiptSale(sale);
              setReceiptModalOpen(true);
            }}
            onRefresh={loadData}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSettingsSaved={(updated) => setSettings(updated)}
            onOpenRemoteMonitor={() => setRemoteMonitorModalOpen(true)}
          />
        )}
      </main>

      {/* Payment Modal (F4) */}
      {paymentModalOpen && (
        <PaymentModal
          items={pendingCartItems}
          subtotal={subtotal}
          discount={pendingDiscount}
          total={finalTotal}
          settings={settings}
          onClose={() => setPaymentModalOpen(false)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}

      {/* Receipt / Thermal Cupom Modal */}
      {receiptModalOpen && activeReceiptSale && (
        <ReceiptModal
          sale={activeReceiptSale}
          settings={settings}
          onClose={() => setReceiptModalOpen(false)}
          onNewSale={handleNewSale}
        />
      )}

      {/* Price Check Modal (F7) */}
      {priceCheckModalOpen && (
        <PriceCheckModal
          products={products}
          onClose={() => setPriceCheckModalOpen(false)}
        />
      )}

      {/* Cash Movement (Sangria, Suprimento, Abertura, Fechamento) */}
      {cashMovementModalOpen && (
        <CashMovementModal
          cashRegister={cashRegister}
          currentUser={currentUser}
          onClose={() => {
            setCashMovementModalOpen(false);
            loadData(); // Reload after cash movement
          }}
        />
      )}

      {/* Remote Monitor Modal (Protected with Admin PIN) */}
      {remoteMonitorModalOpen && (
        <RemoteMonitorModal
          sales={sales}
          products={products}
          cashRegister={cashRegister}
          settings={settings}
          currentUser={currentUser}
          onClose={() => setRemoteMonitorModalOpen(false)}
        />
      )}

      {/* User Switch & Management Modal (Strict PIN Protected) */}
      {usersModalOpen && (
        <UsersModal
          currentUser={currentUser}
          onClose={() => setUsersModalOpen(false)}
          onUserChanged={(u) => {
            setCurrentUser(u);
            api.setOperator(u);
          }}
        />
      )}

      {/* Product Form Modal */}
      {productFormOpen && (
        <ProductFormModal
          productToEdit={productToEdit}
          onClose={() => {
            setProductFormOpen(false);
            setProductToEdit(null);
          }}
          onSaved={() => {
            setProductFormOpen(false);
            setProductToEdit(null);
            loadData(); // Reload products
          }}
        />
      )}

    </div>
  );
};
