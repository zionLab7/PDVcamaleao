import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Barcode, CheckCircle2 } from 'lucide-react';
import { Product } from '../../types';
import { sound } from '../../services/audio';

interface PriceCheckModalProps {
  products: Product[];
  onClose: () => void;
  onAddToCart?: (product: Product) => void;
}

export const PriceCheckModal: React.FC<PriceCheckModalProps> = ({
  products,
  onClose,
  onAddToCart,
}) => {
  const [query, setQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = query.trim().toLowerCase();
    if (!clean) return;

    const found = products.find(
      (p) => p.barcode.toLowerCase() === clean || p.name.toLowerCase().includes(clean)
    );

    if (found) {
      sound.playBeep();
      setSelectedProduct(found);
    } else {
      sound.playAlert();
      setSelectedProduct(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Search className="w-5 h-5 text-emerald-400" />
            <h3 className="font-extrabold text-base">Consulta Rápida de Preço [F7]</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Input */}
        <div className="p-5">
          <form onSubmit={handleSearch} className="relative mb-4">
            <Barcode className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Bipe ou digite o código/nome do produto..."
              className="w-full h-12 pl-11 pr-24 bg-slate-50 border-2 border-slate-300 rounded-xl font-bold text-slate-900 outline-none focus:border-emerald-500"
            />
            <button
              type="submit"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg"
            >
              Consultar
            </button>
          </form>

          {/* Result Card */}
          {selectedProduct ? (
            <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-5 text-center space-y-3 animate-fade-in">
              <span className="text-xs font-mono font-bold uppercase text-emerald-800 px-2 py-0.5 bg-emerald-100 rounded-md">
                {selectedProduct.category} • Cód: {selectedProduct.barcode}
              </span>
              <h4 className="text-xl font-black text-slate-900 leading-tight">
                {selectedProduct.name}
              </h4>
              <div className="text-4xl font-black text-emerald-600 font-mono">
                R$ {selectedProduct.sellPrice.toFixed(2).replace('.', ',')}
              </div>
              <div className="text-xs text-slate-600">
                Preço por <strong>{selectedProduct.unit}</strong> | Estoque disponível: <strong>{selectedProduct.stock} {selectedProduct.unit}</strong>
              </div>

              {onAddToCart && (
                <button
                  onClick={() => {
                    onAddToCart(selectedProduct);
                    onClose();
                  }}
                  className="mt-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-all"
                >
                  Adicionar à Venda Atual
                </button>
              )}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs bg-slate-50 rounded-2xl border border-dashed border-slate-300">
              Passe o leitor de código de barras ou digite o nome do produto para visualizar o preço instantaneamente na tela.
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 text-center text-xs text-slate-500">
          Pressione <kbd className="px-1.5 py-0.5 bg-slate-200 rounded font-mono font-bold">ESC</kbd> para fechar
        </div>

      </div>
    </div>
  );
};
