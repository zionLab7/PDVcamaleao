import { z } from 'zod';

const text = (max: number, min = 1) => z.string().trim().min(min).max(max).regex(/^[^\x00-\x1f]+$/);
const onlyDigits = (length: number) => z.string().transform(value => value.replace(/[.\/\s-]/g, ''))
  .pipe(z.string().regex(new RegExp(`^\\d{${length}}$`)));

export const nfeRecipientSchema = z.object({
  cnpj: onlyDigits(14).refine(value => {
    if (/^(\d)\1+$/.test(value)) return false;
    return [12, 13].every(length => {
      const sum = [...value.slice(0, length)].reduce((total, digit, index) =>
        total + Number(digit) * (2 + (length - 1 - index) % 8), 0);
      return (sum % 11 < 2 ? 0 : 11 - sum % 11) === Number(value[length]);
    });
  }, 'CNPJ do destinatário inválido.'),
  name: text(60, 2),
  street: text(60, 2),
  number: text(60),
  district: text(60, 2),
  city: text(60, 2),
  cityCode: z.string().regex(/^35\d{5}$/, 'Informe o código IBGE do município paulista.'),
  postalCode: onlyDigits(8),
  taxpayer: z.enum(['1', '9']),
  ie: z.string().trim().optional(),
  finalConsumer: z.boolean(),
  presence: z.enum(['1', '2', '3', '9']),
  freightMode: z.enum(['3', '4', '9']).default('9'),
}).superRefine((data, ctx) => {
  if (data.taxpayer === '1' && !/^\d{12}$/.test(data.ie || '')) {
    ctx.addIssue({ code: 'custom', path: ['ie'], message: 'Informe a IE do cliente paulista com 12 dígitos.' });
  }
  if (data.taxpayer === '9' && !data.finalConsumer) {
    ctx.addIssue({ code: 'custom', path: ['finalConsumer'], message: 'Confira o enquadramento do destinatário não contribuinte.' });
  }
});

export type NfeRecipient = z.infer<typeof nfeRecipientSchema>;
