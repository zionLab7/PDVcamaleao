import React, { useState, useEffect } from 'react';
import { 
  Users, 
  X, 
  Lock, 
  Unlock, 
  KeyRound, 
  ShieldCheck, 
  ShieldAlert, 
  UserPlus, 
  Trash2, 
  Delete,
  CheckCircle2,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { User, UserRole } from '../../types';
import * as api from '../../services/api';
import { sound } from '../../services/audio';

interface UsersModalProps {
  currentUser?: User | null;
  onClose: () => void;
  onUserChanged: (newUser: User) => void;
  embedded?: boolean;
}

export const UsersModal: React.FC<UsersModalProps> = ({
  currentUser,
  onClose,
  onUserChanged,
  embedded = false,
}) => {
  const [activeTab, setActiveTab] = useState<'switch' | 'manage'>('switch');
  const [users, setUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  
  // Selected user to switch to
  const [targetUserId, setTargetUserId] = useState<string>('');
  const [pinInput, setPinInput] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isShaking, setIsShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New user form state
  const [newUserName, setNewUserName] = useState('');
  const [newUserPin, setNewUserPin] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('cashier');
  const [isCreating, setIsCreating] = useState(false);

  const isAdmin = currentUser?.role === 'admin';

  // Fetch users from API
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      const data = await api.users.list();
      setUsers(data || []);
      if (data && data.length > 0) {
        // Default target user
        if (currentUser) {
          setTargetUserId(currentUser.id);
        } else {
          setTargetUserId(data[0].id);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Erro ao carregar colaboradores');
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const targetUser = users.find((u) => u.id === targetUserId) || users[0];

  // Handle number click on PIN pad
  const handleDigitClick = (digit: string) => {
    if (pinInput.length < 4 && !isSubmitting) {
      const nextPin = pinInput + digit;
      setPinInput(nextPin);
      setErrorMessage('');
      sound.playBeep();

      if (nextPin.length === 4) {
        validateAndLogin(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    if (isSubmitting) return;
    setPinInput((prev) => prev.slice(0, -1));
    setErrorMessage('');
  };

  const handleClear = () => {
    if (isSubmitting) return;
    setPinInput('');
    setErrorMessage('');
  };

  // Physical keyboard listener for PIN pad
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'switch' || isSubmitting) return;
      if (e.key >= '0' && e.key <= '9') {
        handleDigitClick(e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape' && !embedded) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinInput, targetUserId, activeTab, isSubmitting, embedded]);

  const validateAndLogin = async (pinToTest: string) => {
    if (!targetUserId) return;

    try {
      setIsSubmitting(true);
      const result = await api.auth.loginWithPin(targetUserId, pinToTest);
      sound.playSuccess();
      
      const loggedUser: User = {
        id: result.user.id,
        name: result.user.name,
        username: (result.user as any).username || result.user.name.toLowerCase().replace(/\s+/g, ''),
        role: result.user.role as UserRole,
        pin: '',
        createdAt: Date.now(),
      };

      onUserChanged(loggedUser);
      if (!embedded) {
        onClose();
      }
    } catch (err: any) {
      sound.playAlert();
      setErrorMessage(err.message || 'PIN incorreto. Acesso negado.');
      setIsShaking(true);
      setTimeout(() => {
        setIsShaking(false);
        setPinInput('');
      }, 500);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create new user (Admin only)
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || newUserPin.length !== 4) {
      alert('Informe o nome e um PIN numérico de exatamente 4 dígitos.');
      return;
    }

    try {
      setIsCreating(true);
      await api.users.create({
        name: newUserName.trim(),
        username: newUserName.toLowerCase().replace(/\s+/g, '') + Math.floor(Math.random() * 100),
        pin: newUserPin.trim(),
        role: newUserRole,
      });

      sound.playSuccess();
      setNewUserName('');
      setNewUserPin('');
      alert(`Colaborador ${newUserName.trim()} criado com sucesso!`);
      fetchUsers();
    } catch (err: any) {
      alert(err.message || 'Erro ao criar colaborador.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteUser = async (userId: string, name: string) => {
    if (currentUser && userId === currentUser.id) {
      alert('Você não pode excluir o usuário que está atualmente logado.');
      return;
    }
    if (confirm(`Deseja realmente remover o colaborador "${name}"?`)) {
      try {
        await api.users.delete(userId);
        sound.playBeep();
        fetchUsers();
      } catch (err: any) {
        alert(err.message || 'Erro ao remover colaborador.');
      }
    }
  };

  const modalContent = (
    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col">
      
      {/* Top Header */}
      <div className="bg-slate-900 text-white p-4 sm:p-5 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center space-x-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-base leading-tight">
              Identificação de Operador
            </h3>
            <p className="text-[11px] text-slate-400">
              Digite o seu PIN de 4 dígitos para acessar
            </p>
          </div>
        </div>
        {!embedded && (
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tab Selector (only if user is already admin) */}
      {isAdmin && !embedded && (
        <div className="flex bg-slate-100 p-1 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('switch')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'switch' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Identificação de Caixa
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manage')}
            className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all ${
              activeTab === 'manage' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Gerenciar Colaboradores
          </button>
        </div>
      )}

      {/* TAB 1: Switch with mandatory PIN */}
      {activeTab === 'switch' && (
        <div className="p-5 sm:p-6 flex flex-col items-center">
          
          {loadingUsers ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
              <span className="text-xs">Carregando operadores...</span>
            </div>
          ) : (
            <>
              {/* Target User Selector */}
              <div className="w-full mb-4">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5 text-center">
                  Quem está assumindo o caixa?
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {users.map((u) => {
                    const isSelected = u.id === targetUserId;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setTargetUserId(u.id);
                          setPinInput('');
                          setErrorMessage('');
                        }}
                        className={`p-2.5 rounded-2xl border text-center transition-all ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100 opacity-75'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900 truncate">
                          {u.name.split(' ')[0]}
                        </div>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase mt-1 ${
                          u.role === 'admin'
                            ? 'bg-purple-100 text-purple-800'
                            : u.role === 'manager'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {u.role === 'admin' ? 'Dono' : u.role === 'manager' ? 'Gerente' : 'Caixa'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Selected User Badge */}
              {targetUser && (
                <div className="text-center mb-3">
                  <div className="text-xs text-slate-500">Operador:</div>
                  <div className="text-sm font-black text-slate-900">{targetUser.name}</div>
                </div>
              )}

              {/* 4-Digit Security Dots */}
              <div className={`flex items-center space-x-3 mb-3 p-3 bg-slate-50 rounded-2xl border ${
                errorMessage ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200'
              } ${isShaking ? 'animate-bounce' : ''}`}>
                {[0, 1, 2, 3].map((index) => {
                  const filled = pinInput.length > index;
                  return (
                    <div
                      key={index}
                      className={`w-4 h-4 rounded-full transition-all duration-200 ${
                        filled
                          ? 'bg-emerald-600 scale-110 shadow-sm'
                          : 'bg-slate-200 border border-slate-300'
                      }`}
                    />
                  );
                })}
              </div>

              {/* Error Message */}
              {errorMessage && (
                <div className="flex items-center space-x-1.5 text-rose-600 text-xs font-bold mb-3">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* NUMERIC KEYPAD */}
              <div className="grid grid-cols-3 gap-2 w-full max-w-[260px] mb-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDigitClick(digit)}
                    className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-50 active:bg-emerald-100 hover:border-emerald-300 border border-slate-200 text-slate-800 text-lg font-black transition-all active:scale-95 shadow-sm flex items-center justify-center disabled:opacity-50"
                  >
                    {digit}
                  </button>
                ))}
                
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleClear}
                  className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 text-xs font-bold transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
                >
                  LIMPAR
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleDigitClick('0')}
                  className="h-12 rounded-2xl bg-slate-100 hover:bg-emerald-50 active:bg-emerald-100 hover:border-emerald-300 border border-slate-200 text-slate-800 text-lg font-black transition-all active:scale-95 shadow-sm flex items-center justify-center disabled:opacity-50"
                >
                  0
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleBackspace}
                  className="h-12 rounded-2xl bg-slate-100 hover:bg-rose-50 hover:border-rose-300 border border-slate-200 text-slate-600 hover:text-rose-600 transition-all active:scale-95 flex items-center justify-center disabled:opacity-50"
                >
                  <Delete className="w-5 h-5" />
                </button>
              </div>

              {isSubmitting && (
                <div className="flex items-center space-x-2 text-xs text-slate-500 mt-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500" />
                  <span>Validando PIN...</span>
                </div>
              )}

              {embedded && (
                <button
                  type="button"
                  onClick={onClose}
                  className="mt-4 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  ← Voltar para tela de login da loja
                </button>
              )}
            </>
          )}

        </div>
      )}

      {/* TAB 2: Manage Users (Admin Only) */}
      {activeTab === 'manage' && isAdmin && (
        <div className="p-5 sm:p-6 overflow-y-auto max-h-[480px]">
          
          {/* New User Form */}
          <form onSubmit={handleCreateUser} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-6">
            <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-3 flex items-center space-x-1.5">
              <UserPlus className="w-4 h-4 text-emerald-600" />
              <span>Cadastrar Novo Colaborador</span>
            </h4>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Nome Completo:
                </label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Ex: Ana Souza"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    PIN (4 dígitos):
                  </label>
                  <input
                    type="password"
                    maxLength={4}
                    value={newUserPin}
                    onChange={(e) => setNewUserPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 font-mono tracking-widest text-center focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Nível de Acesso:
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="cashier">Caixa</option>
                    <option value="manager">Gerente</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={isCreating}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center space-x-1.5"
              >
                {isCreating ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Salvar Colaborador</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Current Users List */}
          <div>
            <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
              Colaboradores Cadastrados ({users.length})
            </h4>

            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-2xl"
                >
                  <div>
                    <div className="text-xs font-bold text-slate-900">{u.name}</div>
                    <div className="flex items-center space-x-2 mt-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                        u.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : u.role === 'manager'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {u.role === 'admin' ? 'Dono' : u.role === 'manager' ? 'Gerente' : 'Caixa'}
                      </span>
                    </div>
                  </div>

                  {currentUser && u.id !== currentUser.id && (
                    <button
                      type="button"
                      onClick={() => handleDeleteUser(u.id, u.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      title="Excluir Colaborador"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

    </div>
  );

  if (embedded) {
    return modalContent;
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {modalContent}
    </div>
  );
};
