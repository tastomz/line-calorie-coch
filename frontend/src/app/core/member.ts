import { Injectable, inject } from '@angular/core';
import { Api, ApiError } from './api';

export type Membership = {
  displayName: string | null;
  plan: 'FREE' | 'PRO';
  status: string;
  hasProAccess: boolean;
  periodEnd: string | null;
  autoRenew: boolean;
  nutrition: {
    currentWeightKg: number;
    targetWeightKg: number;
    dailyCalories: number;
    dailyProteinG: number;
    dailyCarbsG: number;
    dailyFatG: number;
    goal: string;
  } | null;
  usage: Record<string, number>;
  limits: Record<string, number>;
  checkoutEnabled: boolean;
};

export type MemberConfig = {
  liffId: string | null;
  checkoutEnabled: boolean;
  paymentMode: string;
};

export type PricedPlan = {
  code: string;
  labelTh: string;
  days: number;
  priceThb: number;
  finalPriceThb: number;
  discountActive: boolean;
  discountLabel: string | null;
  discountEndsAt: string | null;
  perMonthThb: number;
};

type LiffSdk = {
  init(o: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(o: { redirectUri: string }): void;
  logout(): void;
  getIDToken(): string | null;
  isInClient(): boolean;
  sendMessages(m: { type: 'text'; text: string }[]): Promise<void>;
  closeWindow(): void;
};

declare global {
  interface Window {
    liff?: LiffSdk;
  }
}

const DEFAULT_LIFF_ID = '2011695705-l6K9TEPR';
const LIFF_SDK_URL = 'https://static.line-scdn.net/liff/edge/2/sdk.js';
export const PROFILE_PATH = '/profile';
export const LOGIN_PATH = '/login';

/**
 * Membership session for LIFF pages: HttpOnly cookie from POST /auth/liff
 * (LIFF ID token). The client never sends a LINE userId itself.
 */
@Injectable({ providedIn: 'root' })
export class MemberSession {
  private readonly api = inject(Api);
  private sdkLoading: Promise<void> | null = null;

  config(): Promise<MemberConfig> {
    return this.api.get<MemberConfig>('/api/membership/config');
  }

  private loadSdk(): Promise<void> {
    if (window.liff) return Promise.resolve();
    this.sdkLoading ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = LIFF_SDK_URL;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('โหลด LIFF ไม่สำเร็จ'));
      document.head.appendChild(s);
    });
    return this.sdkLoading;
  }

  /** @returns true when LIFF is redirecting to LINE login (page will unload). */
  async authenticateWithLiff(onStatus?: (t: string) => void): Promise<boolean> {
    onStatus?.('กำลังเข้าสู่ระบบ Kcal Coach...');
    let liffId = DEFAULT_LIFF_ID;
    try {
      liffId = ((await this.config()).liffId || DEFAULT_LIFF_ID).trim();
    } catch {
      // keep default
    }
    await this.loadSdk();
    const liff = window.liff!;
    try {
      await liff.init({ liffId });
    } catch {
      throw new Error('ไม่สามารถเข้าสู่ระบบผ่าน LINE ได้ กรุณาลองใหม่อีกครั้ง');
    }
    if (!liff.isLoggedIn()) {
      onStatus?.('กำลังเปิดหน้าเข้าสู่ระบบ LINE...');
      liff.login({ redirectUri: location.href });
      return true;
    }
    const idToken = liff.getIDToken();
    if (!idToken) throw new Error('ไม่สามารถเข้าสู่ระบบผ่าน LINE ได้ กรุณาลองใหม่อีกครั้ง');
    onStatus?.('กำลังยืนยันตัวตน...');
    await this.api.post('/auth/liff', { idToken });
    return false;
  }

  /** Current membership, logging in through LIFF when needed. null = redirecting. */
  async ensure(onStatus?: (t: string) => void): Promise<Membership | null> {
    try {
      return await this.api.get<Membership>('/api/membership');
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 401) throw e;
    }
    if (await this.authenticateWithLiff(onStatus)) return null;
    return this.api.get<Membership>('/api/membership');
  }

  /** On 401 from a later call: go to /login and come back. */
  redirectIfUnauthorized(e: unknown): boolean {
    if (e instanceof ApiError && e.status === 401) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.replace(`${LOGIN_PATH}?next=${next}`);
      return true;
    }
    return false;
  }

  async logout(): Promise<void> {
    await this.api.post('/api/membership/logout');
    try {
      if (window.liff?.isLoggedIn()) window.liff.logout();
    } catch {
      // ignore
    }
  }

  /** After a goal reset: restart onboarding in the chat when opened inside LINE. */
  async sendStartAndClose(): Promise<boolean> {
    try {
      const liff = window.liff;
      if (liff?.isInClient()) {
        await liff.sendMessages([{ type: 'text', text: 'เริ่ม' }]);
        liff.closeWindow();
        return true;
      }
    } catch {
      // fall through
    }
    return false;
  }
}
