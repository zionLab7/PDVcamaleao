import React, { useState, useRef } from 'react';
import { X, Sparkles, Package, Barcode, DollarSign, Loader2, Search, CheckCircle2, Globe } from 'lucide-react';
import { Product, UnitType } from '../../types';
import * as api from '../../services/api';
import { sound } from '../../services/audio';

interface ProductFormModalProps {
  productToEdit?: Product | null;
  onClose: () => void;
  onSaved: () => void;
}

export const ProductFormModal: React.FC<ProductFormModalProps> = ({
  productToEdit,
  onClose,
  onSaved,
}) => {
  const isEditing = Boolean(productToEdit);

  const [name, setName] = useState(productToEdit?.name || '');
  const [barcode, setBarcode] = useState(productToEdit?.barcode || '');
  const [category, setCategory] = useState(productToEdit?.category || 'Mercearia');
  const [unit, setUnit] = useState<UnitType>(productToEdit?.unit || 'UN');
  const [costPrice, setCostPrice] = useState(productToEdit?.costPrice?.toString() || '0');
  const [sellPrice, setSellPrice] = useState(productToEdit?.sellPrice?.toString() || '');
  const [stock, setStock] = useState(productToEdit?.stock?.toString() || '10');
  const [minStock, setMinStock] = useState(productToEdit?.minStock?.toString() || '5');
  const [quickAccess, setQuickAccess] = useState<boolean>(productToEdit?.quickAccess || false);
  const [ncm, setNcm] = useState(productToEdit?.ncm || '22021000');
  const [cfop, setCfop] = useState(productToEdit?.cfop || '5102');
  const [loading, setLoading] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const sellPriceInputRef = useRef<HTMLInputElement>(null);

  // Generate a random internal EAN-style barcode
  const handleGenerateBarcode = () => {
    const randomCode = '789' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
    setBarcode(randomCode);
    setLookupMessage(null);
    sound.playBeep();
  };

  // Lookup product info via external/shared database
  const handleLookupBarcode = async (codeToSearch?: string) => {
    const targetCode = (codeToSearch || barcode).trim().replace(/\D/g, '');
    if (!targetCode || targetCode.length < 6) {
      setLookupMessage({ text: 'Digite ao menos 6 dígitos para consultar.', type: 'error' });
      return;
    }

    setIsLookingUp(true);
    setLookupMessage(null);

    try {
      const res = await api.products.lookupBarcode(targetCode);
      if (res.found && res.name) {
        setName(res.name);
        if (res.category) setCategory(res.category);
        if (res.unit) setUnit(res.unit as UnitType);
        if (res.ncm) setNcm(res.ncm);
        sound.playBeep();
        setLookupMessage({
          text: `Produto identificado: "${res.name}" (${res.source || 'Catálogo'})`,
          type: 'success',
        });
        setTimeout(() => {
          sellPriceInputRef.current?.focus();
        }, 150);
      } else {
        setLookupMessage({
          text: 'Produto não encontrado no catálogo externo. Preencha o nome manualmente.',
          type: 'info',
        });
      }
    } catch (err) {
      setLookupMessage({
        text: 'Não foi possível consultar a base externa no momento.',
        type: 'error',
      });
    } finally {
      setIsLookingUp(false);
    }
  };

  const handleBarcodeChange = (newVal: string) => {
    setBarcode(newVal);
    setLookupMessage(null);
    const clean = newVal.replace(/\D/g, '');
    // Auto lookup se tiver 13 dígitos de padrão EAN e o nome ainda estiver vazio
    if (clean.length === 13 && !name.trim() && !isEditing) {
      handleLookupBarcode(clean);
    }
  };

  // Realtime profit margin calculation
  const parsedCost = parseFloat(costPrice.replace(',', '.')) || 0;
  const parsedSell = parseFloat(sellPrice.replace(',', '.')) || 0;
  const profit = parsedSell - parsedCost;
  const marginPercent = parsedSell > 0 ? ((profit / parsedSell) * 100).toFixed(1) : '0';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Informe o nome do produto.');
      return;
    }

    if (!barcode.trim()) {
      alert('Informe ou gere um código de barras para o produto.');
      return;
    }

    if (parsedSell <= 0) {
      alert('O preço de venda deve ser maior que zero.');
      return;
    }

    const payload = {
      name: name.trim(),
      barcode: barcode.trim(),
      category: category.trim() || 'Geral',
      unit,
      costPrice: parsedCost,
      sellPrice: parsedSell,
      stock: parseFloat(stock.replace(',', '.')) || 0,
      minStock: parseFloat(minStock.replace(',', '.')) || 0,
      quickAccess,
      ncm: ncm.trim().replace(/\D/g, '') || '00000000',
      cfop: cfop.trim() || '5102',
    };

    setLoading(true);

    try {
      if (isEditing && productToEdit) {
        await api.products.update(productToEdit.id, payload);
      } else {
        await api.products.create(payload);
      }

      sound.playSuccess();
      onSaved();
    } catch (err: any) {
      sound.playAlert();
      alert(err.message || 'Erro ao salvar produto.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden my-auto">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">
                {isEditing ? 'Editar Produto' : 'Cadastrar Novo Produto'}
              </h3>
              <p className="text-[11px] text-slate-400">
                {isEditing ? 'Atualize as informações de estoque e preço' : 'Adicione itens ao catálogo do seu comércio'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          
          {/* Barcode / EAN with Instant Online Lookup */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1">
                <Barcode className="w-3.5 h-3.5 text-slate-500" />
                <span>Código de Barras / EAN *</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateBarcode}
                className="text-[11px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center space-x-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>Gerar Automático</span>
              </button>
            </div>
            
            <div className="relative flex items-center">
              <input
                type="text"
                required
                autoFocus={!isEditing}
                placeholder="Bipe com o leitor ou digite o EAN (ex: 7891000100101)"
                value={barcode}
                onChange={(e) => handleBarcodeChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLookupBarcode();
                  }
                }}
                className="w-full pl-3.5 pr-28 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => handleLookupBarcode()}
                disabled={isLookingUp || !barcode.trim()}
                className="absolute right-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors shadow-sm"
                title="Buscar nome e categoria automaticamente na internet"
              >
                {isLookingUp ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                <span>{isLookingUp ? 'Buscando...' : 'Buscar'}</span>
              </button>
            </div>

            {/* Lookup status feedback banner */}
            {lookupMessage && (
              <div className={`mt-2 p-2.5 rounded-xl text-xs flex items-center space-x-2 transition-all ${
                lookupMessage.type === 'success'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                  : lookupMessage.type === 'info'
                  ? 'bg-blue-50 border border-blue-200 text-blue-800'
                  : 'bg-rose-50 border border-rose-200 text-rose-800'
              }`}>
                {lookupMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <Globe className="w-4 h-4 text-blue-600 shrink-0" />
                )}
                <span className="font-semibold">{lookupMessage.text}</span>
              </div>
            )}
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nome do Produto / Descrição *
            </label>
            <input
              type="text"
              required
              autoFocus={isEditing}
              placeholder="Ex: Arroz Camil Tipo 1 - 5kg"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            />
          </div>

          {/* Category & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="Mercearia">Mercearia</option>
                <option value="Bebidas">Bebidas</option>
                <option value="Padaria">Padaria & Confeitaria</option>
                <option value="Hortifrúti">Hortifrúti / Feira</option>
                <option value="Açougue">Açougue & Carnes</option>
                <option value="Laticínios">Laticínios & Frios</option>
                <option value="Limpeza">Limpeza</option>
                <option value="Higiene">Higiene & Cuidados</option>
                <option value="Doces & Snacks">Doces & Snacks</option>
                <option value="Outros">Outros</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Unidade de Medida
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as UnitType)}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              >
                <option value="UN">Unidade (UN)</option>
                <option value="KG">Quilograma (KG - Balança)</option>
                <option value="LT">Litro (LT)</option>
                <option value="PC">Pacote (PC)</option>
                <option value="CX">Caixa (CX)</option>
              </select>
            </div>
          </div>

          {/* Pricing: Cost vs Sell + Realtime Profit */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="text-[11px] font-black uppercase text-slate-500 tracking-wider mb-2.5">
              Precificação & Lucratividade
            </div>

            <div className="grid grid-cols-2 gap-3 mb-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Preço de Custo (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                  <input
                    type="text"
                    placeholder="0,00"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Preço de Venda (R$) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600">R$</span>
                  <input
                    ref={sellPriceInputRef}
                    type="text"
                    required
                    placeholder="0,00"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-emerald-400 ring-2 ring-emerald-400/20 rounded-xl text-sm font-black text-emerald-800 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Profit Margin Indicator */}
            {parsedSell > 0 && (
              <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-200">
                <span className="text-slate-500">
                  Lucro Bruto: <strong className="text-slate-800">R$ {profit.toFixed(2).replace('.', ',')}</strong>
                </span>
                <span className={`font-black px-2 py-0.5 rounded-full text-[11px] ${
                  profit > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                }`}>
                  Margem: {marginPercent}%
                </span>
              </div>
            )}
          </div>

          {/* Stock Quantities */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Estoque Atual
              </label>
              <input
                type="text"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Estoque Mínimo (Alerta)
              </label>
              <input
                type="text"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Fiscal Details (NCM & CFOP) */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                Classificação Fiscal (NFC-e)
              </span>
              <span className="text-[10px] text-emerald-700 bg-emerald-100 font-bold px-2 py-0.5 rounded-full">
                Preenchido Automático
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Código NCM (8 dígitos)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 22021000"
                  value={ncm}
                  onChange={(e) => setNcm(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  CFOP
                </label>
                <input
                  type="text"
                  placeholder="5102"
                  value={cfop}
                  onChange={(e) => setCfop(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Quick Access Toggle for Balcão/Padaria */}
          <label className="flex items-center space-x-3 p-3 bg-slate-50 hover:bg-slate-100/80 rounded-2xl border border-slate-200 cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={quickAccess}
              onChange={(e) => setQuickAccess(e.target.checked)}
              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
            />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">
                Atalho de Toque Rápido na Frente de Caixa
              </span>
              <span className="text-slate-500 text-[11px]">
                Exibe um botão de 1 toque no caixa (ideal para pão, café, sacola, gelo).
              </span>
            </div>
          </label>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center space-x-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>{isEditing ? 'Salvar Alterações' : 'Cadastrar Produto'}</span>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
