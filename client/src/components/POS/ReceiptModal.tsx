import { NfeRecipientForm } from './NfeRecipientForm';
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { NfeRecipient, Sale, StoreSettings } from '../../types';
import * as api from '../../services/api';
import { sound } from '../../services/audio';
import { getPrinterPaperWidth, savePrinterPaperWidth, printThermalReceipt, PaperWidth } from '../../services/thermalPrint';

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
  const [printWidth, setPrintWidth] = useState<PaperWidth>(() => getPrinterPaperWidth(settings.receiptWidth));
  const is80mm = printWidth === '80mm';
  const [isPrinting, setIsPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  // Fiscal emission states
  const [fiscalStatus, setFiscalStatus] = useState<'none' | 'pending' | 'authorized' | 'rejected'>(
    sale.fiscalStatus === 'cancelled' ? 'none' : sale.fiscalStatus || 'none'
  );
  const [isEmittingNfce, setIsEmittingNfce] = useState(false);
  const legacyAuthorization = sale.fiscalStatus === 'authorized' && !sale.nfceEnvironment;
  const [fiscalError, setFiscalError] = useState<string | null>(legacyAuthorization
    ? 'Emissão antiga. Confira a chave na SEFAZ antes de reemitir.' : sale.nfceError || null);
  const [environment, setEnvironment] = useState(sale.nfceEnvironment);
  const [issuedAt, setIssuedAt] = useState(sale.nfceIssuedAt);
  const [taxEstimate, setTaxEstimate] = useState(sale.nfceTaxEstimate);
  const [taxSource, setTaxSource] = useState(sale.nfceTaxSource);
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

  const [showNfeForm, setShowNfeForm] = useState(false);
  const isNfe = accessKey?.slice(20, 22) === '55';
  const a3 = settings.fiscalCertificateMode === 'A3';

  const applyFiscalResult = React.useCallback((res: api.FiscalResult) => {
    setFiscalStatus(res.fiscalStatus);
    setAccessKey(res.accessKey);
    setProtocol(res.protocol);
    setNfceNumber(res.number);
    setNfceSeries(res.series);
    setEnvironment(res.environment);
    setIssuedAt(res.issuedAt);
    setTaxEstimate(res.taxEstimate);
    setTaxSource(res.taxSource);
    setFiscalError(res.errorMessage || (res.fiscalStatus === 'pending'
      ? 'Confirme a operação na estação Windows com o cartão A3.' : null));
    if (res.success && res.qrCodeUrl) {
      void QRCode.toDataURL(res.qrCodeUrl, { width: 160, margin: 1 }).then(setQrCodeDataUrl).catch(console.error);
    }
  }, []);

  useEffect(() => {
    if (fiscalStatus !== 'pending') return;
    let active = true;
    let waiting = false;
    const timer = window.setInterval(async () => {
      if (waiting) return;
      waiting = true;
      try {
        const result = await api.fiscal.status(sale.id);
        if (active) applyFiscalResult(result);
      } catch {
        // Keep the last visible status while the server is unavailable.
      } finally {
        waiting = false;
      }
    }, 4000);
    return () => { active = false; window.clearInterval(timer); };
  }, [sale.id, fiscalStatus, applyFiscalResult]);

  const handleEmitNfce = async (recipient?: NfeRecipient) => {
    setIsEmittingNfce(true);
    setFiscalError(null);
    try {
      const result = await api.fiscal.emitNfce(sale.id, sale.customerCpf, recipient);
      applyFiscalResult(result);
      setShowNfeForm(false);
      if (result.success) sound.playSuccess();
    } catch (err: any) {
      sound.playAlert();
      setFiscalError(err.message || 'Erro ao solicitar a emissão fiscal.');
    } finally {
      setIsEmittingNfce(false);
    }
  };

  // Print a dedicated document with its own physical page and independent CSS.
  const handlePrint = async () => {
    const receipt = document.getElementById('printable-receipt');
    if (!receipt || isPrinting) return;
    setIsPrinting(true);
    setPrintError(null);
    try {
      await printThermalReceipt(receipt, printWidth);
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Não foi possível imprimir o cupom.');
    } finally {
      setIsPrinting(false);
    }
  };

  // Keyboard shortcut: Enter starts new sale, Esc closes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Choosing the paper size with Enter must not start a new sale.
      if (e.target instanceof HTMLSelectElement) return;
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

  const downloadNfeDanfe = async () => {
    try {
      const { xml } = await api.fiscal.getXml(sale.id);
      const { saveNfeDanfe } = await import('../../services/nfeDanfe');
      saveNfeDanfe(xml);
    } catch (error) {
      setFiscalError(error instanceof Error ? error.message : 'Falha ao gerar o DANFE.');
    }
  };

  const isFiscalAuthorized = fiscalStatus === 'authorized' && !!environment && !isNfe;
  const consultationUrl = environment === 'homologacao'
    ? 'https://www.homologacao.nfce.fazenda.sp.gov.br/NFCeConsultaPublica'
    : 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica';
  const displayDate = isFiscalAuthorized && issuedAt
    ? new Date(issuedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : formattedDate;

  const downloadFiscalXml = async () => {
    try {
      const { xml, fileName } = await api.fiscal.getXml(sale.id);
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setFiscalError(error instanceof Error ? error.message : 'Erro ao baixar o XML autorizado.');
    }
  };

  // Share receipt via WhatsApp
  const handleWhatsAppShare = () => {
    const docTitle = isFiscalAuthorized ? `*DANFE NFC-e - CUPOM FISCAL*` : `*CUPOM NÃO FISCAL - COMPROVANTE*`;
    const lines = [
      `*${settings.storeName.toUpperCase()}*`,
      `${settings.address} - ${settings.city}`,
      `CNPJ: ${settings.document} | Fone: ${settings.phone}`,
      `--------------------------------`,
      docTitle,
      isFiscalAuthorized && environment === 'homologacao' ? 'Homologação · sem valor fiscal' : '',
      `Venda: #${sale.sequenceNumber.toString().padStart(5, '0')}`,
      isFiscalAuthorized && nfceNumber ? `NFC-e nº: ${nfceNumber} Série: ${nfceSeries}` : '',
      `Data: ${displayDate}`,
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

  // Share the same content between the preview and a body-level print portal.
  // The portal avoids clipping by the modal's scrolling/overflow containers.
  const receiptContent = (
    <>
      {/* Header */}
      <div className="text-center pb-2.5 border-b border-dashed border-slate-300">
        <div className="receipt-title font-extrabold text-sm uppercase">{settings.storeName}</div>
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
            {environment === 'homologacao' && (
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
      <div className="receipt-meta py-2 border-b border-dashed border-slate-300 text-[10px] space-y-0.5">
        <div className="flex justify-between">
          <span>Venda: #{sale.sequenceNumber.toString().padStart(5, '0')}</span>
          <span>{displayDate}</span>
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
        <div className="receipt-item-header flex justify-between font-bold text-[10px] text-slate-700 pb-1 border-b border-slate-200">
          <span>ITEM / DESCRIÇÃO</span>
          <span className="receipt-item-total-heading">TOTAL</span>
        </div>
        {sale.items.map((item, idx) => (
          <div key={idx} className="receipt-item text-[11px]">
            <div className="font-bold line-clamp-1">{idx + 1}. {item.product.name}</div>
            <div className="receipt-item-details flex justify-between text-[10px] text-slate-600">
              <span>
                {item.quantity} {item.product.unit} x R$ {item.unitPrice.toFixed(2).replace('.', ',')}
                {item.product.ncm && <span className="receipt-ncm text-[8px] text-slate-400 ml-1">NCM:{item.product.ncm}</span>}
              </span>
              <span className="receipt-amount font-bold text-slate-900">R$ {item.total.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div className="py-2 border-b border-dashed border-slate-300 space-y-1 text-xs">
        {sale.discount > 0 && (
          <div className="flex justify-between text-slate-600 text-[11px]">
            <span>Subtotal:</span>
            <span className="receipt-amount">R$ {sale.subtotal.toFixed(2).replace('.', ',')}</span>
          </div>
        )}
        {sale.discount > 0 && (
          <div className="flex justify-between text-slate-600 text-[11px]">
            <span>Desconto:</span>
            <span className="receipt-amount">- R$ {sale.discount.toFixed(2).replace('.', ',')}</span>
          </div>
        )}
        <div className="receipt-total flex justify-between font-black text-sm pt-1">
          <span>TOTAL:</span>
          <span className="receipt-amount">R$ {sale.total.toFixed(2).replace('.', ',')}</span>
        </div>
      </div>

      {/* Payment & Change */}
      <div className="py-2 border-b border-dashed border-slate-300 text-[10px] space-y-0.5">
        <div className="font-bold">FORMA DE PAGAMENTO:</div>
        {sale.payments.map((p, i) => (
          <div key={i} className="flex justify-between text-slate-700">
            <span className="uppercase">{p.method}</span>
            <span className="receipt-amount">R$ {p.amount.toFixed(2).replace('.', ',')}</span>
          </div>
        ))}
        {sale.change > 0 && (
          <div className="flex justify-between font-bold pt-1 text-emerald-800">
            <span>TROCO:</span>
            <span className="receipt-amount">R$ {sale.change.toFixed(2).replace('.', ',')}</span>
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
            Consulta em {consultationUrl}
          </div>
        </div>
      )}

      {isFiscalAuthorized && taxEstimate != null && (
        <div className="text-center text-[9px] text-slate-600">
          Tributos aproximados R$ {taxEstimate.toFixed(2).replace('.', ',')} ({taxSource})
        </div>
      )}

      {/* Footer */}
      <div className="text-center pt-2.5 text-[10px] text-slate-600">
        <p>{settings.receiptFooter || 'Agradecemos a sua preferência! Volte sempre!'}</p>
        <p className="text-[8px] text-slate-400 mt-1">PDV Camaleão • Sistema Comercial</p>
      </div>
    </>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-200 my-auto flex flex-col max-h-[95vh]">

          {/* Modal Header */}
          <div className="bg-emerald-600 text-white p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-6 h-6 text-white" />
              <div>
                <h3 className="font-extrabold text-base leading-tight">Venda Concluída com Sucesso!</h3>
                <p className="text-xs text-emerald-100">
                  {isNfe && fiscalStatus === 'authorized' ? 'NF-e autorizada' : isFiscalAuthorized ? 'NFC-e autorizada' : 'Recibo / Cupom de Venda'}
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
                <span className="font-bold block">Status fiscal</span>
                <span>{fiscalError}</span>
              </div>
            </div>
          )}

          {/* Receipt preview; the print target is mounted separately on body. */}
          {!showNfeForm && <div className="p-4 sm:p-5 bg-slate-100 flex justify-center overflow-y-auto max-h-[52vh]">
            <div
              id="receipt-preview"
              className={`bg-white p-4 sm:p-5 shadow-md border border-dashed border-slate-300 font-mono text-slate-900 text-xs leading-tight select-text ${
                is80mm ? 'w-80' : 'w-64'
              }`}
            >
              {receiptContent}
            </div>
          </div>}

          <div className="p-4 bg-white border-t border-slate-200 space-y-2 overflow-y-auto shrink-0 max-h-[78vh]">
            {showNfeForm && <NfeRecipientForm name={sale.customerName} sending={isEmittingNfce}
              onSubmit={handleEmitNfce} onCancel={() => setShowNfeForm(false)} />}
            {!showNfeForm && <>
            {a3 && settings.enableNfce && !showNfeForm && ['none', 'rejected'].includes(fiscalStatus)
              && !legacyAuthorization && sale.status === 'completed' && (
              <button type="button" onClick={() => setShowNfeForm(true)}
                className="w-full rounded-xl bg-purple-700 px-4 py-2.5 text-xs font-bold text-white">
                Emitir NF-e modelo 55 para CNPJ
              </button>
            )}
            {isNfe && fiscalStatus === 'authorized' && (
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-900">
                <p className="font-bold">NF-e #{nfceNumber} autorizada {environment === 'homologacao' ? 'em homologação' : 'pela SEFAZ-SP'}</p>
                <p className="break-all">Chave {accessKey}</p>
                <p>Protocolo {protocol}</p>
              </div>
            )}

            {/* Fiscal Button (if not already authorized) */}
            {(settings.enableNfce || fiscalStatus === 'pending') && fiscalStatus !== 'authorized' && !showNfeForm && !legacyAuthorization && sale.status === 'completed' && (
              <button
                onClick={() => void handleEmitNfce()}
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
                    <span>{fiscalStatus === 'pending' ? 'Retomar ou consultar nota pendente' : 'Emitir NFC-e na SEFAZ'}</span>
                  </>
                )}
              </button>
            )}

            {isNfe && fiscalStatus === 'authorized' && !!environment && (
              <button type="button" onClick={downloadNfeDanfe}
                className="w-full rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">
                Baixar DANFE em PDF
              </button>
            )}

            {fiscalStatus === 'authorized' && !!environment && (
              <button type="button" onClick={downloadFiscalXml}
                className="w-full py-2 px-4 border border-slate-200 rounded-xl text-xs font-bold">
                Baixar XML fiscal autorizado
              </button>
            )}

            {isFiscalAuthorized && (
              <div className="py-1 px-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-center space-x-1.5 text-emerald-800 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Cupom Fiscal NFC-e Autorizado pela SEFAZ-SP</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 text-xs">
              <label htmlFor="receipt-paper-width" className="font-bold text-slate-700">
                Bobina deste caixa
              </label>
              <select
                id="receipt-paper-width"
                value={printWidth}
                disabled={isPrinting}
                onChange={(event) => {
                  const width = event.target.value as PaperWidth;
                  setPrintWidth(width);
                  savePrinterPaperWidth(width);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              >
                <option value="58mm">58 mm</option>
                <option value="80mm">80 mm</option>
              </select>
            </div>
            <p className="text-[11px] text-slate-500">Esta escolha fica salva neste computador.</p>
            {printError && <p role="alert" className="text-xs text-rose-700">{printError}</p>}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handlePrint}
                disabled={isPrinting || isEmittingNfce || (isFiscalAuthorized && !qrCodeDataUrl)}
                className="py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all shadow"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>{isPrinting ? 'Impressão em andamento…' : `${isFiscalAuthorized ? 'Imprimir DANFE NFC-e' : 'Imprimir Cupom'} (${is80mm ? '80' : '58'} mm)`}</span>
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
            </>}
          </div>

        </div>
      </div>
      {createPortal(
        <div id="printable-receipt" data-paper-width={is80mm ? '80mm' : '58mm'}>
          {receiptContent}
        </div>,
        document.body
      )}
    </>
  );
};
