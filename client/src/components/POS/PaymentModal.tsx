import React, { useState, useEffect } from 'react';
import { 
  X, 
  Banknote, 
  QrCode, 
  CreditCard, 
  CalendarClock, 
  CheckCircle2, 
  Copy, 
  Check, 
  Layers, 
  ArrowRight,
  UserCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { CartItem, PaymentMethod, PaymentDetail, StoreSettings } from '../../types';
import { generatePixPayload, generatePixQrCodeDataUrl } from '../../services/pix';
import { sound } from '../../services/audio';

interface PaymentModalProps {
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  settings: StoreSettings;
  onClose: () => void;
  onPaymentSuccess: (payments: PaymentDetail[], amountPaid: number, change: number, customerName?: string, customerCpf?: string) => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  items,
  subtotal,
  discount,
  total,
  settings,
  onClose,
  onPaymentSuccess,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('dinheiro');
  
  // Cash details
  const [cashReceived, setCashReceived] = useState<string>(total.toFixed(2));
  
  // PIX details
  const [pixQrCodeUrl, setPixQrCodeUrl] = useState<string>('');
  const [pixPayload, setPixPayload] = useState<string>('');
  const [pixCopied, setPixCopied] = useState(false);

  // Card details
  const [cardBrand, setCardBrand] = useState('Mastercard');
  const [installments, setInstallments] = useState<number>(1);

  // Fiado details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerCpf, setCustomerCpf] = useState('');

  // Split / Multi payment details
  const [splitMethod1, setSplitMethod1] = useState<PaymentMethod>('dinheiro');
  const [splitAmount1, setSplitAmount1] = useState<string>((total / 2).toFixed(2));
  const [splitMethod2, setSplitMethod2] = useState<PaymentMethod>('pix');

  // Generate PIX QR Code whenever total or PIX is active
  useEffect(() => {
    if (selectedMethod === 'pix' || selectedMethod === 'multiplo') {
      const payload = generatePixPayload({
        pixKey: settings.pixKey || '12345678000190',
        merchantName: settings.pixReceiver || settings.storeName,
        merchantCity: settings.pixCity || 'BRASIL',
        amount: selectedMethod === 'multiplo' ? parseFloat(splitAmount1) || total : total,
      });
      setPixPayload(payload);
      generatePixQrCodeDataUrl(payload).then((url) => setPixQrCodeUrl(url));
    }
  }, [selectedMethod, total, settings, splitAmount1]);

  // Cash change calculation
  const parsedCashReceived = parseFloat(cashReceived.replace(',', '.')) || 0;
  const cashChange = Math.max(0, Number((parsedCashReceived - total).toFixed(2)));
  const cashMissing = Math.max(0, Number((total - parsedCashReceived).toFixed(2)));

  // Copy PIX string to clipboard
  const handleCopyPix = () => {
    if (pixPayload) {
      navigator.clipboard.writeText(pixPayload);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    }
  };

  // Quick cash bill buttons helper
  const addQuickCash = (amount: number) => {
    setCashReceived(amount.toFixed(2));
  };

  // Submit payment
  const handleFinalize = () => {
    let payments: PaymentDetail[] = [];
    let paid = total;
    let change = 0;

    if (selectedMethod === 'dinheiro') {
      if (parsedCashReceived < total) {
        sound.playAlert();
        alert('O valor recebido é menor do que o total da venda!');
        return;
      }
      paid = parsedCashReceived;
      change = cashChange;
      payments = [
        {
          method: 'dinheiro',
          amount: total,
          details: {
            receivedAmount: parsedCashReceived,
            change: cashChange,
          },
        },
      ];
    } else if (selectedMethod === 'pix') {
      payments = [
        {
          method: 'pix',
          amount: total,
        },
      ];
    } else if (selectedMethod === 'debito' || selectedMethod === 'credito') {
      payments = [
        {
          method: selectedMethod,
          amount: total,
          details: {
            cardBrand,
            installments: selectedMethod === 'credito' ? installments : 1,
          },
        },
      ];
    } else if (selectedMethod === 'fiado') {
      if (!customerName.trim()) {
        sound.playAlert();
        alert('Informe o nome do cliente para registrar a venda no fiado/a prazo.');
        return;
      }
      payments = [
        {
          method: 'fiado',
          amount: total,
          details: {
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
          },
        },
      ];
    } else if (selectedMethod === 'multiplo') {
      const amt1 = parseFloat(splitAmount1.replace(',', '.')) || 0;
      const amt2 = Number((total - amt1).toFixed(2));
      if (amt1 <= 0 || amt2 <= 0) {
        sound.playAlert();
        alert('Os valores divididos precisam ser maiores que zero!');
        return;
      }
      payments = [
        { method: splitMethod1, amount: amt1 },
        { method: splitMethod2, amount: amt2 },
      ];
    }

    // Sound & celebratory effect
    sound.playSuccess();
    try {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 },
      });
    } catch {
      // Ignore
    }

    onPaymentSuccess(
      payments,
      paid,
      change,
      customerName.trim() || undefined,
      customerCpf.trim().replace(/\D/g, '') || undefined
    );
  };

  // Keyboard shortcut inside modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col md:flex-row my-auto max-h-[95vh]">
        
        {/* LEFT COLUMN: Payment Methods Selector & Summary */}
        <div className="w-full md:w-80 bg-slate-900 text-white p-5 flex flex-col justify-between border-b md:border-b-0 md:border-r border-slate-800">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Resumo da Cobrança
              </span>
              <span className="text-xs font-mono text-emerald-400 font-bold">
                {items.length} itens
              </span>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-emerald-500/30 mb-5">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Valor Total a Pagar
              </div>
              <div className="text-3xl font-black text-emerald-400 font-mono tracking-tight">
                R$ {total.toFixed(2).replace('.', ',')}
              </div>
              {discount > 0 && (
                <div className="text-xs text-amber-400 mt-1 font-medium">
                  Desconto aplicado: R$ {discount.toFixed(2).replace('.', ',')}
                </div>
              )}
            </div>

            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Forma de Pagamento
            </span>

            <div className="space-y-1.5">
              <button
                type="button"
                onClick={() => setSelectedMethod('dinheiro')}
                className={`w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${
                  selectedMethod === 'dinheiro'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Banknote className="w-5 h-5" />
                  <span>Dinheiro (Espécie)</span>
                </div>
                <span className="text-[11px] font-mono opacity-80">[1]</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('pix')}
                className={`w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${
                  selectedMethod === 'pix'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <QrCode className="w-5 h-5" />
                  <span>PIX Instantâneo</span>
                </div>
                <span className="text-[11px] font-mono opacity-80">[2]</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('debito')}
                className={`w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${
                  selectedMethod === 'debito'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <CreditCard className="w-5 h-5" />
                  <span>Cartão de Débito</span>
                </div>
                <span className="text-[11px] font-mono opacity-80">[3]</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('credito')}
                className={`w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${
                  selectedMethod === 'credito'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <CreditCard className="w-5 h-5" />
                  <span>Cartão de Crédito</span>
                </div>
                <span className="text-[11px] font-mono opacity-80">[4]</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('fiado')}
                className={`w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${
                  selectedMethod === 'fiado'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <CalendarClock className="w-5 h-5" />
                  <span>Fiado / A Prazo</span>
                </div>
                <span className="text-[11px] font-mono opacity-80">[5]</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMethod('multiplo')}
                className={`w-full flex items-center justify-between p-3 rounded-xl font-bold text-sm transition-all ${
                  selectedMethod === 'multiplo'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Layers className="w-5 h-5" />
                  <span>Dividir Pagamento</span>
                </div>
                <span className="text-[11px] font-mono opacity-80">[6]</span>
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 text-xs text-slate-400">
            Pressione <kbd className="bg-slate-800 text-slate-200 px-1 py-0.5 rounded font-mono">ESC</kbd> para voltar
          </div>
        </div>

        {/* RIGHT COLUMN: Interactive Form for Selected Method */}
        <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between overflow-y-auto">
          <div>
            {/* Header */}
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
              <h3 className="text-xl font-black text-slate-900 flex items-center space-x-2">
                {selectedMethod === 'dinheiro' && <span>Pagamento em Dinheiro</span>}
                {selectedMethod === 'pix' && <span>Pagamento via PIX com QR Code</span>}
                {selectedMethod === 'debito' && <span>Cartão de Débito</span>}
                {selectedMethod === 'credito' && <span>Cartão de Crédito</span>}
                {selectedMethod === 'fiado' && <span>Registrar Fiado / Caderneta</span>}
                {selectedMethod === 'multiplo' && <span>Dividir em Múltiplas Formas</span>}
              </h3>
              <button
                onClick={onClose}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* METHOD 1: CASH */}
            {selectedMethod === 'dinheiro' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                    Valor Entregue pelo Cliente (R$)
                  </label>
                  <input
                    type="text"
                    value={cashReceived}
                    onChange={(e) => setCashReceived(e.target.value)}
                    className="w-full h-14 px-4 text-3xl font-black text-slate-900 font-mono bg-slate-50 rounded-2xl border-2 border-slate-300 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 outline-none"
                    autoFocus
                  />
                </div>

                {/* Quick Bills Buttons */}
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1.5">
                    Cédulas Rápidas:
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    <button
                      type="button"
                      onClick={() => addQuickCash(total)}
                      className="py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-extrabold rounded-xl transition-all"
                    >
                      Exato
                    </button>
                    {[10, 20, 50, 100, 200].map((bill) => (
                      <button
                        key={bill}
                        type="button"
                        onClick={() => addQuickCash(bill)}
                        className="py-2 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-black font-mono rounded-xl transition-all"
                      >
                        R$ {bill}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Automatic Change Box */}
                <div className={`p-4 rounded-2xl border-2 transition-all ${
                  parsedCashReceived >= total
                    ? 'bg-emerald-50 border-emerald-500'
                    : 'bg-rose-50 border-rose-400'
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`text-xs font-extrabold uppercase tracking-wider ${
                        parsedCashReceived >= total ? 'text-emerald-800' : 'text-rose-800'
                      }`}>
                        {parsedCashReceived >= total ? 'TROCO A DEVOLVER' : 'FALTAM'}
                      </span>
                      <div className={`text-3xl font-black font-mono tracking-tight ${
                        parsedCashReceived >= total ? 'text-emerald-700' : 'text-rose-700'
                      }`}>
                        R$ {(parsedCashReceived >= total ? cashChange : cashMissing).toFixed(2).replace('.', ',')}
                      </div>
                    </div>
                    {parsedCashReceived >= total && (
                      <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-lg">
                        <Check className="w-6 h-6 stroke-[3]" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* METHOD 2: PIX */}
            {selectedMethod === 'pix' && (
              <div className="flex flex-col sm:flex-row items-center gap-6 p-2">
                {pixQrCodeUrl ? (
                  <div className="bg-white p-3 rounded-2xl border-2 border-slate-200 shadow-md flex-shrink-0">
                    <img
                      src={pixQrCodeUrl}
                      alt="QR Code PIX"
                      className="w-48 h-48 sm:w-56 sm:h-56 rounded-lg object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-48 h-48 bg-slate-100 rounded-2xl flex items-center justify-center text-xs text-slate-400">
                    Gerando QR Code...
                  </div>
                )}

                <div className="flex-1 space-y-3">
                  <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-200">
                    <span className="text-xs font-bold text-emerald-900 block">
                      Beneficiário: {settings.pixReceiver || settings.storeName}
                    </span>
                    <span className="text-xs font-mono text-emerald-800 block mt-0.5">
                      Chave: {settings.pixKey}
                    </span>
                    <div className="text-lg font-black text-emerald-700 font-mono mt-1">
                      R$ {total.toFixed(2).replace('.', ',')}
                    </div>
                  </div>

                  <p className="text-xs text-slate-500">
                    Peça para o cliente abrir o aplicativo do banco e escanear o QR Code acima.
                  </p>

                  <button
                    type="button"
                    onClick={handleCopyPix}
                    className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 flex items-center justify-center space-x-2 transition-all"
                  >
                    {pixCopied ? (
                      <>
                        <Check className="w-4 h-4 text-emerald-600" />
                        <span className="text-emerald-700">Código PIX Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copiar Código Copia e Cola</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* METHOD 3: CARDS (DEBIT / CREDIT) */}
            {(selectedMethod === 'debito' || selectedMethod === 'credito') && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Bandeira do Cartão
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {['Mastercard', 'Visa', 'Elo', 'Hipercard'].map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setCardBrand(brand)}
                        className={`py-3 px-2 rounded-xl text-xs font-extrabold border transition-all text-center ${
                          cardBrand === brand
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedMethod === 'credito' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                      Parcelamento
                    </label>
                    <select
                      value={installments}
                      onChange={(e) => setInstallments(Number(e.target.value))}
                      className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
                    >
                      <option value={1}>1x de R$ {total.toFixed(2).replace('.', ',')} (À vista)</option>
                      <option value={2}>2x de R$ {(total / 2).toFixed(2).replace('.', ',')}</option>
                      <option value={3}>3x de R$ {(total / 3).toFixed(2).replace('.', ',')}</option>
                      <option value={4}>4x de R$ {(total / 4).toFixed(2).replace('.', ',')}</option>
                      <option value={5}>5x de R$ {(total / 5).toFixed(2).replace('.', ',')}</option>
                      <option value={6}>6x de R$ {(total / 6).toFixed(2).replace('.', ',')}</option>
                    </select>
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center space-x-3">
                  <CreditCard className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                  <span>
                    Aproxime ou insira o cartão do cliente na maquininha POS / TEF. Após aprovação na máquina, clique em <strong>Confirmar Recebimento</strong>.
                  </span>
                </div>
              </div>
            )}

            {/* METHOD 4: FIADO / CADERNETA */}
            {selectedMethod === 'fiado' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Nome Completo do Cliente *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ex: Dona Maria da Esquina"
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Telefone / WhatsApp (Opcional)
                  </label>
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-200 text-xs text-amber-900">
                  ⚠️ Esta venda será registrada no histórico como conta a receber (fiado) vinculada ao cliente.
                </div>
              </div>
            )}

            {/* METHOD 5: MULTIPLE / SPLIT */}
            {selectedMethod === 'multiplo' && (
              <div className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <span className="text-xs font-bold text-slate-600 block">Primeira Parte:</span>
                  <div className="flex gap-2">
                    <select
                      value={splitMethod1}
                      onChange={(e) => setSplitMethod1(e.target.value as PaymentMethod)}
                      className="p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                    >
                      <option value="dinheiro">Dinheiro</option>
                      <option value="pix">PIX</option>
                      <option value="debito">Cartão Débito</option>
                      <option value="credito">Cartão Crédito</option>
                    </select>
                    <input
                      type="text"
                      value={splitAmount1}
                      onChange={(e) => setSplitAmount1(e.target.value)}
                      placeholder="Valor 1"
                      className="flex-1 p-2.5 bg-white border border-slate-300 rounded-xl text-sm font-black font-mono text-slate-900"
                    />
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-2">
                  <span className="text-xs font-bold text-emerald-800 block">Segunda Parte (Restante):</span>
                  <div className="flex gap-2 items-center">
                    <select
                      value={splitMethod2}
                      onChange={(e) => setSplitMethod2(e.target.value as PaymentMethod)}
                      className="p-2.5 bg-white border border-emerald-300 rounded-xl text-xs font-bold"
                    >
                      <option value="pix">PIX</option>
                      <option value="dinheiro">Dinheiro</option>
                      <option value="debito">Cartão Débito</option>
                      <option value="credito">Cartão Crédito</option>
                    </select>
                    <div className="flex-1 p-2.5 bg-white border border-emerald-300 rounded-xl text-sm font-black font-mono text-emerald-700">
                      R$ {Math.max(0, total - (parseFloat(splitAmount1.replace(',', '.')) || 0)).toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* CPF na Nota Fiscal */}
          <div className="pt-2">
            <div className="flex items-center space-x-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
              <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
              <input
                type="text"
                value={customerCpf}
                onChange={(e) => setCustomerCpf(e.target.value)}
                placeholder="CPF na Nota Fiscal? (opcional - digite apenas números)"
                className="flex-1 bg-transparent text-xs font-mono font-medium text-slate-800 placeholder-slate-400 outline-none"
                maxLength={14}
              />
              {customerCpf && (
                <button
                  type="button"
                  onClick={() => setCustomerCpf('')}
                  className="text-slate-400 hover:text-slate-600 p-1 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Confirm Payment Footer Action */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-3 rounded-xl border border-slate-300 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              Cancelar (ESC)
            </button>
            <button
              type="button"
              onClick={handleFinalize}
              className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-base font-extrabold rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center space-x-2 active:scale-95"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Confirmar Recebimento</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
