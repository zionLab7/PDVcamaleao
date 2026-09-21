import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  ShoppingBag, 
  RotateCcw, 
  Printer, 
  Download, 
  Calendar, 
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  ShieldAlert
} from 'lucide-react';
import { Sale, User, StoreSettings } from '../../types';
import * as api from '../../services/api';
import { auth } from '../../services/auth';
import { sound } from '../../services/audio';

interface ReportsViewProps {
  sales: Sale[];
  currentUser: User;
  settings: StoreSettings;
  onReprintReceipt: (sale: Sale) => void;
  onRefresh?: () => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  sales,
  currentUser,
  settings,
  onReprintReceipt,
  onRefresh,
}) => {
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [supervisorPin, setSupervisorPin] = useState('');
  const [cancellingSaleId, setCancellingSaleId] = useState<string | null>(null);
  const [pinError, setPinError] = useState('');

  const canViewFinancials = auth.canViewCostsAndProfit(currentUser);
  const canCancel = auth.canCancelSale(currentUser);

  // Filter sales based on period
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfWeek = startOfToday - 6 * 86400000;
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const filteredSales = sales.filter((s) => {
    if (period === 'today') return s.timestamp >= startOfToday;
    if (period === 'week') return s.timestamp >= startOfWeek;
    if (period === 'month') return s.timestamp >= startOfMonth;
    return true;
  });

  const activeSales = filteredSales.filter((s) => s.status !== 'cancelled');

  // KPI calculations
  const totalRevenue = activeSales.reduce((acc, s) => acc + s.total, 0);
  const totalOrders = activeSales.length;
  const averageTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalItemsSold = activeSales.reduce(
    (acc, s) => acc + s.items.reduce((sum, i) => sum + i.quantity, 0),
    0
  );

  // Profit calculation (sell price - cost price of items sold)
  const totalProfit = activeSales.reduce((acc, s) => {
    const saleCost = s.items.reduce(
      (sum, i) => sum + (i.product.costPrice || 0) * i.quantity,
      0
    );
    return acc + (s.total - saleCost);
  }, 0);
  const profitMarginPercent = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

  // Payment Breakdown
  const paymentBreakdown: Record<string, number> = {
    dinheiro: 0,
    pix: 0,
    debito: 0,
    credito: 0,
    fiado: 0,
  };

  activeSales.forEach((s) => {
    s.payments.forEach((p) => {
      const key = p.method === 'multiplo' ? 'dinheiro' : p.method;
      paymentBreakdown[key] = (paymentBreakdown[key] || 0) + p.amount;
    });
  });

  // Top selling products ranking
  const productRankingMap = new Map<string, { name: string; qty: number; total: number }>();
  activeSales.forEach((s) => {
    s.items.forEach((item) => {
      const existing = productRankingMap.get(item.product.id) || {
        name: item.product.name,
        qty: 0,
        total: 0,
      };
      existing.qty += item.quantity;
      existing.total += item.total;
      productRankingMap.set(item.product.id, existing);
    });
  });

  const topProducts = Array.from(productRankingMap.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  // Handle Cancel / Refund Sale
  const handleConfirmCancelSale = async (saleId: string) => {
    setPinError('');

    if (currentUser.role === 'cashier') {
      const verified = await api.supervisor.verifyPin(supervisorPin).catch(() => ({ valid: false }));
      if (!verified.valid) {
        sound.playAlert();
        setPinError('PIN de autorização incorreto.');
        return;
      }
    }

    try {
      await api.sales.cancel(saleId);
      sound.playSuccess();
      alert('Venda cancelada com sucesso! Os itens foram devolvidos ao estoque.');
      setCancellingSaleId(null);
      setSupervisorPin('');
      onRefresh?.();
    } catch (err: any) {
      sound.playAlert();
      alert(err.message || 'Erro ao cancelar venda.');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Numero', 'Data', 'Operador', 'Cliente', 'Itens', 'Total', 'Forma', 'Status'];
    const rows = filteredSales.map((s) => [
      s.sequenceNumber,
      new Date(s.timestamp).toLocaleString('pt-BR'),
      `"${s.operatorName}"`,
      `"${s.customerName || 'Consumidor'}"`,
      s.items.length,
      s.total.toFixed(2).replace('.', ','),
      `"${s.payments.map((p) => p.method).join('+')}"`,
      s.status === 'completed' ? 'Concluida' : 'Cancelada',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `relatorio_vendas_${period}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 p-4 sm:p-6 bg-slate-100 overflow-y-auto max-w-7xl mx-auto w-full">
      
      {/* Top Header & Period Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center space-x-2">
            <BarChart3 className="w-7 h-7 text-emerald-600" />
            <span>Relatório de Vendas & Desempenho Financeiro</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Acompanhe em tempo real o faturamento, margens de lucro, métodos de recebimento e histórico
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Period Filter */}
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm text-xs font-bold">
            <button
              onClick={() => setPeriod('today')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'today' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Hoje
            </button>
            <button
              onClick={() => setPeriod('week')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'week' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              7 Dias
            </button>
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'month' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mês
            </button>
            <button
              onClick={() => setPeriod('all')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                period === 'all' ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tudo
            </button>
          </div>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="p-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl shadow-sm transition-all"
            title="Exportar dados para planilha Excel / CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        
        {/* Card 1: Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Faturamento Bruto
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
            R$ {totalRevenue.toFixed(2).replace('.', ',')}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {totalOrders} venda(s) realizada(s)
          </span>
        </div>

        {/* Card 2: Profit (Restricted) */}
        {canViewFinancials ? (
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                Lucro Bruto Estimado
              </span>
              <div className="w-8 h-8 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-teal-600 font-mono">
              R$ {totalProfit.toFixed(2).replace('.', ',')}
            </div>
            <span className="text-[11px] text-emerald-600 font-bold mt-1 block">
              Margem Média: {profitMarginPercent}%
            </span>
          </div>
        ) : (
          <div className="bg-slate-50 p-5 rounded-2xl border border-dashed border-slate-300 flex flex-col justify-center text-center">
            <span className="text-xs font-bold text-slate-400">Lucro Bruto</span>
            <span className="text-xs text-slate-500 mt-1">Acesso Restrito ao Gerente/Dono</span>
          </div>
        )}

        {/* Card 3: Average Ticket */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Ticket Médio
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
            R$ {averageTicket.toFixed(2).replace('.', ',')}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Média por cliente
          </span>
        </div>

        {/* Card 4: Items Sold */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
              Itens Vendidos
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">
            {totalItemsSold}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Unidades / KG passados no caixa
          </span>
        </div>

      </div>

      {/* Charts & Top Ranking Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
        
        {/* Payment Methods Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider mb-4 flex items-center justify-between">
            <span>Faturamento por Meio de Pagamento</span>
            <span className="text-xs text-slate-400 font-mono">100%</span>
          </h3>

          <div className="space-y-3">
            {[
              { label: 'Dinheiro (Espécie)', key: 'dinheiro', color: 'bg-emerald-500' },
              { label: 'PIX Instantâneo', key: 'pix', color: 'bg-teal-500' },
              { label: 'Cartão de Débito', key: 'debito', color: 'bg-blue-500' },
              { label: 'Cartão de Crédito', key: 'credito', color: 'bg-indigo-500' },
              { label: 'Fiado / A Prazo', key: 'fiado', color: 'bg-amber-500' },
            ].map((method) => {
              const val = paymentBreakdown[method.key] || 0;
              const pct = totalRevenue > 0 ? ((val / totalRevenue) * 100).toFixed(1) : '0';
              return (
                <div key={method.key}>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span className="text-slate-700">{method.label}</span>
                    <span className="font-mono text-slate-900">
                      R$ {val.toFixed(2).replace('.', ',')} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${method.color} rounded-full transition-all duration-500`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top 5 Best Selling Products */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-extrabold text-sm text-slate-900 uppercase tracking-wider mb-4">
            Top 5 Produtos Mais Vendidos
          </h3>

          <div className="space-y-3">
            {topProducts.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                Nenhuma venda registrada no período selecionado.
              </div>
            ) : (
              topProducts.map((p, index) => (
                <div key={index} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-black flex items-center justify-center">
                      {index + 1}º
                    </span>
                    <div>
                      <div className="font-bold text-xs text-slate-900 line-clamp-1">{p.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {p.qty} unidades vendidas
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-black font-mono text-emerald-700">
                      R$ {p.total.toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* Sales History Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-700">
            Histórico de Vendas ({filteredSales.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-200 text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">
                <th className="py-3 px-4"># Venda</th>
                <th className="py-3 px-3">Data e Hora</th>
                <th className="py-3 px-3">Operador / Cliente</th>
                <th className="py-3 px-3 text-center">Itens</th>
                <th className="py-3 px-3">Pagamento</th>
                <th className="py-3 px-3 text-right">Valor Total</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredSales.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    Nenhuma venda encontrada para este período.
                  </td>
                </tr>
              ) : (
                filteredSales.map((sale) => {
                  const isCancelled = sale.status === 'cancelled';
                  return (
                    <tr key={sale.id} className={`hover:bg-slate-50 transition-colors ${isCancelled ? 'bg-rose-50/40 text-slate-400' : ''}`}>
                      
                      {/* Sequence */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-800">
                        #{sale.sequenceNumber.toString().padStart(5, '0')}
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-3 font-mono text-slate-600 text-[11px]">
                        {new Date(sale.timestamp).toLocaleString('pt-BR')}
                      </td>

                      {/* Operator & Customer */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{sale.operatorName}</div>
                        {sale.customerName && (
                          <div className="text-[10px] text-emerald-700 font-medium">
                            Cliente: {sale.customerName}
                          </div>
                        )}
                      </td>

                      {/* Items count */}
                      <td className="py-3 px-3 text-center font-mono">
                        {sale.items.length} itens
                      </td>

                      {/* Payment */}
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[10px] font-bold uppercase text-slate-700">
                          {sale.payments.map((p) => p.method).join(' + ')}
                        </span>
                      </td>

                      {/* Total */}
                      <td className="py-3 px-3 text-right font-mono font-black text-sm text-slate-900">
                        R$ {sale.total.toFixed(2).replace('.', ',')}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          isCancelled
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {isCancelled ? 'Estornada' : 'Concluída'}
                        </span>
                      </td>

                      {/* Actions (Reprint & Cancel) */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center space-x-1.5">
                          <button
                            onClick={() => onReprintReceipt(sale)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Reimprimir Cupom Não Fiscal"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {!isCancelled && (
                            <button
                              onClick={() => setCancellingSaleId(sale.id)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Estornar / Cancelar esta venda"
                            >
                              <RotateCcw className="w-4 h-4" />
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

      {/* Cancel Sale Modal with Supervisor PIN */}
      {cancellingSaleId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border border-slate-200">
            <div className="flex items-center space-x-2 text-rose-600 mb-3">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="font-extrabold text-base text-slate-900">
                Confirmar Cancelamento de Venda
              </h3>
            </div>
            
            <p className="text-xs text-slate-600 mb-4">
              O cancelamento irá estornar o valor e devolver automaticamente todos os produtos ao estoque da loja.
            </p>

            {currentUser.role === 'cashier' && (
              <div className="space-y-2 mb-4">
                <label className="block text-xs font-bold text-slate-700">
                  PIN de Autorização do Gerente / Dono:
                </label>
                <input
                  type="password"
                  maxLength={4}
                  value={supervisorPin}
                  onChange={(e) => setSupervisorPin(e.target.value)}
                  placeholder="PIN de 4 dígitos"
                  className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-xl font-mono font-bold outline-none"
                  autoFocus
                />
                {pinError && <p className="text-rose-600 text-xs font-bold">{pinError}</p>}
              </div>
            )}

            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  setCancellingSaleId(null);
                  setSupervisorPin('');
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmCancelSale(cancellingSaleId)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow transition-all"
              >
                Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
