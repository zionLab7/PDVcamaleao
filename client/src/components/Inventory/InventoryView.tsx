import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  AlertTriangle, 
  Package, 
  TrendingUp, 
  Edit3, 
  Trash2, 
  ArrowUpCircle, 
  Check, 
  Filter,
  EyeOff,
  Tag
} from 'lucide-react';
import { Product, User } from '../../types';
import * as api from '../../services/api';
import { auth } from '../../services/auth';
import { sound } from '../../services/audio';
import { CategoryManagerModal } from './CategoryManagerModal';

interface InventoryViewProps {
  products: Product[];
  currentUser: User;
  onOpenNewProduct: () => void;
  onEditProduct: (product: Product) => void;
  onRefresh?: () => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  products,
  currentUser,
  onOpenNewProduct,
  onEditProduct,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterLowStockOnly, setFilterLowStockOnly] = useState<boolean>(false);
  const [quickStockId, setQuickStockId] = useState<string | null>(null);
  const [quickStockAmount, setQuickStockAmount] = useState<string>('10');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [registeredCategories, setRegisteredCategories] = useState<Array<{ id: string; name: string; color?: string }>>([]);

  const canViewCosts = auth.canViewCostsAndProfit(currentUser);
  const canManage = auth.canManageStock(currentUser);

  const loadRegisteredCategories = async () => {
    try {
      const data = await api.categories.list();
      setRegisteredCategories(data);
    } catch (err) {
      console.error('Erro ao listar categorias no estoque:', err);
    }
  };

  useEffect(() => {
    loadRegisteredCategories();
  }, []);

  // Extract unique categories (registered + existing in products)
  const categories = [
    'all',
    ...Array.from(
      new Set([
        ...registeredCategories.map((c) => c.name),
        ...products.map((p) => p.category),
      ])
    ).filter(Boolean),
  ];

  // Filter products
  const filteredProducts = products.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || product.category === selectedCategory;
    const matchesLowStock = !filterLowStockOnly || product.stock <= product.minStock;

    return matchesSearch && matchesCategory && matchesLowStock;
  });

  // Low stock stats
  const lowStockCount = products.filter((p) => p.stock <= p.minStock).length;
  const outOfStockCount = products.filter((p) => p.stock <= 0).length;

  // Handle Quick Stock Intake
  const handleQuickAddStock = async (productId: string) => {
    const amount = parseFloat(quickStockAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    try {
      await api.products.updateStock(productId, amount);
      sound.playSuccess();
      setQuickStockId(null);
      onRefresh?.();
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar estoque.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!canManage) {
      alert('Apenas Gerente ou Administrador podem excluir produtos.');
      return;
    }
    if (confirm(`Deseja realmente remover o produto "${name}" do catálogo?`)) {
      try {
        await api.products.delete(id);
        sound.playBeep();
        onRefresh?.();
      } catch (err: any) {
        alert(err.message || 'Erro ao excluir produto.');
      }
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-6 bg-slate-100 overflow-y-auto max-w-7xl mx-auto w-full">
      
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <Package className="w-7 h-7 text-emerald-600" />
            <span>Controle de Estoque & Produtos</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Gerencie itens, preços, reposição rápida e monitore alertas de estoque mínimo
          </p>
        </div>

        {canManage && (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsCategoryModalOpen(true)}
              className="py-2.5 px-3.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-xl shadow-sm flex items-center space-x-1.5 transition-all active:scale-95"
              title="Gerenciar e personalizar categorias de produtos"
            >
              <Tag className="w-4 h-4 text-slate-500" />
              <span>Categorias</span>
            </button>

            <button
              onClick={onOpenNewProduct}
              className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-600/20 flex items-center space-x-2 transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Cadastrar Novo Produto</span>
            </button>
          </div>
        )}
      </div>

      {/* Low Stock Warning Banner */}
      {lowStockCount > 0 && (
        <div className="mb-5 p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center flex-shrink-0 font-bold">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-extrabold text-amber-950 text-sm">
                Aviso de Estoque Baixo: {lowStockCount} produto(s) precisam de reposição urgente!
              </h4>
              <p className="text-xs text-amber-800 font-medium">
                {outOfStockCount > 0 && (
                  <strong className="text-rose-700 underline mr-1">
                    {outOfStockCount} produto(s) estão totalmente ZERADOS.
                  </strong>
                )}
                Reponha o estoque para evitar faltas na hora do movimento.
              </p>
            </div>
          </div>

          <button
            onClick={() => setFilterLowStockOnly(!filterLowStockOnly)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center space-x-1.5 ${
              filterLowStockOnly
                ? 'bg-amber-600 text-white'
                : 'bg-white text-amber-900 border border-amber-400 hover:bg-amber-100'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{filterLowStockOnly ? 'Ver Todos os Produtos' : 'Filtrar Apenas Estoque Baixo'}</span>
          </button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 mb-5 flex flex-col lg:flex-row gap-3 items-center justify-between">
        
        {/* Search Input */}
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por código, nome ou categoria..."
            className="w-full h-11 pl-10 pr-4 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 placeholder:text-slate-400 outline-none focus:border-emerald-500 transition-all"
          />
        </div>

        {/* Category Pill Buttons */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full lg:w-auto pb-1 lg:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? 'Todas as Categorias' : cat}
            </button>
          ))}
        </div>

      </div>

      {/* Products Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-4">Produto</th>
                <th className="py-3 px-3">Cód. Barras</th>
                <th className="py-3 px-3">Categoria</th>
                {canViewCosts && <th className="py-3 px-3 text-right">Custo</th>}
                <th className="py-3 px-3 text-right">Venda</th>
                {canViewCosts && <th className="py-3 px-3 text-right">Margem</th>}
                <th className="py-3 px-4 text-center">Estoque Atual</th>
                <th className="py-3 px-4 text-center">Ações Rápidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    Nenhum produto encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((p) => {
                  const isLow = p.stock <= p.minStock;
                  const isZero = p.stock <= 0;
                  const margin = p.costPrice > 0 
                    ? (((p.sellPrice - p.costPrice) / p.sellPrice) * 100).toFixed(1)
                    : '100';

                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Product Name */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                        <div className="text-[11px] text-slate-400">Unidade: {p.unit}</div>
                      </td>

                      {/* Barcode */}
                      <td className="py-3 px-3 font-mono font-bold text-slate-600">
                        {p.barcode}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 font-bold text-slate-700 text-[10px]">
                          {p.category}
                        </span>
                      </td>

                      {/* Cost (Restricted to Manager/Admin) */}
                      {canViewCosts && (
                        <td className="py-3 px-3 text-right font-mono text-slate-500 font-medium">
                          R$ {p.costPrice.toFixed(2).replace('.', ',')}
                        </td>
                      )}

                      {/* Sell Price */}
                      <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-sm">
                        R$ {p.sellPrice.toFixed(2).replace('.', ',')}
                      </td>

                      {/* Profit Margin (Restricted) */}
                      {canViewCosts && (
                        <td className="py-3 px-3 text-right">
                          <span className={`font-mono font-bold text-xs ${
                            parseFloat(margin) > 30 ? 'text-emerald-600' : 'text-amber-600'
                          }`}>
                            {margin}%
                          </span>
                        </td>
                      )}

                      {/* Stock Level with Colored Badge */}
                      <td className="py-3 px-4 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span className={`px-2.5 py-1 rounded-full font-black font-mono text-xs ${
                            isZero
                              ? 'bg-rose-100 text-rose-700 border border-rose-300 animate-pulse'
                              : isLow
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {p.stock} {p.unit}
                          </span>
                          <span className="text-[9px] text-slate-400 mt-0.5">
                            Mínimo: {p.minStock} {p.unit}
                          </span>
                        </div>
                      </td>

                      {/* Quick Actions (Quick intake, Edit, Delete) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center space-x-1.5">
                          {quickStockId === p.id ? (
                            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-300 animate-fade-in">
                              <span className="text-[10px] font-bold text-slate-500 pl-1">+</span>
                              <input
                                type="text"
                                value={quickStockAmount}
                                onChange={(e) => setQuickStockAmount(e.target.value)}
                                className="w-12 text-center p-1 bg-white font-mono font-bold text-xs rounded-lg border border-slate-300 outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleQuickAddStock(p.id)}
                                className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs"
                                title="Confirmar entrada"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setQuickStockId(p.id);
                                setQuickStockAmount('10');
                              }}
                              className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-[10px] font-bold transition-all flex items-center space-x-1"
                              title="Adicionar entrada rápida de mercadoria no estoque"
                            >
                              <ArrowUpCircle className="w-3.5 h-3.5" />
                              <span>+Estoque</span>
                            </button>
                          )}

                          {canManage && (
                            <button
                              onClick={() => onEditProduct(p)}
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Editar cadastro"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {canManage && (
                            <button
                              onClick={() => handleDelete(p.id, p.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Excluir produto"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Manager Modal */}
      {isCategoryModalOpen && (
        <CategoryManagerModal
          onClose={() => setIsCategoryModalOpen(false)}
          onCategoriesChanged={() => {
            loadRegisteredCategories();
            onRefresh?.();
          }}
        />
      )}

    </div>
  );
};
