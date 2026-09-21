/** Event producers historically wrote both lowercase and uppercase event types. */
export function matchesFinancialEventGroup(type: unknown, group: 'PAYMENT' | 'REFUND' | 'STATUS'): boolean {
  return String(type || '').toUpperCase().includes(group);
}
