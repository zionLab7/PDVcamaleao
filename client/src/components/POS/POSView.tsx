import React, { useState, useEffect, useRef } from 'react';
import { 
  Barcode, 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  CreditCard, 
  Package, 
  Tag, 
  X, 
  Check, 
  Sparkles,
  HelpCircle,
  ShoppingBag,
  ArrowRight,
  Maximize2
} from 'lucide-react';
import { Product, CartItem, User, CashRegisterState } from '../../types';
import { sound } from '../../services/audio';

interface POSViewProps {
  products: Product[];
  currentUser: User;
  cashRegister: CashRegisterState;
  onFinalizeSale: (items: CartItem[], discount: number) => void;
  onOpenPriceCheck: () => void;
  onOpenCashMovement: () => void;
}

export const POSView: React.FC<POSViewProps> = ({
  products,
  currentUser,
  cashRegister,
  onFinalizeSale,
  onOpenPriceCheck,
}) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [discount, setDiscount] = useState<number>(0);
  const [discountModalOpen, setDiscountModalOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState('');
  const [discountType, setDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [lastScannedItem, setLastScannedItem] = useState<CartItem | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);

  // Quick categories tab for quick access
  const [quickCategory, setQuickCategory] = useState<string>('all');

  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const itemsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-focus barcode scanner input
  useEffect(() => {
    const focusInput = () => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
        return;
      }
      barcodeInputRef.current?.focus();
    };

    focusInput();
    const interval = setInterval(focusInput, 2000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        barcodeInputRef.current?.focus();
        barcodeInputRef.current?.select();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) {
          handleOpenPayment();
        } else {
          sound.playAlert();
        }
      } else if (e.key === 'F7') {
        e.preventDefault();
        onOpenPriceCheck();
      } else if (e.key === 'F8') {
        e.preventDefault();
        setDiscountModalOpen(true);
      } else if (e.key === 'Escape') {
        if (discountModalOpen) {
          setDiscountModalOpen(false);
        } else if (searchInput) {
          setSearchInput('');
          setSearchSuggestions([]);
        } else if (cart.length > 0) {
          handleClearCart();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, discountModalOpen, searchInput]);

  // Live fuzzy search
  useEffect(() => {
    const query = searchInput.trim();
    if (!query) {
      setSearchSuggestions([]);
      return;
    }

    let cleanQuery = query;
    if (query.includes('*')) {
      const parts = query.split('*');
      cleanQuery = parts[parts.length - 1].trim();
    }

    if (!cleanQuery) {
      setSearchSuggestions([]);
      return;
    }

    const matches = products.filter(
      (p) =>
        p.barcode.toLowerCase() === cleanQuery.toLowerCase() ||
        p.name.toLowerCase().includes(cleanQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(cleanQuery.toLowerCase())
    ).slice(0, 5);

    setSearchSuggestions(matches);
    setSelectedIndex(0);
  }, [searchInput, products]);

  // Add item to cart
  const addProductToCart = (product: Product, qty: number = 1) => {
    if (qty <= 0) return;

    sound.playBeep();

    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.product.id === product.id);
      let updated: CartItem[];

      if (existingIndex >= 0) {
        updated = [...prev];
        const current = updated[existingIndex];
        const newQty = Number((current.quantity + qty).toFixed(3));
        const total = Number((newQty * current.unitPrice).toFixed(2));
        
        updated[existingIndex] = {
          ...current,
          quantity: newQty,
          total,
        };
        setLastScannedItem(updated[existingIndex]);
      } else {
        const newItem: CartItem = {
          product,
          quantity: qty,
          unitPrice: product.sellPrice,
          discount: 0,
          total: Number((qty * product.sellPrice).toFixed(2)),
        };
        updated = [newItem, ...prev];
        setLastScannedItem(newItem);
      }

      return updated;
    });

    setSearchInput('');
    setSearchSuggestions([]);
    barcodeInputRef.current?.focus();
  };

  // Process barcode or text input
  const handleProcessInput = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = searchInput.trim();
    if (!raw) return;

    let multiplier = 1;
    let code = raw;

    if (raw.includes('*')) {
      const parts = raw.split('*');
      const parsedMult = parseFloat(parts[0].replace(',', '.'));
      if (!isNaN(parsedMult) && parsedMult > 0) {
        multiplier = parsedMult;
        code = parts.slice(1).join('*').trim();
      }
    }

    if (!code) return;

    // Exact barcode
    const exact = products.find((p) => p.barcode.toLowerCase() === code.toLowerCase());
    if (exact) {
      addProductToCart(exact, multiplier);
      return;
    }

    // Top suggestion
    if (searchSuggestions.length > 0) {
      addProductToCart(searchSuggestions[selectedIndex] || searchSuggestions[0], multiplier);
      return;
    }

    // Fuzzy name
    const nameMatch = products.find((p) => p.name.toLowerCase().includes(code.toLowerCase()));
    if (nameMatch) {
      addProductToCart(nameMatch, multiplier);
    } else {
      sound.playAlert();
      alert(`Produto não encontrado: "${code}"`);
    }
  };

  const handleAdjustQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const updated = [...prev];
      const item = updated[index];
      const newQty = Number((item.quantity + delta).toFixed(3));

      if (newQty <= 0) {
        updated.splice(index, 1);
      } else {
        updated[index] = {
          ...item,
          quantity: newQty,
          total: Number((newQty * item.unitPrice).toFixed(2)),
        };
      }
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setCart((prev) => {
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
    sound.playBeep();
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (confirm('Cancelar a venda atual e limpar a lista?')) {
      setCart([]);
      setDiscount(0);
      setLastScannedItem(null);
      barcodeInputRef.current?.focus();
    }
  };

  // Calculations
  const totalItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = Number(cart.reduce((acc, item) => acc + item.total, 0).toFixed(2));
  const finalTotal = Math.max(0, Number((subtotal - discount).toFixed(2)));

  const handleOpenPayment = () => {
    if (cart.length === 0) {
      sound.playAlert();
      return;
    }
    onFinalizeSale(cart, discount);
  };

  const applyDiscount = () => {
    const val = parseFloat(discountInput.replace(',', '.'));
    if (isNaN(val) || val <= 0) {
      setDiscount(0);
    } else if (discountType === 'percent') {
      const calculated = Number(((subtotal * Math.min(val, 100)) / 100).toFixed(2));
      setDiscount(calculated);
    } else {
      setDiscount(Math.min(val, subtotal));
    }
    setDiscountModalOpen(false);
    barcodeInputRef.current?.focus();
  };

  // Filter quick items
  const quickItems = products.filter((p) => {
    if (!p.quickAccess) return false;
    if (quickCategory === 'all') return true;
    return p.category.toLowerCase().includes(quickCategory.toLowerCase());
  }).slice(0, 8);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-3.75rem)] overflow-hidden bg-slate-100/80">
      
      {/* ========================================================
          LEFT COLUMN: Live Cart & Order Ticket (Spacious & Clean)
          ======================================================== */}
      <div className="flex-1 flex flex-col h-full p-3 sm:p-4 overflow-hidden">
        
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200/90 flex flex-col overflow-hidden">
          
          {/* Cart Header Bar */}
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
                {cart.length}
              </div>
              <div>
                <h3 className="font-extrabold text-sm tracking-tight text-white leading-tight">
                  Lista de Compras
                </h3>
                <p className="text-[11px] text-slate-400 font-mono">
                  {totalItemsCount} volume(s) no carrinho
                </p>
              </div>
            </div>

            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold flex items-center space-x-1 transition-all"
                title="Cancelar todos os itens da venda (ESC)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Cancelar Venda</span>
                <kbd className="text-[9px] bg-black/30 px-1 rounded font-mono">ESC</kbd>
              </button>
            )}
          </div>

          {/* Cart Items Table Header */}
          <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 grid grid-cols-12 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-2">Código</div>
            <div className="col-span-4">Descrição</div>
            <div className="col-span-2 text-center">Quantidade</div>
            <div className="col-span-1 text-right">Preço Un.</div>
            <div className="col-span-2 text-right">Total</div>
          </div>

          {/* Cart Items List */}
          <div ref={itemsContainerRef} className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mb-3 text-slate-300">
                  <Barcode className="w-8 h-8" />
                </div>
                <h3 className="text-base font-extrabold text-slate-700 mb-1">Caixa Livre • Passe os Produtos</h3>
                <p className="text-xs text-slate-400 max-w-sm">
                  Utilize o leitor de código de barras ou digite o código/nome ao lado.
                </p>
                <div className="mt-4 flex items-center space-x-2 text-xs font-mono bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-slate-600">
                  <span>Dica de velocidade: Digite</span>
                  <span className="font-extrabold text-emerald-700">3*código</span>
                  <span>para passar 3 unidades!</span>
                </div>
              </div>
            ) : (
              cart.map((item, idx) => {
                const isLast = lastScannedItem?.product.id === item.product.id;
                return (
                  <div
                    key={item.product.id}
                    className={`px-4 py-3 grid grid-cols-12 items-center transition-colors ${
                      isLast ? 'bg-emerald-50/70' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Index */}
                    <div className="col-span-1 text-center">
                      <span className="inline-block w-6 h-6 rounded-md bg-slate-100 font-mono text-xs font-bold text-slate-600 leading-6">
                        {cart.length - idx}
                      </span>
                    </div>

                    {/* Barcode */}
                    <div className="col-span-2 font-mono text-xs font-bold text-slate-500 truncate pr-2">
                      {item.product.barcode}
                    </div>

                    {/* Description */}
                    <div className="col-span-4 pr-2">
                      <div className="font-extrabold text-sm text-slate-900 line-clamp-1">
                        {item.product.name}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {item.product.category} • por {item.product.unit}
                      </span>
                    </div>

                    {/* Quantity with +/- */}
                    <div className="col-span-2 flex items-center justify-center space-x-1.5">
                      <button
                        onClick={() => handleAdjustQuantity(idx, -1)}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-all"
                        title="Diminuir"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-10 text-center font-black font-mono text-sm text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => handleAdjustQuantity(idx, 1)}
                        className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold transition-all"
                        title="Aumentar"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Unit Price */}
                    <div className="col-span-1 text-right font-mono text-xs text-slate-500 font-bold">
                      R$ {item.unitPrice.toFixed(2).replace('.', ',')}
                    </div>

                    {/* Total & Trash */}
                    <div className="col-span-2 flex items-center justify-end space-x-2">
                      <span className="font-mono font-black text-sm text-slate-900">
                        R$ {item.total.toFixed(2).replace('.', ',')}
                      </span>
                      <button
                        onClick={() => handleRemoveItem(idx)}
                        className="text-slate-300 hover:text-rose-600 transition-colors p-1"
                        title="Excluir item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Cart Bottom Shortcuts Bar */}
          <div className="bg-slate-900 text-slate-300 px-4 py-2 border-t border-slate-800 flex items-center justify-between text-xs font-medium">
            <div className="flex items-center space-x-3 flex-wrap">
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 text-emerald-400 rounded font-mono font-bold text-[10px]">F2</kbd>
                <span className="text-slate-400">Leitor</span>
              </span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 text-emerald-400 rounded font-mono font-bold text-[10px]">F4</kbd>
                <span className="text-slate-400">Cobrar</span>
              </span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 text-emerald-400 rounded font-mono font-bold text-[10px]">F7</kbd>
                <span className="text-slate-400">Consultar</span>
              </span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 text-emerald-400 rounded font-mono font-bold text-[10px]">F8</kbd>
                <span className="text-slate-400">Desconto</span>
              </span>
              <span className="flex items-center space-x-1">
                <kbd className="px-1.5 py-0.5 bg-slate-800 text-emerald-400 rounded font-mono font-bold text-[10px]">ESC</kbd>
                <span className="text-slate-400">Cancelar</span>
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              Operador: <strong className="text-white">{currentUser.name}</strong>
            </div>
          </div>

        </div>

      </div>

      {/* ========================================================
          RIGHT COLUMN: Scanner, Quick Touch & Big OLED Total
          ======================================================== */}
      <div className="w-full lg:w-[420px] p-3 sm:p-4 flex flex-col justify-between space-y-3 overflow-y-auto">
        
        {/* CARD 1: Barcode Scanner Input */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative">
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5 flex items-center justify-between">
            <span className="flex items-center space-x-1">
              <Barcode className="w-3.5 h-3.5 text-emerald-600" />
              <span>Leitor de Código de Barras / Busca [F2]</span>
            </span>
            <span className="text-[10px] text-emerald-600 font-mono font-bold">Foco Automático</span>
          </label>

          <form onSubmit={handleProcessInput} className="relative flex items-center">
            <input
              ref={barcodeInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Bipe ou digite (ex: 3*789... ou cafe)..."
              className="w-full h-13 pl-3.5 pr-20 bg-slate-50 border-2 border-slate-300 rounded-xl font-bold text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20 shadow-inner"
              autoFocus
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-extrabold shadow transition-all"
            >
              Inserir ↵
            </button>
          </form>

          {/* Autocomplete dropdown */}
          {searchSuggestions.length > 0 && (
            <div className="absolute top-22 left-4 right-4 z-40 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
              {searchSuggestions.map((prod, idx) => (
                <div
                  key={prod.id}
                  onClick={() => addProductToCart(prod, 1)}
                  className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors ${
                    idx === selectedIndex ? 'bg-emerald-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">{prod.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">Cód: {prod.barcode}</div>
                  </div>
                  <div className="text-xs font-black font-mono text-emerald-600">
                    R$ {prod.sellPrice.toFixed(2).replace('.', ',')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CARD 2: Quick Access Items (Padaria, Balcão, Hortifrúti) */}
        <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Itens Rápidos de Balcão</span>
            </span>
            <button
              onClick={onOpenPriceCheck}
              className="text-[11px] font-bold text-emerald-700 hover:underline flex items-center space-x-1"
            >
              <span>Consultar [F7]</span>
            </button>
          </div>

          {/* Quick Categories Bar */}
          <div className="flex space-x-1 mb-2">
            {['all', 'padaria', 'hortifrúti', 'bebidas'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setQuickCategory(cat)}
                className={`px-2 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all ${
                  quickCategory === cat
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat === 'all' ? 'Todos' : cat}
              </button>
            ))}
          </div>

          {/* Quick Touch Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 overflow-y-auto max-h-[160px]">
            {quickItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => addProductToCart(item, 1)}
                className="p-2 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-left transition-all active:scale-95 group"
              >
                <div className="text-[11px] font-bold text-slate-800 truncate group-hover:text-emerald-700">
                  {item.name}
                </div>
                <div className="text-xs font-black font-mono text-emerald-600 mt-0.5">
                  R$ {item.sellPrice.toFixed(2).replace('.', ',')}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* CARD 3: Deep Slate OLED POS Total Display */}
        <div className="bg-slate-950 text-white rounded-3xl p-5 border-2 border-emerald-500/30 shadow-2xl space-y-3">
          <div className="flex justify-between items-center text-xs text-slate-400 border-b border-slate-800/80 pb-2">
            <span>Subtotal da Venda:</span>
            <span className="font-mono font-bold text-sm text-slate-200">
              R$ {subtotal.toFixed(2).replace('.', ',')}
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <button
              onClick={() => setDiscountModalOpen(true)}
              className="text-emerald-400 hover:text-emerald-300 font-bold flex items-center space-x-1"
            >
              <Tag className="w-3 h-3" />
              <span>Desconto [F8]:</span>
            </button>
            <span className="font-mono font-bold text-amber-400">
              - R$ {discount.toFixed(2).replace('.', ',')}
            </span>
          </div>

          {/* Giant LED Total Display */}
          <div className="pt-1">
            <div className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 mb-0.5 flex justify-between">
              <span>TOTAL A PAGAR</span>
              <span className="font-mono text-slate-400">{cart.length} itens</span>
            </div>
            <div className="font-pos-display text-4xl sm:text-5xl font-black text-emerald-400 text-right tracking-tight drop-shadow-md">
              R$ {finalTotal.toFixed(2).replace('.', ',')}
            </div>
          </div>

          {/* Huge Checkout Action Button */}
          <button
            onClick={handleOpenPayment}
            disabled={cart.length === 0}
            className={`w-full py-4 px-5 rounded-2xl font-black text-base sm:text-lg shadow-xl transition-all flex items-center justify-center space-x-2.5 active:scale-[0.98] ${
              cart.length > 0
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25 cursor-pointer'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
            }`}
          >
            <CreditCard className="w-5 h-5" />
            <span>FINALIZAR VENDA</span>
            <kbd className="px-2 py-0.5 bg-black/20 text-slate-950 rounded-lg text-xs font-mono font-black">
              F4
            </kbd>
          </button>
        </div>

      </div>

      {/* Discount Modal (F8) */}
      {discountModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center space-x-2">
                <Tag className="w-4 h-4 text-emerald-600" />
                <span>Aplicar Desconto [F8]</span>
              </h3>
              <button
                onClick={() => setDiscountModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setDiscountType('fixed')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    discountType === 'fixed' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Valor Fixo (R$)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    discountType === 'percent' ? 'bg-white shadow text-slate-900' : 'text-slate-600'
                  }`}
                >
                  Porcentagem (%)
                </button>
              </div>

              <div>
                <input
                  type="text"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  placeholder={discountType === 'fixed' ? '0,00' : '0%'}
                  className="w-full text-center text-2xl font-black text-slate-900 font-mono p-3 bg-slate-50 rounded-xl border border-slate-300 focus:border-emerald-500 outline-none"
                  autoFocus
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDiscount(0);
                    setDiscountModalOpen(false);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Zerar
                </button>
                <button
                  type="button"
                  onClick={applyDiscount}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white shadow-md flex items-center justify-center space-x-1"
                >
                  <Check className="w-4 h-4" />
                  <span>Confirmar</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
