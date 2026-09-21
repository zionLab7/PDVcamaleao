import React, { useState, useEffect } from 'react';
import { 
  X, 
  Plus, 
  Edit2, 
  Trash2, 
  Check, 
  FolderPlus, 
  Tag, 
  Loader2,
  Palette
} from 'lucide-react';
import * as api from '../../services/api';
import { sound } from '../../services/audio';

interface CategoryItem {
  id: string;
  name: string;
  color?: string;
}

interface CategoryManagerModalProps {
  onClose: () => void;
  onCategoriesChanged?: () => void;
}

const colorPresets = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#f97316', // orange
  '#64748b', // slate
  '#14b8a6', // teal
];

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  onClose,
  onCategoriesChanged,
}) => {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#10b981');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('#10b981');
  const [actionLoading, setActionLoading] = useState(false);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const data = await api.categories.list();
      setCategories(data);
    } catch (err: any) {
      console.error('Erro ao carregar categorias:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    setActionLoading(true);
    try {
      await api.categories.create({
        name: newCatName.trim(),
        color: newCatColor,
      });
      sound.playSuccess();
      setNewCatName('');
      await loadCategories();
      onCategoriesChanged?.();
    } catch (err: any) {
      sound.playAlert();
      alert(err.message || 'Erro ao criar categoria.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartEdit = (cat: CategoryItem) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setEditingColor(cat.color || '#10b981');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editingName.trim()) return;

    setActionLoading(true);
    try {
      await api.categories.update(id, {
        name: editingName.trim(),
        color: editingColor,
      });
      sound.playSuccess();
      setEditingId(null);
      await loadCategories();
      onCategoriesChanged?.();
    } catch (err: any) {
      sound.playAlert();
      alert(err.message || 'Erro ao atualizar categoria.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteCategory = async (cat: CategoryItem) => {
    if (!confirm(`Tem certeza que deseja excluir a categoria "${cat.name}"?`)) {
      return;
    }

    setActionLoading(true);
    try {
      await api.categories.delete(cat.id);
      sound.playSuccess();
      await loadCategories();
      onCategoriesChanged?.();
    } catch (err: any) {
      sound.playAlert();
      alert(err.message || 'Erro ao excluir categoria.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-base">Gerenciar Categorias</h3>
              <p className="text-[11px] text-slate-400">
                Personalize, adicione ou renomeie as categorias de produtos da sua loja
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

        {/* Create Category Form */}
        <form onSubmit={handleCreateCategory} className="p-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
            <FolderPlus className="w-4 h-4 text-emerald-600" />
            <span>Adicionar Nova Categoria</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="Ex: Bebidas Importadas, Tabacaria, Embalagens..."
              className="flex-1 px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-emerald-500"
            />

            {/* Color Presets */}
            <div className="flex items-center space-x-1 bg-white p-1.5 rounded-xl border border-slate-300 shrink-0">
              {colorPresets.slice(0, 5).map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewCatColor(color)}
                  style={{ backgroundColor: color }}
                  className={`w-5 h-5 rounded-full transition-transform ${
                    newCatColor === color ? 'scale-125 ring-2 ring-slate-900' : 'opacity-80 hover:opacity-100'
                  }`}
                />
              ))}
            </div>

            <button
              type="submit"
              disabled={actionLoading || !newCatName.trim()}
              className="py-2 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center space-x-1 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar</span>
            </button>
          </div>
        </form>

        {/* Categories List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-2 max-h-[50vh]">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 space-x-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-xs font-bold">Carregando categorias...</span>
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              Nenhuma categoria cadastrada ainda.
            </div>
          ) : (
            categories.map((cat) => (
              <div 
                key={cat.id}
                className="p-3 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between transition-all"
              >
                {editingId === cat.id ? (
                  <div className="flex items-center space-x-2 flex-1 mr-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 p-2 bg-slate-50 border border-emerald-500 rounded-xl text-xs font-bold text-slate-900 outline-none"
                      autoFocus
                    />
                    <div className="flex items-center space-x-1">
                      {colorPresets.slice(0, 4).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditingColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-4 h-4 rounded-full ${editingColor === c ? 'ring-2 ring-slate-900' : ''}`}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(cat.id)}
                      className="p-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs"
                      title="Salvar"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs"
                      title="Cancelar"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-2.5">
                      <span 
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: cat.color || '#10b981' }}
                      />
                      <span className="text-xs font-extrabold text-slate-900">
                        {cat.name}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(cat)}
                        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition-colors"
                        title="Editar / Renomear"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat)}
                        className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                        title="Excluir Categoria"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow"
          >
            Concluir
          </button>
        </div>

      </div>
    </div>
  );
};
