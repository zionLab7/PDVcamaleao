import React, { useEffect, useRef, useState } from 'react';
import { FileText, Plus, Search, Download, ArrowLeft, Trash2, Save, ShoppingCart } from 'lucide-react';
import { CartItem, CashRegisterState, PaymentDetail, Product, Quote, Sale, StoreSettings } from '../../types';
import * as api from '../../services/api';
import { PaymentModal } from '../POS/PaymentModal';

const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const round = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const date = (v: string) => v.split('-').reverse().join('/');
const labels = { open: 'Em aberto', accepted: 'Aceito', declined: 'Recusado', converted: 'Convertido', expired: 'Vencido' };
export const quoteStatus = (q: Quote) => q.status === 'open' || q.status === 'accepted' ? (q.validUntil < today() ? 'expired' : q.status) : q.status;
function emptyQuote(): Quote {
  const d = new Date(); d.setDate(d.getDate() + 7);
  return { id: '', number: 0, version: 1, customerName: '', customerDocument: '', customerPhone: '', customerEmail: '', customerAddress: '',
    validUntil: new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(d), paymentTerms: '', deliveryTerms: '', notes: '',
    status: 'open', items: [], subtotal: 0, discount: 0, total: 0, operatorName: '', createdAt: '', updatedAt: '' };
}
const input = 'w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white text-slate-900 focus:border-emerald-500 outline-none disabled:bg-slate-100';
const button = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50';
interface Props { products: Product[]; settings: StoreSettings; cashRegister: CashRegisterState; onSaleCreated: (sale: Sale) => void; }

export const QuotesView: React.FC<Props> = ({ products, settings, cashRegister, onSaleCreated }) => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [draft, setDraft] = useState<Quote | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [productQuery, setProductQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [checkout, setCheckout] = useState<Quote | null>(null);
  const saving = useRef(false);
  const paying = useRef(false);
  const [payingState, setPayingState] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  async function load() {
    setLoading(true);
    try { setQuotes(await api.quotes.list()); } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const readOnly = draft?.status === 'converted';
  const subtotal = round(draft?.items.reduce((sum, i) => sum + i.total, 0) || 0);
  const total = round(subtotal - (draft?.discount || 0));
  const field = <K extends keyof Quote>(key: K, value: Quote[K]) => setDraft(q => q ? { ...q, [key]: value } : q);
  function editItem(index: number, key: 'quantity' | 'unitPrice' | 'discount', value: number) {
    setDraft(q => q ? { ...q, items: q.items.map((i, n) => n === index ? { ...i, [key]: value,
      total: round(round((key === 'quantity' ? value : i.quantity) * (key === 'unitPrice' ? value : i.unitPrice)) - (key === 'discount' ? value : i.discount)) } : i) } : q);
  }
  function addProduct(p: Product) {
    if (!draft) return;
    const index = draft.items.findIndex(i => i.productId === p.id);
    if (index >= 0) editItem(index, 'quantity', draft.items[index].quantity + 1);
    else field('items', [...draft.items, { productId: p.id, productName: p.name, barcode: p.barcode || '', ncm: p.ncm || '', unit: p.unit,
      quantity: 1, unitPrice: p.sellPrice, discount: 0, total: p.sellPrice }]);
    setProductQuery('');
  }
  async function openQuote(id: string) {
    setError(''); setNotice(''); setBusy(true);
    try { setDraft(await api.quotes.get(id)); setProductQuery(''); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save(): Promise<Quote | undefined> {
    if (!draft || readOnly || saving.current) return;
    if (!form.current?.reportValidity()) return;
    if (!draft.items.length || total <= 0 || draft.items.some(i => i.total <= 0)) {
      setError('Adicione produtos e revise os descontos. O total e os itens devem ser maiores que zero.'); return;
    }
    saving.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = draft.id ? await api.quotes.update(draft.id, draft) : await api.quotes.create(draft);
      setDraft(result); setQuotes(q => [result, ...q.filter(x => x.id !== result.id)]); setNotice('Orçamento salvo.');
      return result;
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); saving.current = false; }
  }
  async function pdf(q?: Quote) {
    try {
      const quote = q ? await api.quotes.get(q.id) : (readOnly ? draft : await save());
      if (!quote) return;
      const { downloadQuotePdf } = await import('../../services/quotePdf');
      downloadQuotePdf(quote, settings);
    } catch (e) { setError((e as Error).message || 'Não foi possível gerar o PDF. Tente novamente.'); }
  }
  async function convert() {
    if (!cashRegister.isOpen) { setError('Abra o caixa antes de converter o orçamento em venda.'); return; }
    if (draft?.status === 'declined') { setError('Altere a situação para Em aberto ou Aceito antes de converter.'); return; }
    if (draft && draft.validUntil < today()) { setError('Atualize a validade do orçamento antes de converter.'); return; }
    const quote = await save();
    if (quote) setCheckout(quote);
  }
  async function pay(payments: PaymentDetail[], amountPaid: number, change: number, customerName?: string, customerCpf?: string) {
    if (!checkout || paying.current) return;
    paying.current = true; setPayingState(true); setError('');
    try {
      const sale = await api.sales.create({ quoteId: checkout.id, quoteVersion: checkout.version,
        items: checkout.items, subtotal: checkout.subtotal, discount: checkout.discount, total: checkout.total,
        payments, amountPaid, change, customerName: customerName || checkout.customerName, customerCpf: customerCpf || checkout.customerDocument });
      setCheckout(null); setDraft(null); await load(); onSaleCreated(sale);
    } catch (e) {
      setError((e as Error).message); setCheckout(null);
      // Refresh after ambiguous network failures to reveal an already committed conversion.
      if (draft?.id) {
        try { const latest = await api.quotes.get(draft.id); setDraft(latest); setQuotes(q => q.map(x => x.id === latest.id ? latest : x)); } catch { /* Keep the error visible. */ }
      }
    } finally { paying.current = false; setPayingState(false); }
  }
  const filtered = quotes.filter(q => (filter === 'all' || quoteStatus(q) === filter) &&
    `${q.number} ${q.customerName} ${q.customerDocument} ${q.customerPhone}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const matches = products.filter(p => `${p.name} ${p.barcode}`.toLocaleLowerCase().includes(productQuery.toLocaleLowerCase())).slice(0, 12);
  const cart: CartItem[] = checkout ? checkout.items.map(i => ({ product: { ...(products.find(p => p.id === i.productId) || {}), id: i.productId,
    name: i.productName, unit: i.unit } as Product, quantity: i.quantity, unitPrice: i.unitPrice, discount: i.discount, total: i.total })) : [];
  const customerFields: [keyof Quote, string, string?][] = [['customerName', 'Cliente / razão social *'], ['customerDocument', 'CPF / CNPJ'], ['customerPhone', 'Telefone / WhatsApp'],
    ['customerEmail', 'E-mail', 'email'], ['customerAddress', 'Endereço']];
  return <section className="w-full max-w-[1400px] mx-auto p-4 sm:p-6 space-y-5">
    <div className="flex flex-wrap justify-between gap-3 items-center">
      <div><h1 className="text-2xl font-extrabold flex items-center gap-2"><FileText className="text-emerald-600" />Orçamentos</h1>
        <p className="text-sm text-slate-500 mt-1">Propostas em PDF A4 e acompanhamento até a venda.</p></div>
      {!draft && <button className={button + ' !bg-emerald-600 !text-white'} disabled={busy} onClick={() => { setDraft(emptyQuote()); setError(''); setNotice(''); }}><Plus size={16} />Novo orçamento</button>}
      {draft && <button className={button} disabled={busy} onClick={() => {
        if (!readOnly && !window.confirm('Voltar à lista? Alterações não salvas serão descartadas.')) return;
        setDraft(null); setError(''); setNotice('');
      }}><ArrowLeft size={16} />Voltar à lista</button>}
    </div>
    {error && <div role="alert" className="rounded-xl bg-rose-50 text-rose-800 p-4 border border-rose-200">{error}</div>}
    {notice && <p role="status" className="text-emerald-700 text-sm">{notice}</p>}
    {!draft ? <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {([['Propostas', String(quotes.length)], ['Em negociação', money(quotes.filter(q => ['open', 'accepted'].includes(quoteStatus(q))).reduce((sum, q) => sum + q.total, 0))],
          ['Convertidos em venda', String(quotes.filter(q => q.status === 'converted').length)]]).map(([label, value]) =>
          <div key={label} className="p-4 rounded-2xl border bg-white"><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold mt-1">{value}</p></div>)}
      </div>
      <div className="flex flex-wrap gap-3"><label className="flex-1 relative min-w-56"><Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
        <input aria-label="Buscar orçamento" placeholder="Buscar número, cliente, documento ou telefone" value={query} onChange={e => setQuery(e.target.value)} className={input + ' pl-10'} /></label>
        <select aria-label="Filtrar situação" value={filter} onChange={e => setFilter(e.target.value)} className={input + ' !w-auto'}><option value="all">Todas as situações</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        <button className={button} onClick={load} disabled={loading}>Atualizar lista</button></div>
      <div className="overflow-x-auto bg-white border rounded-2xl"><table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-500"><tr>
        {['Número / emissão', 'Cliente', 'Validade', 'Situação', 'Total', 'Ações'].map(h => <th key={h} className="p-4">{h}</th>)}</tr></thead><tbody>
        {filtered.map(q => <tr className="border-t" key={q.id}><td className="p-4 font-bold">#{String(q.number).padStart(6, '0')}<div className="font-normal text-xs text-slate-500">{new Date(q.createdAt).toLocaleDateString('pt-BR')}</div></td>
          <td className="p-4">{q.customerName}<div className="text-xs text-slate-500">{q.customerPhone}</div></td><td className="p-4">{date(q.validUntil)}</td>
          <td className="p-4"><span className={'rounded-full px-2 py-1 text-xs font-bold ' + (q.status === 'converted' ? 'bg-emerald-100 text-emerald-800' : quoteStatus(q) === 'expired' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100')}>{labels[quoteStatus(q)]}</span>
            {q.sale && <div className="mt-2 text-xs">Venda #{q.sale.sequenceNumber}{q.sale.status === 'cancelled' ? ' (cancelada)' : ''}</div>}</td><td className="p-4 font-bold whitespace-nowrap">{money(q.total)}</td>
          <td className="p-4"><div className="flex gap-2"><button className={button} disabled={busy} onClick={() => openQuote(q.id)}>{q.status === 'converted' ? 'Visualizar' : 'Abrir / editar'}</button>
            <button className={button} onClick={() => pdf(q)} aria-label={`Baixar PDF do orçamento ${q.number}`}><Download size={16} />PDF</button></div></td></tr>)}
        {!filtered.length && <tr><td colSpan={6} className="p-10 text-center text-slate-500">{loading ? 'Carregando orçamentos…' : 'Nenhum orçamento encontrado.'}</td></tr>}
      </tbody></table></div>
    </> : <form ref={form} onSubmit={e => { e.preventDefault(); void save(); }} className="space-y-5">
      <div className="p-5 bg-white rounded-2xl border space-y-4">
        <h2 className="font-bold text-lg">{draft.id ? `Orçamento #${String(draft.number).padStart(6, '0')}` : 'Novo orçamento'}</h2>
        {readOnly && <p className="bg-emerald-50 p-3 rounded-xl text-emerald-800">Convertido em venda #{draft.sale?.sequenceNumber}. Este orçamento está disponível para consulta e PDF.{draft.sale?.status === 'cancelled' && ' A venda foi cancelada.'}</p>}
        <fieldset disabled={busy || readOnly} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {customerFields.map(([key, label, type]) => <label key={key} className="text-sm font-medium">{label}<input className={input + ' mt-1'} type={type || 'text'} maxLength={key === 'customerAddress' ? 500 : key === 'customerDocument' ? 30 : key === 'customerPhone' ? 40 : 200}
            required={key === 'customerName'} value={String(draft[key])} onChange={e => field(key, e.target.value as never)} /></label>)}
          <label className="text-sm font-medium">Validade *<input type="date" required value={draft.validUntil} onChange={e => field('validUntil', e.target.value)} className={input + ' mt-1'} /></label>
          <label className="text-sm font-medium">Situação<select aria-label="Situação" className={input + ' mt-1'} value={draft.status} onChange={e => field('status', e.target.value as Quote['status'])}>
            <option value="open">Em aberto</option><option value="accepted">Aceito</option><option value="declined">Recusado</option>{readOnly && <option value="converted">Convertido</option>}</select></label>
        </fieldset>
      </div>
      <div className="p-5 bg-white rounded-2xl border space-y-4"><h2 className="font-bold text-lg">Produtos da proposta</h2>
        {!readOnly && <div><label className="text-sm font-medium">Adicionar produto<input value={productQuery} onChange={e => setProductQuery(e.target.value)} disabled={busy} placeholder="Digite nome ou código de barras" className={input + ' mt-1'} /></label>
          {productQuery.trim() && <div className="border rounded-xl mt-1 max-h-52 overflow-y-auto">{matches.map(p => <button type="button" disabled={busy} key={p.id} onClick={() => addProduct(p)} className="w-full text-left px-3 py-2 hover:bg-emerald-50 border-b text-sm flex justify-between gap-3"><span>{p.name} <small>{p.barcode}</small></span><strong className="whitespace-nowrap">{money(p.sellPrice)}</strong></button>)}
            {!matches.length && <p className="p-3 text-sm text-slate-500">Nenhum produto encontrado no catálogo.</p>}</div>}</div>}
        <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="text-slate-500"><tr>{['Produto', 'Qtd.', 'Unitário R$', 'Desc. item R$', 'Total', ''].map((h, n) => <th className="py-2 px-1" key={n}>{h}</th>)}</tr></thead><tbody>
          {draft.items.map((i, index) => <tr key={index} className="border-t"><td className="py-3 pr-3 min-w-48">{i.productName}<p className="text-xs text-slate-500">{i.barcode} · {i.unit} · NCM {i.ncm || '-'}</p></td>
            {(['quantity', 'unitPrice', 'discount'] as const).map(key => <td className="p-1" key={key}><input type="number" aria-label={`${key === 'quantity' ? 'Quantidade' : key === 'unitPrice' ? 'Preço unitário' : 'Desconto do item'} ${index + 1}`} min={key === 'discount' ? 0 : key === 'quantity' ? 0.0001 : 0.01} step={key === 'quantity' ? '0.0001' : '0.01'} max={key === 'quantity' ? 1e6 : key === 'unitPrice' ? 1e7 : 1e9} required disabled={busy || readOnly} value={i[key]} onChange={e => editItem(index, key, Number(e.target.value))} className={input + ' min-w-24'} /></td>)}
            <td className="p-2 font-bold whitespace-nowrap">{money(i.total)}</td><td>{!readOnly && <button type="button" aria-label={`Remover item ${index + 1}`} className="p-2 text-rose-600" disabled={busy} onClick={() => field('items', draft.items.filter((_, n) => n !== index))}><Trash2 size={18} /></button>}</td></tr>)}
        </tbody></table>{!draft.items.length && <p className="p-6 text-center text-slate-500">Busque e adicione produtos para montar a proposta.</p>}</div>
        <div className="flex flex-wrap justify-end gap-5 items-end pt-3 border-t"><div className="text-sm">Subtotal <strong className="block text-lg">{money(subtotal)}</strong></div>
          <label className="text-sm font-medium">Desconto adicional R$<input aria-label="Desconto adicional R$" type="number" min="0" step="0.01" required value={draft.discount} disabled={busy || readOnly} onChange={e => field('discount', Number(e.target.value))} className={input + ' mt-1 !w-36'} /></label>
          <div className="text-emerald-700 text-sm">Total do orçamento<strong className="block text-2xl">{money(total)}</strong></div></div>
      </div>
      <fieldset disabled={busy || readOnly} className="p-5 bg-white rounded-2xl border grid md:grid-cols-2 gap-4">
        <label className="text-sm font-medium">Condições de pagamento<textarea value={draft.paymentTerms} maxLength={1000} onChange={e => field('paymentTerms', e.target.value)} className={input + ' mt-1'} placeholder="Ex.: À vista no PIX ou 3x no cartão" /></label>
        <label className="text-sm font-medium">Entrega / retirada<textarea value={draft.deliveryTerms} maxLength={1000} onChange={e => field('deliveryTerms', e.target.value)} className={input + ' mt-1'} placeholder="Prazo, endereço ou retirada na loja" /></label>
        <label className="text-sm font-medium md:col-span-2">Observações<textarea value={draft.notes} maxLength={4000} onChange={e => field('notes', e.target.value)} className={input + ' mt-1'} /></label>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3 pb-8"><p className="text-xs text-slate-500 mr-auto self-center">O estoque e o caixa só são movimentados ao concluir a venda.</p>
        {!readOnly && <button type="submit" disabled={busy} className={button}><Save size={16} />{busy ? 'Salvando…' : 'Salvar orçamento'}</button>}
        <button type="button" disabled={busy} onClick={() => pdf()} className={button}><Download size={16} />{readOnly ? 'Baixar PDF A4' : 'Salvar e baixar PDF A4'}</button>
        {!readOnly && <button type="button" disabled={busy || !draft.items.length} onClick={convert} className={button + ' !bg-emerald-600 !text-white'}><ShoppingCart size={16} />Converter em venda</button>}
      </div>
    </form>}
    {checkout && <PaymentModal items={cart} subtotal={checkout.subtotal} discount={checkout.discount} total={checkout.total} settings={settings}
      initialCustomer={{ name: checkout.customerName, document: checkout.customerDocument, phone: checkout.customerPhone }} busy={payingState}
      onClose={() => { if (!paying.current) setCheckout(null); }} onPaymentSuccess={pay} />}
  </section>;
};
