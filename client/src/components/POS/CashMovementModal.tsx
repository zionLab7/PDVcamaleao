import React, { useState } from 'react';
import { X, ArrowDownRight, ArrowUpRight, DollarSign, Lock, Unlock, ShieldAlert, Loader2 } from 'lucide-react';
import { CashRegisterState, User } from '../../types';
import * as api from '../../services/api';
import { sound } from '../../services/audio';

interface CashMovementModalProps {
  cashRegister: CashRegisterState;
  currentUser: User;
  onClose: () => void;
}

export const CashMovementModal: React.FC<CashMovementModalProps> = ({
  cashRegister,
  currentUser,
  onClose,
}) => {
  const [tab, setTab] = useState<'sangria' | 'suprimento' | 'fechamento' | 'abertura'>('sangria');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [loading, setLoading] = useState(false);

  const isOperator = currentUser.role === 'cashier';

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');

    const parsedAmount = parseFloat(amount.replace(',', '.'));
    if (tab !== 'fechamento' && (isNaN(parsedAmount) || parsedAmount <= 0)) {
      alert('Informe um valor válido maior que zero.');
      return;
    }

    setLoading(true);

    try {
      // If operator is doing sangria or closing, verify supervisor PIN via API
      if (isOperator && (tab === 'sangria' || tab === 'fechamento')) {
        const verified = await api.supervisor.verifyPin(supervisorPin).catch(() => ({ valid: false }));
        if (!verified.valid) {
          sound.playAlert();
          setPinError('PIN de Gerente/Dono incorreto para autorizar a operação.');
          setLoading(false);
          return;
        }
      }

      if (tab === 'sangria') {
        if (parsedAmount > cashRegister.currentBalance) {
          sound.playAlert();
          alert('Valor de sangria maior do que o saldo atual da gaveta!');
          setLoading(false);
          return;
        }
        await api.cashRegister.addMovement({
          type: 'outflow',
          amount: parsedAmount,
          reason: reason || 'Sangria de Caixa / Recolhimento',
        });
        sound.playSuccess();
        alert(`Sangria de R$ ${parsedAmount.toFixed(2).replace('.', ',')} realizada com sucesso!`);
        onClose();
      } else if (tab === 'suprimento') {
        await api.cashRegister.addMovement({
          type: 'inflow',
          amount: parsedAmount,
          reason: reason || 'Suprimento de Caixa / Entrada de Troco',
        });
        sound.playSuccess();
        alert(`Suprimento de R$ ${parsedAmount.toFixed(2).replace('.', ',')} adicionado ao caixa!`);
        onClose();
      } else if (tab === 'abertura') {
        await api.cashRegister.open(parsedAmount);
        sound.playSuccess();
        alert('Caixa aberto com sucesso!');
        onClose();
      } else if (tab === 'fechamento') {
        await api.cashRegister.close();
        sound.playSuccess();
        alert('Caixa fechado com sucesso!');
        onClose();
      }
    } catch (err: any) {
      sound.playAlert();
      alert(err.message || 'Erro ao processar movimentação de caixa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-base">Movimentação da Gaveta</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Drawer Status */}
        <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-500 font-bold">Saldo Atual em Dinheiro</div>
            <div className="text-2xl font-black text-slate-900">
              R$ {cashRegister.currentBalance.toFixed(2).replace('.', ',')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500 font-bold">Situação</div>
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-black uppercase ${
              cashRegister.isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {cashRegister.isOpen ? 'Caixa Aberto' : 'Caixa Fechado'}
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 p-1 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setTab('sangria')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              tab === 'sangria' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Sangria (Retirada)
          </button>
          <button
            type="button"
            onClick={() => setTab('suprimento')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              tab === 'suprimento' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Suprimento (Entrada)
          </button>
          <button
            type="button"
            onClick={() => setTab(cashRegister.isOpen ? 'fechamento' : 'abertura')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              tab === 'fechamento' || tab === 'abertura' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {cashRegister.isOpen ? 'Fechamento' : 'Abertura'}
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleAction} className="p-5 space-y-4">
          
          {tab !== 'fechamento' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {tab === 'abertura' ? 'Valor do Fundo de Troco Inicial:' : 'Valor (R$):'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400">R$</span>
                <input
                  type="text"
                  autoFocus
                  placeholder="0,00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-lg font-black text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          )}

          {tab !== 'abertura' && tab !== 'fechamento' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Motivo / Justificativa:
              </label>
              <input
                type="text"
                placeholder={tab === 'sangria' ? 'Ex: Pagamento de fornecedor de pães' : 'Ex: Troco de moedas'}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          )}

          {/* Supervisor PIN for operators */}
          {isOperator && (tab === 'sangria' || tab === 'fechamento') && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="flex items-center space-x-1.5 text-amber-800 text-xs font-black mb-1.5">
                <ShieldAlert className="w-4 h-4" />
                <span>Autorização Necessária (Gerente/Dono)</span>
              </div>
              <p className="text-[11px] text-amber-700 mb-2">
                Esta operação requer validação de PIN de um supervisor.
              </p>
              <input
                type="password"
                maxLength={4}
                placeholder="PIN do Supervisor"
                value={supervisorPin}
                onChange={(e) => {
                  setSupervisorPin(e.target.value.replace(/\D/g, ''));
                  setPinError('');
                }}
                className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs text-slate-900 font-mono text-center tracking-widest focus:ring-2 focus:ring-amber-500 focus:outline-none"
              />
              {pinError && (
                <div className="text-[10px] text-rose-600 font-bold mt-1">{pinError}</div>
              )}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-98 flex items-center justify-center space-x-2 ${
                tab === 'sangria'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : tab === 'suprimento'
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>
                  {tab === 'sangria' && 'Confirmar Sangria de Caixa'}
                  {tab === 'suprimento' && 'Confirmar Suprimento'}
                  {tab === 'abertura' && 'Confirmar Abertura de Caixa'}
                  {tab === 'fechamento' && 'Confirmar Fechamento de Caixa'}
                </span>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
