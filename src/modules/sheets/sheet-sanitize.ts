/**
 * Prevent Google Sheets formula injection from user-controlled strings.
 * Prefixes dangerous leading characters so USER_ENTERED cannot execute formulas.
 * Numbers / booleans / null pass through unchanged.
 */
export function sanitizeSheetCell(
  value: string | number | boolean | null,
): string | number | boolean {
  if (value == null) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  const text = String(value);
  if (text.length === 0) {
    return '';
  }

  const first = text[0];
  if (first === '=' || first === '+' || first === '-' || first === '@') {
    return `'${text}`;
  }
  return text;
}

export function sanitizeSheetRow(
  row: Array<string | number | boolean | null>,
): Array<string | number | boolean> {
  return row.map((cell) => sanitizeSheetCell(cell));
}
