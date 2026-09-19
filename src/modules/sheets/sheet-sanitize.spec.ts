import { sanitizeSheetCell, sanitizeSheetRow } from './sheet-sanitize';

describe('sanitizeSheetCell', () => {
  it('leaves safe strings and numbers alone', () => {
    expect(sanitizeSheetCell('ข้าวกะเพรา')).toBe('ข้าวกะเพรา');
    expect(sanitizeSheetCell(650)).toBe(650);
    expect(sanitizeSheetCell(null)).toBe('');
  });

  it('neutralizes formula-like prefixes', () => {
    expect(sanitizeSheetCell('=1+2')).toBe("'=1+2");
    expect(sanitizeSheetCell('+cmd')).toBe("'+cmd");
    expect(sanitizeSheetCell('-1+2')).toBe("'-1+2");
    expect(sanitizeSheetCell('@sum')).toBe("'@sum");
  });

  it('sanitizes a full row without corrupting numeric macros', () => {
    expect(sanitizeSheetRow(['=HYPERLINK("x")', 100, 'notes', null])).toEqual([
      '\'=HYPERLINK("x")',
      100,
      'notes',
      '',
    ]);
  });
});
