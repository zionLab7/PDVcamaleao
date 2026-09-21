import React, { useEffect } from 'react';
import { 
  Printer, 
  Share2, 
  CheckCircle2, 
  RotateCcw, 
  X,
  FileText,
  Send
} from 'lucide-react';
import { Sale, StoreSettings } from '../../types';

interface ReceiptModalProps {
  sale: Sale;
  settings: StoreSettings;
  onClose: () => void;
  onNewSale: () => void;
}

export const ReceiptModal: React.FC<ReceiptModalProps> = ({
  sale,
  settings,
  onClose,
  onNewSale,
}) => {
  // Trigger direct thermal print
  const handlePrint = () => {
    window.print();
  };

  // Keyboard shortcut: Enter starts new sale, Esc closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNewSale();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNewSale, onClose]);

  // Format date & time
  const formattedDate = new Date(sale.timestamp).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });

  // Share receipt via WhatsApp
  const handleWhatsAppShare = () => {
    const lines = [
      `*${settings.storeName.toUpperCase()}*`,
      `${settings.address} - ${settings.city}`,
      `CNPJ: ${settings.document} | Fone: ${settings.phone}`,
      `--------------------------------`,
      `*CUPOM NÃO FISCAL - COMPROVANTE*`,
      `Venda: #${sale.sequenceNumber.toString().padStart(5, '0')}`,
      `Data: ${formattedDate}`,
      `Operador: ${sale.operatorName}`,
      sale.customerName ? `Cliente: ${sale.customerName}` : '',
      `--------------------------------`,
      `*ITENS:*`,
      ...sale.items.map(
        (i, idx) =>
          `${idx + 1}. ${i.product.name}\n   ${i.quantity} x R$ ${i.unitPrice.toFixed(2).replace('.', ',')} = *R$ ${i.total.toFixed(2).replace('.', ',')}*`
      ),
      `--------------------------------`,
      sale.discount > 0 ? `Subtotal: R$ ${sale.subtotal.toFixed(2).replace('.', ',')}` : '',
      sale.discount > 0 ? `Desconto: - R$ ${sale.discount.toFixed(2).replace('.', ',')}` : '',
      `*TOTAL PAGO: R$ ${sale.total.toFixed(2).replace('.', ',')}*`,
      `Forma: ${sale.payments.map((p) => p.method.toUpperCase()).join(' + ')}`,
      sale.change > 0 ? `Troco: R$ ${sale.change.toFixed(2).replace('.', ',')}` : '',
      `--------------------------------`,
      `${settings.receiptFooter || 'Obrigado pela preferência!'}`,
    ].filter(Boolean);

    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const is80mm = settings.receiptWidth === '80mm';

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto">
        
        {/* Modal Top Notification Bar */}
        <div className="bg-emerald-600 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-200" />
            <div>
              <h3 className="font-extrabold text-sm sm:text-base leading-tight">
                Venda Concluída com Sucesso!
              </h3>
              <p className="text-[11px] text-emerald-100 font-mono">
                Comprovante #{sale.sequenceNumber.toString().padStart(5, '0')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-emerald-200 hover:text-white p-1 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* RECEIPT PAPER SIMULATOR (Screen & Print Target) */}
        <div className="p-4 sm:p-6 bg-slate-100 flex justify-center overflow-y-auto max-h-[50vh]">
          <div 
            id="printable-receipt"
            className={`bg-white p-4 sm:p-5 shadow-md border border-dashed border-slate-300 font-mono text-slate-900 text-xs leading-tight select-text ${
              is80mm ? 'w-80' : 'w-64'
            }`}
          >
            {/* Header */}
            <div className="text-center pb-3 border-b border-dashed border-slate-300">
              <div className="font-extrabold text-sm uppercase">{settings.storeName}</div>
              <div className="text-[10px] text-slate-600">{settings.tradeName}</div>
              <div className="text-[10px] text-slate-600">CNPJ: {settings.document}</div>
              <div className="text-[10px] text-slate-600">{settings.address} - {settings.city}</div>
              <div className="text-[10px] text-slate-600">Tel: {settings.phone}</div>
              <div className="mt-2 text-[11px] font-bold">CUPOM NÃO FISCAL</div>
            </div>

            {/* Meta */}
            <div className="py-2 border-b border-dashed border-slate-300 text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span>Venda: #{sale.sequenceNumber.toString().padStart(5, '0')}</span>
                <span>{formattedDate}</span>
              </div>
              <div className="flex justify-between">
                <span>Operador: {sale.operatorName}</span>
                {sale.customerName && <span>Cli: {sale.customerName}</span>}
              </div>
            </div>

            {/* Items */}
            <div className="py-2 border-b border-dashed border-slate-300 space-y-1.5">
              <div className="flex justify-between font-bold text-[10px] text-slate-700 pb-1 border-b border-slate-200">
                <span>ITEM / DESCRIÇÃO</span>
                <span>TOTAL</span>
              </div>
              {sale.items.map((item, idx) => (
                <div key={idx} className="text-[11px]">
                  <div className="font-bold line-clamp-1">{idx + 1}. {item.product.name}</div>
                  <div className="flex justify-between text-[10px] text-slate-600">
                    <span>{item.quantity} {item.product.unit} x R$ {item.unitPrice.toFixed(2).replace('.', ',')}</span>
                    <span className="font-bold text-slate-900">R$ {item.total.toFixed(2).replace('.', ',')}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="py-2 border-b border-dashed border-slate-300 space-y-1 text-xs">
              {sale.discount > 0 && (
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Subtotal:</span>
                  <span>R$ {sale.subtotal.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              {sale.discount > 0 && (
                <div className="flex justify-between text-slate-600 text-[11px]">
                  <span>Desconto:</span>
                  <span>- R$ {sale.discount.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-sm pt-1">
                <span>TOTAL:</span>
                <span>R$ {sale.total.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            {/* Payment & Change */}
            <div className="py-2 border-b border-dashed border-slate-300 text-[10px] space-y-0.5">
              <div className="font-bold">FORMA DE PAGAMENTO:</div>
              {sale.payments.map((p, i) => (
                <div key={i} className="flex justify-between text-slate-700">
                  <span className="uppercase">{p.method}</span>
                  <span>R$ {p.amount.toFixed(2).replace('.', ',')}</span>
                </div>
              ))}
              {sale.change > 0 && (
                <div className="flex justify-between font-bold pt-1 text-emerald-800">
                  <span>TROCO:</span>
                  <span>R$ {sale.change.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center pt-3 text-[10px] text-slate-600">
              <p>{settings.receiptFooter || 'Agradecemos a sua preferência!'}</p>
              <p className="text-[8px] text-slate-400 mt-1">PDV Camaleão • Sistema de Ponto de Venda</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePrint}
              className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>Imprimir Cupom</span>
            </button>

            <button
              onClick={handleWhatsAppShare}
              className="py-3 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all"
            >
              <Send className="w-4 h-4 text-emerald-600" />
              <span>Enviar WhatsApp</span>
            </button>
          </div>

          {/* Quick Enter for Next Sale */}
          <button
            onClick={onNewSale}
            className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 transition-all active:scale-[0.98]"
          >
            <RotateCcw className="w-4 h-4" />
            <span>NOVA VENDA (Pressione ENTER)</span>
          </button>
        </div>

      </div>
    </div>
  );
};
