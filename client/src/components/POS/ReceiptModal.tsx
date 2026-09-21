import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { 
  Printer, 
  Share2, 
  CheckCircle2, 
  RotateCcw, 
  X,
  FileText,
  Send,
  Loader2,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { Sale, StoreSettings } from '../../types';
import * as api from '../../services/api';
import { sound } from '../../services/audio';

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
  const is80mm = settings.receiptWidth === '80mm';

  // Fiscal emission states
  const [fiscalStatus, setFiscalStatus] = useState<'none' | 'pending' | 'authorized' | 'rejected'>(
    (sale.fiscalStatus as any) || 'none'
  );
  const [isEmittingNfce, setIsEmittingNfce] = useState(false);
  const [fiscalError, setFiscalError] = useState<string | null>(sale.nfceError || null);
  const [accessKey, setAccessKey] = useState<string | undefined>(sale.nfceAccessKey);
  const [protocol, setProtocol] = useState<string | undefined>(sale.nfceProtocol);
  const [nfceNumber, setNfceNumber] = useState<number | undefined>(sale.nfceNumber);
  const [nfceSeries, setNfceSeries] = useState<number | undefined>(sale.nfceSeries);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  // Generate QR Code data URL if NFC-e already has qrCodeUrl
  useEffect(() => {
    if (sale.nfceQrCodeUrl) {
      QRCode.toDataURL(sale.nfceQrCodeUrl, { width: 160, margin: 1 })
        .then(setQrCodeDataUrl)
        .catch(console.error);
    }
  }, [sale.nfceQrCodeUrl]);

  // Handle NFC-e emission request
  const handleEmitNfce = async () => {
    setIsEmittingNfce(true);
    setFiscalError(null);

    try {
      const res = await api.fiscal.emitNfce(sale.id, sale.customerCpf);
      if (res.success && res.qrCodeUrl) {
        sound.playSuccess();
        setFiscalStatus('authorized');
        setAccessKey(res.accessKey);
        setProtocol(res.protocol);
        setNfceNumber(res.number);
        setNfceSeries(res.series);

        const qr = await QRCode.toDataURL(res.qrCodeUrl, { width: 160, margin: 1 });
        setQrCodeDataUrl(qr);
      } else {
        sound.playAlert();
        setFiscalStatus('rejected');
        setFiscalError(res.errorMessage || 'Rejeição na autorização da NFC-e');
      }
    } catch (err: any) {
      sound.playAlert();
      setFiscalStatus('rejected');
      setFiscalError(err.message || 'Erro ao conectar aos servidores da SEFAZ');
    } finally {
      setIsEmittingNfce(false);
    }
  };

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
  const formattedDate = new Date(sale.timestamp || Date.now()).toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });

  const isFiscalAuthorized = fiscalStatus === 'authorized';

  // Share receipt via WhatsApp
  const handleWhatsAppShare = () => {
    const docTitle = isFiscalAuthorized ? `*DANFE NFC-e - CUPOM FISCAL*` : `*CUPOM NÃO FISCAL - COMPROVANTE*`;
    const lines = [
      `*${settings.storeName.toUpperCase()}*`,
      `${settings.address} - ${settings.city}`,
      `CNPJ: ${settings.document} | Fone: ${settings.phone}`,
      `--------------------------------`,
      docTitle,
      `Venda: #${sale.sequenceNumber.toString().padStart(5, '0')}`,
      isFiscalAuthorized && nfceNumber ? `NFC-e nº: ${nfceNumber} Série: ${nfceSeries}` : '',
      `Data: ${formattedDate}`,
      sale.customerCpf ? `CPF Consumidor: ${sale.customerCpf}` : '',
      `--------------------------------`,
      ...sale.items.map(
        (i) => `${i.quantity}x ${i.product.name} = R$ ${i.total.toFixed(2).replace('.', ',')}`
      ),
      `--------------------------------`,
      `*TOTAL: R$ ${sale.total.toFixed(2).replace('.', ',')}*`,
      isFiscalAuthorized && accessKey ? `Chave: ${accessKey}` : '',
      isFiscalAuthorized && protocol ? `Protocolo: ${protocol}` : '',
      `--------------------------------`,
      settings.receiptFooter || 'Agradecemos a sua preferência!',
    ].filter(Boolean);

    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  // Format access key in groups of 4: 0000 0000 0000 ...
  const formatAccessKey = (key?: string) => {
    if (!key) return '';
    return key.replace(/(\d{4})/g, '$1 ').trim();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 my-auto flex flex-col max-h-[95vh]">
        
        {/* Modal Header */}
        <div className="bg-emerald-600 text-white p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-6 h-6 text-white" />
            <div>
              <h3 className="font-extrabold text-base leading-tight">Venda Concluída com Sucesso!</h3>
              <p className="text-xs text-emerald-100">
                {isFiscalAuthorized ? 'NFC-e Autorizada pela SEFAZ' : 'Recibo / Cupom de Venda'}
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

        {/* Fiscal Rejection Alert */}
        {fiscalError && (
          <div className="p-3 bg-rose-50 border-b border-rose-200 flex items-start space-x-2 text-rose-800 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-bold block">Aviso SEFAZ:</span>
              <span>{fiscalError}</span>
            </div>
          </div>
        )}

        {/* RECEIPT PAPER SIMULATOR (Screen & Print Target) */}
        <div className="p-4 sm:p-5 bg-slate-100 flex justify-center overflow-y-auto max-h-[52vh]">
          <div 
            id="printable-receipt"
            className={`bg-white p-4 sm:p-5 shadow-md border border-dashed border-slate-300 font-mono text-slate-900 text-xs leading-tight select-text ${
              is80mm ? 'w-80' : 'w-64'
            }`}
          >
            {/* Header */}
            <div className="text-center pb-2.5 border-b border-dashed border-slate-300">
              <div className="font-extrabold text-sm uppercase">{settings.storeName}</div>
              {settings.tradeName && <div className="text-[10px] text-slate-600">{settings.tradeName}</div>}
              <div className="text-[10px] text-slate-700 font-bold">CNPJ: {settings.document || '00.000.000/0001-00'}</div>
              {settings.stateRegistration && <div className="text-[9px] text-slate-500">IE: {settings.stateRegistration}</div>}
              <div className="text-[9px] text-slate-500">{settings.address} - {settings.city}</div>
              {settings.phone && <div className="text-[9px] text-slate-500">Tel: {settings.phone}</div>}

              {/* Title: Fiscal vs Non-Fiscal */}
              {isFiscalAuthorized ? (
                <div className="mt-2 pt-2 border-t border-slate-200">
                  <div className="text-[11px] font-black uppercase text-emerald-900">
                    DANFE NFC-e
                  </div>
                  <div className="text-[9px] text-slate-600">
                    Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
                  </div>
                  {settings.fiscalEnvironment === 'homologacao' && (
                    <div className="mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-900 font-black text-[9px] rounded">
                      EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-[11px] font-bold text-slate-700">
                  CUPOM NÃO FISCAL
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="py-2 border-b border-dashed border-slate-300 text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span>Venda: #{sale.sequenceNumber.toString().padStart(5, '0')}</span>
                <span>{formattedDate}</span>
              </div>
              {isFiscalAuthorized && nfceNumber && (
                <div className="flex justify-between font-bold text-slate-800">
                  <span>NFC-e nº: {nfceNumber}</span>
                  <span>Série: {nfceSeries || 1}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Operador: {sale.operatorName}</span>
                {sale.customerName && <span>Cli: {sale.customerName}</span>}
              </div>
              {sale.customerCpf && (
                <div className="font-bold text-slate-900">
                  <span>Consumidor CPF: {sale.customerCpf}</span>
                </div>
              )}
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
                    <span>
                      {item.quantity} {item.product.unit} x R$ {item.unitPrice.toFixed(2).replace('.', ',')}
                      {item.product.ncm && <span className="text-[8px] text-slate-400 ml-1">NCM:{item.product.ncm}</span>}
                    </span>
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

            {/* Official Fiscal Block (Only on authorized NFC-e) */}
            {isFiscalAuthorized && (
              <div className="py-2 border-b border-dashed border-slate-300 text-center space-y-1.5">
                <div className="text-[9px] text-slate-500">
                  Tributos Totais Incidentes (Lei Federal 12.741/2012): R$ {(sale.total * 0.15).toFixed(2).replace('.', ',')} (15.00%)
                </div>
                
                {protocol && (
                  <div className="text-[10px] font-bold text-slate-800">
                    Protocolo de Autorização: {protocol}
                  </div>
                )}

                {/* QR Code Oficial da SEFAZ */}
                {qrCodeDataUrl ? (
                  <div className="flex flex-col items-center justify-center py-2">
                    <img 
                      src={qrCodeDataUrl} 
                      alt="QR Code NFC-e SEFAZ" 
                      className="w-36 h-36 border border-slate-200 p-1 rounded" 
                    />
                    <span className="text-[9px] text-slate-500 mt-1">
                      Consulte pela câmera do celular
                    </span>
                  </div>
                ) : (
                  <div className="text-[9px] text-slate-400 py-1">Carregando QR Code fiscal...</div>
                )}

                {/* Chave de Acesso */}
                {accessKey && (
                  <div className="text-[9px] text-slate-600 break-all pt-1 border-t border-slate-200">
                    <span className="font-bold block text-slate-800">CHAVE DE ACESSO:</span>
                    <span className="font-mono text-[8px]">{formatAccessKey(accessKey)}</span>
                  </div>
                )}
                
                <div className="text-[8px] text-slate-500">
                  Consulta em: www.fazenda.sp.gov.br/nfce
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="text-center pt-2.5 text-[10px] text-slate-600">
              <p>{settings.receiptFooter || 'Agradecemos a sua preferência! Volte sempre!'}</p>
              <p className="text-[8px] text-slate-400 mt-1">PDV Camaleão • Sistema Comercial</p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="p-4 bg-white border-t border-slate-200 space-y-2">
          
          {/* Fiscal Button (if not already authorized) */}
          {settings.enableNfce && !isFiscalAuthorized && (
            <button
              onClick={handleEmitNfce}
              disabled={isEmittingNfce}
              className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-xl font-extrabold text-xs flex items-center justify-center space-x-2 transition-all shadow-md shadow-purple-600/20"
            >
              {isEmittingNfce ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Transmitindo para SEFAZ-SP...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  <span>Emitir Cupom Fiscal (NFC-e na SEFAZ)</span>
                </>
              )}
            </button>
          )}

          {isFiscalAuthorized && (
            <div className="py-1 px-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-center space-x-1.5 text-emerald-800 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Cupom Fiscal NFC-e Autorizado pela SEFAZ-SP</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePrint}
              className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>{isFiscalAuthorized ? 'Imprimir DANFE NFC-e' : 'Imprimir Cupom'}</span>
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
