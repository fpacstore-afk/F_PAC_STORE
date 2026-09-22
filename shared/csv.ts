/** Spreadsheet imports must treat untrusted cells as text, never formulas. */
export function csvCell(value: unknown): string {
  const raw = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
