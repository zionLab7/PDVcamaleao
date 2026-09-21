import React, { useState } from 'react';
import { 
  Settings, 
  Store, 
  QrCode, 
  Printer, 
  Volume2, 
  VolumeX, 
  Check, 
  Sparkles,
  ShieldCheck,
  Loader2,
  Database,
  FileText,
  Key,
  Upload,
  AlertCircle,
  Award
} from 'lucide-react';
import { StoreSettings } from '../../types';
import * as api from '../../services/api';
import { sound } from '../../services/audio';

interface SettingsViewProps {
  settings: StoreSettings;
  onSettingsSaved: (updated: StoreSettings) => void;
  onOpenRemoteMonitor?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSettingsSaved,
  onOpenRemoteMonitor,
}) => {
  const [formData, setFormData] = useState<StoreSettings>({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Certificate A1 state
  const [certFileBase64, setCertFileBase64] = useState<string>('');
  const [certPassword, setCertPassword] = useState<string>('');
  const [certFileName, setCertFileName] = useState<string>('');
  const [certLoading, setCertLoading] = useState<boolean>(false);
  const [certFeedback, setCertFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCertificateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCertFileName(file.name);
    setCertFeedback(null);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string) || '';
      setCertFileBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadCertificate = async () => {
    if (!certFileBase64) {
      alert('Selecione o arquivo .pfx do Certificado Digital A1.');
      return;
    }
    setCertLoading(true);
    setCertFeedback(null);
    try {
      const res = await api.fiscal.uploadCertificate(certFileBase64, certPassword);
      sound.playSuccess();
      setCertFeedback({
        type: 'success',
        text: `Certificado válido! Titular: ${res.owner} (${res.daysRemaining} dias restantes).`,
      });
      setFormData((prev) => ({
        ...prev,
        enableNfce: true,
        certificateOwner: res.owner,
        certificateExpiresAt: res.expiresAt,
      }));
    } catch (err: any) {
      sound.playAlert();
      setCertFeedback({
        type: 'error',
        text: err.message || 'Erro ao validar certificado. Verifique a senha.',
      });
    } finally {
      setCertLoading(false);
    }
  };

  const handleChange = (field: keyof StoreSettings, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.settings.update(formData);
      sound.enabled = formData.enableSound;
      sound.playSuccess();
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
      onSettingsSaved(formData);
    } catch (err: any) {
      sound.playAlert();
      alert(err.message || 'Erro ao salvar configurações.');
    } finally {
      setLoading(false);
    }
  };

  const handleTestSound = () => {
    sound.enabled = true;
    sound.playBeep();
  };

  return (
    <div className="flex-1 p-4 sm:p-6 bg-slate-100 overflow-y-auto max-w-5xl mx-auto w-full">
      
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
          <Settings className="w-7 h-7 text-emerald-600" />
          <span>Configurações & Dados do Comércio</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium mt-0.5">
          Personalize os dados da sua loja, dados para impressão de recibos e chave PIX
        </p>
      </div>

      {savedSuccess && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-300 rounded-2xl flex items-center space-x-3 text-emerald-800 text-sm font-bold animate-pulse shadow-sm">
          <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <span>Configurações salvas com sucesso no banco de dados!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        
        {/* CARD 1: Store Business Details */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-black text-base border-b border-slate-100 pb-3">
            <Store className="w-5 h-5 text-emerald-600" />
            <span>Identificação do Estabelecimento Comercial</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nome Fantasia (Aparece no Topo e Cupom) *
              </label>
              <input
                type="text"
                required
                value={formData.storeName}
                onChange={(e) => handleChange('storeName', e.target.value)}
                placeholder="Ex: Mercadinho & Mercearia São José"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Razão Social
              </label>
              <input
                type="text"
                value={formData.tradeName}
                onChange={(e) => handleChange('tradeName', e.target.value)}
                placeholder="Ex: Mercearia São José Ltda"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                CNPJ / CPF
              </label>
              <input
                type="text"
                value={formData.document}
                onChange={(e) => handleChange('document', e.target.value)}
                placeholder="00.000.000/0001-00"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Telefone / WhatsApp de Contato
              </label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="(00) 90000-0000"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Endereço
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Rua, Número, Bairro"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Cidade / Estado
              </label>
              <input
                type="text"
                value={formData.city}
                onChange={(e) => handleChange('city', e.target.value)}
                placeholder="São Paulo - SP"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* CARD 2: PIX Checkout Settings */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-slate-900 font-black text-base border-b border-slate-100 pb-3">
            <QrCode className="w-5 h-5 text-emerald-600" />
            <span>Configurações do PIX Dinâmico (QR Code no Caixa)</span>
          </div>

          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 leading-relaxed">
            Ao preencher sua chave PIX abaixo, o PDV gerará automaticamente na tela de cobrança o QR Code oficial no padrão <strong>EMVCo / Banco Central</strong> com o valor exato de cada venda.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Chave PIX (CNPJ, CPF, Email ou Celular)
              </label>
              <input
                type="text"
                value={formData.pixKey}
                onChange={(e) => handleChange('pixKey', e.target.value)}
                placeholder="Ex: 12.345.678/0001-90"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Nome do Titular da Conta (Sem Acentos)
              </label>
              <input
                type="text"
                maxLength={25}
                value={formData.pixReceiver}
                onChange={(e) => handleChange('pixReceiver', e.target.value)}
                placeholder="Ex: MERCEARIA SAO JOSE"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold uppercase text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Cidade do Beneficiário
              </label>
              <input
                type="text"
                value={formData.pixCity}
                onChange={(e) => handleChange('pixCity', e.target.value)}
                placeholder="Ex: SAO PAULO"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold uppercase text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {/* CARD 3: Thermal Receipt & Sound */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          
          {/* Printer */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 text-slate-900 font-black text-base border-b border-slate-100 pb-3">
              <Printer className="w-5 h-5 text-emerald-600" />
              <span>Impressora Térmica de Cupom</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Largura da Bobina
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleChange('receiptWidth', '80mm')}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    formData.receiptWidth === '80mm'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm'
                      : 'bg-slate-50 border-slate-300 text-slate-600'
                  }`}
                >
                  80mm (Padrão Largo)
                </button>
                <button
                  type="button"
                  onClick={() => handleChange('receiptWidth', '58mm')}
                  className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    formData.receiptWidth === '58mm'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-900 shadow-sm'
                      : 'bg-slate-50 border-slate-300 text-slate-600'
                  }`}
                >
                  58mm (Mini Bobina)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Mensagem no Rodapé do Recibo
              </label>
              <input
                type="text"
                value={formData.receiptFooter}
                onChange={(e) => handleChange('receiptFooter', e.target.value)}
                placeholder="Ex: Obrigado pela preferência! Volte sempre!"
                className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Sound & Web Audio Feedback */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center space-x-2 text-slate-900 font-black text-base border-b border-slate-100 pb-3">
              <Volume2 className="w-5 h-5 text-indigo-600" />
              <span>Feedback Sonoro do Caixa</span>
            </div>

            <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
              <div>
                <span className="text-xs font-bold text-slate-900 block">
                  Sons do Leitor e Caixa Registradora
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Bip de scanner e acorde de sucesso ao concluir venda
                </span>
              </div>
              <input
                type="checkbox"
                checked={formData.enableSound}
                onChange={(e) => handleChange('enableSound', e.target.checked)}
                className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
              />
            </label>

            <button
              type="button"
              onClick={handleTestSound}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center space-x-1.5"
            >
              <Volume2 className="w-4 h-4 text-emerald-600" />
              <span>Testar Som de Bipe do Scanner</span>
            </button>
          </div>

        </div>

        {/* CARD FISCAL: NFC-e & Certificado Digital A1 */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2 text-slate-900 font-black text-base">
              <FileText className="w-5 h-5 text-emerald-600" />
              <span>Emissão Fiscal & NFC-e (Cupom Fiscal Oficial)</span>
            </div>
            <span className={`px-2.5 py-1 text-xs font-black rounded-full uppercase ${
              formData.enableNfce ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
            }`}>
              {formData.enableNfce ? 'Habilitado' : 'Desabilitado'}
            </span>
          </div>

          {/* Toggle Enable NFC-e */}
          <label className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 cursor-pointer transition-colors">
            <div>
              <span className="text-xs font-bold text-slate-900 block">Ativar Emissão de Cupom Fiscal (NFC-e)</span>
              <span className="text-[11px] text-slate-500 block">
                Permite emitir cupons fiscais eletrônicos oficiais autorizados pela SEFAZ diretamente na frente de caixa
              </span>
            </div>
            <input
              type="checkbox"
              checked={Boolean(formData.enableNfce)}
              onChange={(e) => handleChange('enableNfce', e.target.checked)}
              className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
            />
          </label>

          {formData.enableNfce && (
            <div className="space-y-4 pt-2 border-t border-slate-100">
              
              {/* Environment Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Ambiente da SEFAZ *
                  </label>
                  <select
                    value={formData.fiscalEnvironment || 'homologacao'}
                    onChange={(e) => handleChange('fiscalEnvironment', e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
                  >
                    <option value="homologacao">🧪 Homologação (Ambiente de Testes - Sem valor fiscal)</option>
                    <option value="producao">🚀 Produção (Oficial - Gera Imposto Real na SEFAZ)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Estado / UF Emissora
                  </label>
                  <select
                    value={formData.stateUf || 'SP'}
                    onChange={(e) => handleChange('stateUf', e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
                  >
                    <option value="SP">SP - São Paulo (SEFAZ-SP)</option>
                    <option value="RJ">RJ - Rio de Janeiro</option>
                    <option value="MG">MG - Minas Gerais</option>
                    <option value="PR">PR - Paraná</option>
                    <option value="RS">RS - Rio Grande do Sul</option>
                    <option value="SC">SC - Santa Catarina</option>
                    <option value="BA">BA - Bahia</option>
                    <option value="GO">GO - Goiás</option>
                  </select>
                </div>
              </div>

              {/* Inscrição Estadual & Regime Tributário */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Inscrição Estadual (IE) *
                  </label>
                  <input
                    type="text"
                    value={formData.stateRegistration || ''}
                    onChange={(e) => handleChange('stateRegistration', e.target.value)}
                    placeholder="Ex: 123.456.789.110"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Regime Tributário (CRT)
                  </label>
                  <select
                    value={formData.taxRegime || '1'}
                    onChange={(e) => handleChange('taxRegime', e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-900 outline-none focus:border-emerald-500"
                  >
                    <option value="1">1 - Simples Nacional (Padrão Pequeno Varejo)</option>
                    <option value="2">2 - Simples Nacional - Excesso de Sublimite</option>
                    <option value="3">3 - Regime Normal (Lucro Presumido / Real)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Série da NFC-e
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={formData.nfceSeries || 1}
                    onChange={(e) => handleChange('nfceSeries', parseInt(e.target.value, 10) || 1)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* CSC Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    ID do CSC (SEFAZ)
                  </label>
                  <input
                    type="text"
                    value={formData.cscId || ''}
                    onChange={(e) => handleChange('cscId', e.target.value)}
                    placeholder="Ex: 000001"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Normalmente 000001 ou 000002 fornecido pelo portal da SEFAZ</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Código de Segurança do Contribuinte (Token CSC)
                  </label>
                  <input
                    type="password"
                    value={formData.cscToken || ''}
                    onChange={(e) => handleChange('cscToken', e.target.value)}
                    placeholder="Chave alfanumérica secreta da SEFAZ"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">Token gerado pelo contador na Nota Fiscal Paulista / Posto Fiscal</span>
                </div>
              </div>

              {/* Certificate A1 (.pfx) Upload Box */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center space-x-2 text-slate-900 font-bold text-xs uppercase tracking-wider">
                  <Key className="w-4 h-4 text-emerald-600" />
                  <span>Certificado Digital A1 (.pfx ou .p12)</span>
                </div>

                {formData.certificateOwner && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-emerald-800">
                      <Award className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="font-bold block">Certificado A1 Configurado e Ativo</span>
                        <span className="text-[11px] text-emerald-700">
                          Titular: {formData.certificateOwner} • Expira em:{' '}
                          {formData.certificateExpiresAt ? new Date(formData.certificateExpiresAt).toLocaleDateString('pt-BR') : 'Data registrada'}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-200 text-emerald-800 font-black text-[10px] rounded-full uppercase">
                      OK
                    </span>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      {formData.certificateOwner ? 'Substituir Arquivo .pfx' : 'Selecione o Arquivo .pfx'}
                    </label>
                    <input
                      type="file"
                      accept=".pfx,.p12"
                      onChange={handleCertificateFileChange}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-100 file:text-emerald-800 hover:file:bg-emerald-200 cursor-pointer"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Senha do Certificado A1
                    </label>
                    <div className="flex space-x-2">
                      <input
                        type="password"
                        value={certPassword}
                        onChange={(e) => setCertPassword(e.target.value)}
                        placeholder="Senha do arquivo .pfx"
                        className="flex-1 p-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-medium text-slate-900 outline-none focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={handleUploadCertificate}
                        disabled={certLoading || !certFileBase64}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl transition-all flex items-center space-x-1 shrink-0"
                      >
                        {certLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        <span>{certLoading ? 'Validando...' : 'Testar & Salvar'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {certFeedback && (
                  <div className={`p-2.5 rounded-xl text-xs flex items-center space-x-2 ${
                    certFeedback.type === 'success'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}>
                    {certFeedback.type === 'success' ? (
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold">{certFeedback.text}</span>
                  </div>
                )}
              </div>

            </div>
          )}
        </div>

        {/* CARD 4: Database & Remote Access */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2 text-slate-900 font-black text-base">
              <Database className="w-5 h-5 text-emerald-600" />
              <span>Banco de Dados & Gestão em Nuvem</span>
            </div>
            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 text-xs font-black rounded-full uppercase">
              Online • PostgreSQL
            </span>
          </div>

          <p className="text-xs text-slate-500 leading-relaxed">
            Seus dados estão sincronizados em tempo real com o servidor PostgreSQL, isolados por empresa com autenticação segura JWT.
          </p>

          {onOpenRemoteMonitor && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-900 block">QR Code para o Celular do Dono</span>
                <span className="text-[11px] text-slate-500 block">Abra o painel com QR Code para acompanhar vendas e faturamento de qualquer lugar</span>
              </div>
              <button
                type="button"
                onClick={onOpenRemoteMonitor}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition-all flex items-center space-x-1.5"
              >
                <span>Ver QR Code do Dono</span>
              </button>
            </div>
          )}
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={loading}
            className="py-3.5 px-8 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white font-black text-sm rounded-2xl shadow-xl shadow-emerald-600/30 transition-all flex items-center space-x-2 active:scale-95"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Check className="w-5 h-5" />
                <span>Salvar Todas as Configurações</span>
              </>
            )}
          </button>
        </div>

      </form>

    </div>
  );
};
