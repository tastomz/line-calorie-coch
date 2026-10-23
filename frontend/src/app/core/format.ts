export function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('th-TH', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function baht(n: number | null | undefined, digits = 0): string {
  if (n == null) return '—';
  return '฿' + Number(n).toLocaleString('th-TH', { maximumFractionDigits: digits });
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '-';
  return new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtDateShort(v: string | Date | null | undefined): string {
  if (!v) return '-';
  return new Date(v).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function statusLabelTh(status: string | null | undefined): string {
  switch (status) {
    case 'TRIALING':
      return 'ทดลองใช้ (Trial)';
    case 'ACTIVE':
      return 'ใช้งานอยู่';
    case 'CANCELED':
      return 'ยกเลิกแล้ว (ใช้ได้ถึงสิ้นรอบ)';
    case 'EXPIRED':
      return 'หมดอายุ';
    case 'NONE':
      return 'ยังไม่เป็น Pro';
    default:
      return status || '-';
  }
}

export function redeemErrorTh(code: string): string {
  const map: Record<string, string> = {
    invalid: 'โค้ดไม่ถูกต้อง',
    expired: 'โค้ดหมดอายุแล้ว',
    inactive: 'โค้ดถูกปิดใช้งาน',
    already_redeemed: 'คุณใช้โค้ดนี้ไปแล้ว',
    max_reached: 'โค้ดถูกใช้ครบจำนวนแล้ว',
    already_pro: 'คุณเป็น Pro อยู่แล้ว',
    trial_active: 'คุณมีสิทธิ์ทดลองใช้งานอยู่แล้ว',
  };
  return map[code] ?? (code || 'ใช้โค้ดไม่สำเร็จ');
}

/** datetime-local value (browser time) ↔ ISO */
export function toLocalInput(iso: string | null | undefined): Date | null {
  return iso ? new Date(iso) : null;
}
