import React from 'react';
import { 
  ShoppingCart, 
  Package, 
  BarChart3, 
  Settings, 
  User as UserIcon, 
  Lock, 
  LogOut,
  RefreshCw,
  Store,
} from 'lucide-react';
import { Product, StoreSettings, User, CashRegisterState } from '../types';
import { auth } from '../services/auth';

interface HeaderProps {
  activeTab: 'pos' | 'inventory' | 'reports' | 'settings';
  setActiveTab: (tab: 'pos' | 'inventory' | 'reports' | 'settings') => void;
  products: Product[];
  settings: StoreSettings;
  currentUser: User;
  cashRegister: CashRegisterState;
  onOpenSwitchUser: () => void;
  onOpenCashMovement: () => void;
  onOpenRemoteMonitor: () => void;
  onLogout: () => void;
  onRefreshData: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  products,
  settings,
  currentUser,
  cashRegister,
  onOpenSwitchUser,
  onOpenCashMovement,
  onOpenRemoteMonitor,
  onLogout,
  onRefreshData,
}) => {
  const lowStockCount = products.filter((p) => p.stock <= p.minStock).length;
  const canAccessReports = auth.canAccessReports(currentUser);
  const canAccessSettings = auth.canManageSettings(currentUser);

  return (
    <header className="bg-slate-900/95 backdrop-blur-md text-white border-b border-slate-800/80 sticky top-0 z-30 shadow-lg">
      <div className="max-w-[1600px] mx-auto px-3 sm:px-5">
        <div className="flex items-center justify-between h-15">
          
          {/* BRAND & CASH STATUS */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/20">
                <Store className="w-5 h-5 text-slate-950 font-black" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white leading-tight">
                  {settings.storeName || 'PDV Camaleão'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium hidden md:block">
                  Ponto de Venda Ágil
                </span>
              </div>
            </div>

            {/* Quick Cash Register Pill */}
            <button
              onClick={onOpenCashMovement}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all ${
                cashRegister.isOpen
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
              }`}
              title="Clique para Sangria, Suprimento ou Fechamento de Caixa"
            >
              <span className={`w-2 h-2 rounded-full ${cashRegister.isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span>{cashRegister.isOpen ? 'Caixa Aberto' : 'Caixa Fechado'}</span>
              <span className="text-[10px] text-slate-400 font-mono hidden lg:inline">
                (R$ {cashRegister.currentBalance.toFixed(2).replace('.', ',')})
              </span>
            </button>
          </div>

          {/* CLEAN CENTER NAVIGATION (Pill Style) */}
          <nav className="flex items-center bg-slate-950/80 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab('pos')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'pos'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Frente de Caixa</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all relative ${
                activeTab === 'inventory'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Estoque</span>
              {lowStockCount > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 ring-2 ring-slate-900 ml-0.5" />
              )}
            </button>

            {canAccessReports && (
              <button
                onClick={() => setActiveTab('reports')}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'reports'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Relatórios</span>
              </button>
            )}

            {canAccessSettings && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === 'settings'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                    : 'text-slate-400 hover:text-white'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Ajustes</span>
            </button>
          )}
          </nav>

          {/* RIGHT CONTROLS */}
          <div className="flex items-center space-x-2 sm:space-x-2.5">
            
            {/* Refresh Data */}
            <button
              onClick={onRefreshData}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all"
              title="Atualizar dados"
            >
              <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden xl:inline text-[11px]">Atualizar</span>
            </button>

            {/* Active User Pill */}
            <button
              onClick={onOpenSwitchUser}
              className="flex items-center space-x-2 p-1.5 sm:px-2.5 sm:py-1 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 transition-all text-left group"
              title="Clique para trocar de operador ou bloquear com PIN"
            >
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 font-black text-xs flex items-center justify-center">
                {currentUser.name[0]}
              </div>
              <div className="hidden sm:block">
                <div className="text-xs font-bold text-slate-200 leading-tight">
                  {currentUser.name.split(' ')[0]}
                </div>
                <div className="text-[9px] font-extrabold uppercase text-emerald-400">
                  {currentUser.role === 'admin' ? 'Dono' : currentUser.role === 'manager' ? 'Gerente' : 'Caixa'}
                </div>
              </div>
              <Lock className="w-3 h-3 text-slate-400 group-hover:text-amber-400 transition-colors ml-1" />
            </button>

            {/* Logout */}
            <button
              onClick={onLogout}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800/60 hover:bg-rose-500/20 border border-slate-700 hover:border-rose-500/30 text-slate-400 hover:text-rose-300 text-xs font-semibold transition-all"
              title="Sair do sistema"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Sair</span>
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
