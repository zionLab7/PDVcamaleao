import React, { useState, useEffect } from 'react';
import { 
  Smartphone, 
  X, 
  Copy, 
  Check, 
  ExternalLink, 
  TrendingUp, 
  DollarSign, 
  Clock, 
  AlertTriangle, 
  ShieldCheck, 
  ShieldAlert,
  RefreshCw, 
  Sparkles, 
  DownloadCloud,
  Lock,
  KeyRound
} from 'lucide-react';
import QRCode from 'qrcode';
import { Sale, Product, CashRegisterState, StoreSettings, User } from '../../types';
import { sound } from '../../services/audio';
import { auth } from '../../services/auth';
import * as api from '../../services/api';

interface RemoteMonitorModalProps {
  sales: Sale[];
  products: Product[];
  cashRegister: CashRegisterState;
  settings: StoreSettings;
  currentUser: User;
  onClose: () => void;
}

export const RemoteMonitorModal: React.FC<RemoteMonitorModalProps> = ({
  sales,
  products,
  cashRegister,
  settings,
  currentUser,
  onClose,
}) => {
  // If user is not admin, require Admin PIN verification
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(currentUser.role === 'admin');
  const [adminPin, setAdminPin] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  const [copied, setCopied] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);

  // Generate private link with store ID
  const remoteUrl = `https://pdvcamaleao.app/gestao?loja=${settings.cloudStoreId || 'loja_01'}&token=tok_live_${(settings.cloudStoreId || 'demo').slice(0, 6)}`;

  useEffect(() => {
    if (isAuthenticated) {
      QRCode.toDataURL(remoteUrl, { width: 220, margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
        .then((url) => setQrCodeDataUrl(url))
        .catch(() => {});
    }
  }, [remoteUrl, isAuthenticated]);

  const handleVerifyAdminPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    try {
      const supervisorCheck = await api.supervisor.verifyPin(adminPin);
      if (supervisorCheck.valid && supervisorCheck.supervisor?.role === 'admin') {
        sound.playSuccess();
        setIsAuthenticated(true);
      } else {
        sound.playAlert();
        setAuthError('PIN de Administrador incorreto. Acesso restrito ao dono da loja.');
        setAdminPin('');
      }
    } catch {
      sound.playAlert();
      setAuthError('PIN de Administrador incorreto. Acesso restrito ao dono da loja.');
      setAdminPin('');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(remoteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Today metrics
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const todaySales = sales.filter((s) => s.timestamp >= startOfToday && s.status !== 'cancelled');
  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const todayPix = todaySales
    .flatMap((s) => s.payments)
    .filter((p) => p.method === 'pix')
    .reduce((sum, p) => sum + p.amount, 0);

  // Remote updates simulation
  const handleCheckUpdate = () => {
    setCheckingUpdate(true);
    setTimeout(() => {
      setCheckingUpdate(false);
      setUpdateAvailable(true);
      sound.playSuccess();
    }, 1000);
  };

  const handleApplyRemoteUpdate = () => {
    setUpdating(true);
    setTimeout(() => {
      setUpdating(false);
      setUpdateAvailable(false);
      sound.playSuccess();
      alert('Sistema atualizado com sucesso para a versão mais recente! Dados e estoque preservados.');
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                Painel Remoto & Atualizações na Nuvem
              </h3>
              <p className="text-[11px] text-slate-400">
                Acompanhamento exclusivo do proprietário pelo celular
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* SECURITY GATE: If not authenticated, require Admin PIN */}
        {!isAuthenticated ? (
          <div className="p-6 sm:p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-3">
              <Lock className="w-7 h-7" />
            </div>
            
            <h4 className="text-base font-black text-slate-900 mb-1">
              Acesso Exclusivo do Dono da Loja
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mb-5">
              O QR Code e o link de acompanhamento remoto transmitem faturamento confidencial e só podem ser visualizados pelo Administrador.
            </p>

            <form onSubmit={handleVerifyAdminPin} className="w-full max-w-xs space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Digite o PIN do Administrador (Dono):
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="••••"
                  className="w-full p-3 bg-slate-50 border-2 border-slate-300 rounded-2xl text-center text-2xl font-black font-mono tracking-widest outline-none focus:border-emerald-500"
                  autoFocus
                />
              </div>

              {authError && (
                <div className="text-xs font-bold text-rose-600 flex items-center justify-center space-x-1">
                  <ShieldAlert className="w-4 h-4" />
                  <span>{authError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center justify-center space-x-1.5"
              >
                <KeyRound className="w-4 h-4 text-emerald-400" />
                <span>Desbloquear Acesso Remoto</span>
              </button>
            </form>
          </div>
        ) : (
          /* UNLOCKED CONTENT (Visible ONLY to verified Admin/Owner) */
          <div className="p-5 sm:p-6 overflow-y-auto space-y-5">
            
            {/* Top notification pill */}
            <div className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 text-xs font-bold flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-purple-600" />
                <span>Autenticado como Administrador (Dono)</span>
              </div>
              <span className="text-[10px] text-purple-700 font-mono">ID: {settings.cloudStoreId}</span>
            </div>

            {/* QR Code and Instructions */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-center gap-4">
              {qrCodeDataUrl ? (
                <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm flex-shrink-0">
                  <img src={qrCodeDataUrl} alt="QR Code Acesso Remoto" className="w-32 h-32" />
                </div>
              ) : (
                <div className="w-32 h-32 bg-white rounded-2xl flex items-center justify-center text-xs text-slate-400">
                  Gerando...
                </div>
              )}

              <div className="space-y-2 text-center sm:text-left flex-1">
                <h4 className="font-extrabold text-slate-900 text-sm">
                  Aponte a câmera do seu celular para acompanhar o caixa
                </h4>
                <p className="text-xs text-slate-500">
                  Acesse pelo smartphone de onde você estiver para verificar faturamento ao vivo, sangrias e alertas de reposição.
                </p>

                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-xl text-xs font-bold text-slate-800 shadow-sm transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Link Copiado!' : 'Copiar Link de Acesso'}</span>
                </button>
              </div>
            </div>

            {/* Realtime Numbers Preview */}
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-2">
                Resumo Atual da Loja (Ao Vivo)
              </span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 bg-slate-900 text-white rounded-2xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Faturamento</span>
                  <div className="text-base font-black text-emerald-400 font-mono">
                    R$ {todayRevenue.toFixed(2).replace('.', ',')}
                  </div>
                </div>
                <div className="p-3 bg-slate-900 text-white rounded-2xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Gaveta</span>
                  <div className="text-base font-black text-white font-mono">
                    R$ {cashRegister.currentBalance.toFixed(2).replace('.', ',')}
                  </div>
                </div>
                <div className="p-3 bg-slate-900 text-white rounded-2xl">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">PIX Direto</span>
                  <div className="text-base font-black text-teal-400 font-mono">
                    R$ {todayPix.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              </div>
            </div>

            {/* Remote Software Updates (No physical visit required) */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <DownloadCloud className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-800">
                    Atualizações Sem Visita Presencial (v{settings.appVersion})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckUpdate}
                  disabled={checkingUpdate || updating}
                  className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-700 shadow-sm flex items-center space-x-1"
                >
                  <RefreshCw className={`w-3 h-3 ${checkingUpdate ? 'animate-spin text-emerald-600' : ''}`} />
                  <span>{checkingUpdate ? 'Verificando...' : 'Buscar Atualização'}</span>
                </button>
              </div>

              {updateAvailable && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between animate-fade-in">
                  <span className="text-xs font-bold text-emerald-900">
                    Nova versão 1.2.1 pronta na nuvem!
                  </span>
                  <button
                    type="button"
                    onClick={handleApplyRemoteUpdate}
                    disabled={updating}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow"
                  >
                    {updating ? 'Instalando...' : 'Atualizar Agora'}
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
};
