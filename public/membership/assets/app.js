const LOGIN_PATH = '/login';
const ACCOUNT_PATH = '/account';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error || data.code)) || res.statusText;
    throw new ApiError(
      typeof msg === 'string' ? msg : 'เกิดข้อผิดพลาด',
      res.status,
    );
  }
  return data;
}

/** Redirect unauthenticated users to login (protected pages). */
function redirectToLoginIfUnauthorized(error) {
  if (error && error.status === 401) {
    const next = encodeURIComponent(
      location.pathname + location.search + location.hash,
    );
    location.replace(`${LOGIN_PATH}?next=${next}`);
    return true;
  }
  return false;
}

function fmtDate(v) {
  if (!v) return '-';
  try {
    return new Date(v).toLocaleString('th-TH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return String(v);
  }
}

function planLabel(m) {
  if (m.hasProAccess) return '👑 Tastom Pro';
  return '👤 Free';
}

function statusLabelTh(status) {
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
      return 'ไม่มีสมาชิก Pro';
    default:
      return status || '-';
  }
}
