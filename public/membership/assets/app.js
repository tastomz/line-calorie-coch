const LOGIN_PATH = '/login';
const ACCOUNT_PATH = '/account';
const PROFILE_PATH = '/profile';
const DEFAULT_LIFF_ID = '2011695705-l6K9TEPR';
const LIFF_SDK_URL = 'https://static.line-scdn.net/liff/edge/2/sdk.js';

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

/** Redirect unauthenticated users to login (non-LIFF fallback). */
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

function loadLiffSdk() {
  if (window.liff) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-liff-sdk]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('โหลด LIFF ไม่สำเร็จ')),
      );
      return;
    }
    const s = document.createElement('script');
    s.src = LIFF_SDK_URL;
    s.async = true;
    s.dataset.liffSdk = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('โหลด LIFF ไม่สำเร็จ'));
    document.head.appendChild(s);
  });
}

/**
 * Exchange LIFF ID token for HttpOnly membership_session.
 * Never sends LINE userId from the client.
 */
async function authenticateWithLiff(statusEl) {
  const setStatus = (t) => {
    if (statusEl) statusEl.textContent = t;
  };
  setStatus('กำลังเข้าสู่ระบบ Kcal Coach...');

  let cfg = {};
  try {
    cfg = await api('/api/membership/config');
  } catch {
    cfg = {};
  }
  const liffId = (cfg.liffId || DEFAULT_LIFF_ID).trim();
  if (!liffId) {
    throw new Error('ยังไม่ได้ตั้งค่า LIFF');
  }

  await loadLiffSdk();
  try {
    await window.liff.init({ liffId });
  } catch (e) {
    throw new Error(
      'ไม่สามารถเข้าสู่ระบบผ่าน LINE ได้ กรุณาลองใหม่อีกครั้ง',
    );
  }

  if (!window.liff.isLoggedIn()) {
    setStatus('กำลังเปิดหน้าเข้าสู่ระบบ LINE...');
    window.liff.login({ redirectUri: location.href });
    return { redirected: true };
  }

  const idToken = window.liff.getIDToken();
  if (!idToken) {
    throw new Error(
      'ไม่สามารถเข้าสู่ระบบผ่าน LINE ได้ กรุณาลองใหม่อีกครั้ง',
    );
  }

  setStatus('กำลังยืนยันตัวตนกับเซิร์ฟเวอร์...');
  await api('/auth/liff', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  return { redirected: false };
}

/**
 * Ensure membership session: try API, else LIFF auth, else throw.
 */
async function ensureMembershipSession(statusEl) {
  try {
    return await api('/api/membership');
  } catch (e) {
    if (!e || e.status !== 401) throw e;
  }
  const result = await authenticateWithLiff(statusEl);
  if (result.redirected) return null;
  return api('/api/membership');
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

function fmtDateShort(v) {
  if (!v) return null;
  try {
    return new Date(v).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(v);
  }
}

function fmtNum(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('th-TH', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function planLabel(m) {
  if (m.hasProAccess) return 'PRO';
  return 'FREE';
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

function redeemErrorTh(code) {
  switch (code) {
    case 'invalid':
      return 'โค้ดไม่ถูกต้อง';
    case 'expired':
      return 'โค้ดหมดอายุแล้ว';
    case 'inactive':
      return 'โค้ดถูกปิดใช้งาน';
    case 'already_redeemed':
      return 'คุณใช้โค้ดนี้ไปแล้ว';
    case 'max_reached':
      return 'โค้ดถูกใช้ครบจำนวนแล้ว';
    case 'already_pro':
      return 'คุณเป็น Pro อยู่แล้ว';
    case 'trial_active':
      return 'คุณมีสิทธิ์ทดลองใช้งานอยู่แล้ว';
    default:
      return typeof code === 'string' ? code : 'ใช้โค้ดไม่สำเร็จ';
  }
}
