/** Owner drawings change available cash, not operating expenses or profit.
 * Keep historical 'Retirada' (pró-labore) distinct until classified by the owner.
 */
export function isOwnerWithdrawal(entry: any): boolean {
  const category = String(entry?.category || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').trim().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toUpperCase();
  return entry?.financialNature === 'owner_withdrawal'
    || entry?.sourceType === 'owner_withdrawal'
    || category === 'RETIRADA PESSOAL';
}
