import React, { useState } from 'react';
import type { NfeRecipient } from '../../types';

const labels = [
  ['cnpj', 'CNPJ do destinatário'],
  ['name', 'Razão social'],
  ['street', 'Logradouro'],
  ['number', 'Número'],
  ['district', 'Bairro'],
  ['city', 'Município (SP)'],
  ['cityCode', 'Código IBGE do município'],
  ['postalCode', 'CEP'],
] as const;
const inputStyle = 'mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm';

export function NfeRecipientForm({ name, sending, onSubmit, onCancel }: {
  name?: string;
  sending: boolean;
  onSubmit: (recipient: NfeRecipient) => void;
  onCancel: () => void;
}) {
  const [data, setData] = useState({
    cnpj: '', name: name || '', street: '', number: '', district: '', city: '', cityCode: '', postalCode: '',
    taxpayer: '', ie: '', finalConsumer: '', presence: '', freightMode: '',
  });
  const [confirmed, setConfirmed] = useState(false);
  function change(key: keyof typeof data, value: string) {
    setData(previous => ({ ...previous, [key]: value }));
  }

  return (
    <form className="space-y-3 rounded-xl border p-3" onSubmit={e => {
      e.preventDefault();
      if (confirmed) onSubmit({ ...data, taxpayer: data.taxpayer as NfeRecipient['taxpayer'],
        presence: data.presence as NfeRecipient['presence'], freightMode: data.freightMode as NfeRecipient['freightMode'], finalConsumer: data.finalConsumer === 'yes' });
    }}>
      <h3 className="text-sm font-bold">NF-e modelo 55 · Venda interna em SP</h3>
      <p className="text-xs text-slate-600">O PDV leva todos os itens, descontos e pagamentos da venda. Preencha os dados fiscais do comprador.</p>
      <div className="grid grid-cols-2 gap-2">
        {labels.map(([key, label]) => (
          <label key={key} className="block text-xs font-semibold">
            {label}
            <input required className={inputStyle} value={data[key]} onChange={e => change(key, e.target.value)} />
          </label>
        ))}
        <label className="text-xs font-semibold">
          Inscrição estadual
          <select required className={inputStyle} value={data.taxpayer} onChange={e => change('taxpayer', e.target.value)}>
            <option value="">Selecione</option>
            <option value="1">Contribuinte com IE</option>
            <option value="9">Não contribuinte</option>
          </select>
        </label>
        {data.taxpayer === '1' && <label className="text-xs font-semibold">
          IE paulista com 12 dígitos
          <input required pattern="[0-9]{12}" className={inputStyle} value={data.ie} onChange={e => change('ie', e.target.value)} />
        </label>}
        <label className="text-xs font-semibold">
          Finalidade da compra
          <select required className={inputStyle} value={data.finalConsumer} onChange={e => change('finalConsumer', e.target.value)}>
            <option value="">Selecione</option>
            <option value="yes">Consumo final</option>
            <option value="no">Revenda ou industrialização</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Canal da venda
          <select required className={inputStyle} value={data.presence} onChange={e => change('presence', e.target.value)}>
            <option value="">Selecione</option>
            <option value="1">Presencial</option>
            <option value="2">Internet, venda direta</option>
            <option value="3">Teleatendimento</option>
            <option value="9">Outra operação não presencial, venda direta</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          Transporte
          <select required className={inputStyle} value={data.freightMode} onChange={e => change('freightMode', e.target.value)}>
            <option value="">Selecione</option>
            <option value="3">Transporte próprio da Distribuidora</option>
            <option value="4">Transporte próprio do comprador</option>
            <option value="9">Sem ocorrência de transporte</option>
          </select>
        </label>
      </div>
      <label className="flex gap-2 text-xs">
        <input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
        Confirmo que a operação é uma venda direta paulista, sem cobrança de frete separada, e que o cadastro fiscal dos produtos está correto.
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-2 text-xs font-bold">Voltar</button>
        <button type="submit" disabled={sending} className="rounded-lg bg-purple-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
          {sending ? 'Preparando…' : 'Enviar para estação A3'}
        </button>
      </div>
    </form>
  );
}
