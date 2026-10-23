import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { Api, errorMessage } from '../../core/api';
import { MemberSession, Membership, PROFILE_PATH, PricedPlan } from '../../core/member';
import { PlanPicker } from '../plan-picker';

/** /login — link token (?t=), existing session, or LIFF; then go to ?next. */
@Component({
  selector: 'kc-member-login',
  imports: [ButtonModule, MessageModule, ProgressSpinnerModule, RouterLink],
  template: `
    <div class="center-page">
      <div class="kc-card kc-center login">
        <div class="logo"><i class="pi pi-heart-fill"></i></div>
        <h1>Kcal Coach</h1>
        @if (!error()) {
          <p-progress-spinner strokeWidth="4" [style]="{ width: '40px', height: '40px' }" />
          <p class="kc-muted">{{ status() }}</p>
        } @else {
          <p-message severity="error" [text]="error()!" />
          <div class="kc-actions" style="justify-content:center">
            <p-button label="ลองอีกครั้ง" icon="pi pi-refresh" (onClick)="run()" />
            <p-button label="หน้าสมาชิก" severity="secondary" [outlined]="true" routerLink="/membership" />
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .center-page { min-height: 100dvh; display: grid; place-items: center; padding: 1rem; }
    .login { width: min(100%, 380px); display: grid; gap: .8rem; justify-items: center; }
    .logo { width: 56px; height: 56px; border-radius: 16px; background: var(--kc-green); color: #add9bd; display: grid; place-items: center; font-size: 1.4rem; }
  `,
})
export class MemberLoginPage implements OnInit {
  private readonly api = inject(Api);
  private readonly session = inject(MemberSession);
  readonly status = signal('กำลังเข้าสู่ระบบ Kcal Coach...');
  readonly error = signal<string | null>(null);

  ngOnInit() {
    void this.run();
  }

  async run() {
    this.error.set(null);
    this.status.set('กำลังเข้าสู่ระบบ Kcal Coach...');
    const params = new URLSearchParams(location.search);
    const token = params.get('t');
    const next = params.get('next') || PROFILE_PATH;
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : PROFILE_PATH;
    try {
      if (token) {
        await this.api.post('/api/membership/auth/link', { token });
        location.replace(safeNext);
        return;
      }
      try {
        await this.api.get('/api/membership');
        location.replace(safeNext);
        return;
      } catch {
        // not signed in yet
      }
      if (await this.session.authenticateWithLiff((t) => this.status.set(t))) return;
      this.status.set('เข้าสู่ระบบสำเร็จ');
      location.replace(safeNext);
    } catch (e) {
      this.error.set(errorMessage(e, 'ไม่สามารถเข้าสู่ระบบผ่าน LINE ได้ กรุณาลองใหม่อีกครั้ง'));
    }
  }
}

/** /upgrade */
@Component({
  selector: 'kc-upgrade',
  imports: [PlanPicker, MessageModule, ButtonModule, RouterLink],
  template: `
    <h1>สมัคร Pro</h1>
    <p class="kc-muted">ใช้งาน AI ได้มากขึ้น · จ่ายผ่าน QR พร้อมเพย์ ครั้งเดียว ไม่ตัดเงินอัตโนมัติ</p>
    @if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (ready()) {
      <div class="kc-card"><kc-plan-picker /></div>
    }
    <p-button label="กลับไปโปรไฟล์" icon="pi pi-arrow-left" severity="secondary" [text]="true" routerLink="/profile" styleClass="back" />
  `,
  styles: `:host ::ng-deep .back { margin-top: .8rem; }`,
})
export class UpgradePage implements OnInit {
  private readonly session = inject(MemberSession);
  readonly ready = signal(false);
  readonly error = signal<string | null>(null);

  async ngOnInit() {
    try {
      const m = await this.session.ensure();
      if (m) this.ready.set(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }
}

/** /membership — public landing */
@Component({
  selector: 'kc-landing',
  imports: [ButtonModule, RouterLink],
  template: `
    <section class="hero">
      <h1>Tastom Pro</h1>
      <p>โค้ชโภชนาการ AI ใน LINE — ถ่ายรูปหรือพิมพ์เมนู แล้วรู้แคลอรี่ทันที</p>
      <p-button [label]="checkout() ? 'ดูแพ็กเกจ Pro' : 'ไปที่โปรไฟล์ / ใช้โค้ด'" icon="pi pi-crown"
                [routerLink]="checkout() ? '/upgrade' : '/profile'" styleClass="cta" />
    </section>
    <div class="cols">
      <section class="kc-card">
        <span class="kc-muted">FREE</span>
        <div class="price">฿0 <small>/ เดือน</small></div>
        <ul class="kc-muted">
          <li>ติดตามแคลอรี่ / มื้ออาหาร</li>
          <li>น้ำหนัก · ประวัติ · โปรไฟล์</li>
          <li>AI จำกัดตามโควต้ารายวัน</li>
        </ul>
      </section>
      <section class="kc-card pro">
        <span class="kc-ok"><i class="pi pi-crown"></i> PRO</span>
        <div class="price">เริ่ม ฿{{ fromPrice() }} <small>/ เดือน</small></div>
        <ul>
          <li>วิเคราะห์อาหาร / รูปอาหารได้มากขึ้น</li>
          <li>AI Coach และช่วยปรับมื้ออาหาร</li>
          <li>ติดตามโภชนาการต่อเนื่อง</li>
        </ul>
        <p class="kc-muted kc-small">Pro = ใช้งาน AI ได้มากขึ้น (ไม่ใช่ไม่จำกัด)</p>
      </section>
    </div>
    <section class="kc-card" style="margin-top:.9rem">
      <div class="kc-card-title"><i class="pi pi-gift"></i><h3>มีโค้ดโปรโมชั่น?</h3></div>
      <p class="kc-muted">ใช้ได้ที่หน้าโปรไฟล์ หรือพิมพ์ในแชท LINE: <code>ใช้โค้ด TASTOM-XXXXXX</code></p>
    </section>
  `,
  styles: `
    .hero { border-radius: 20px; padding: 1.4rem 1.2rem; color: #fff; background: linear-gradient(135deg, #2f8453, #082014); margin-bottom: .9rem; }
    .hero h1 { color: #fff; font-size: 1.6rem; }
    .hero p { opacity: .9; }
    :host ::ng-deep .cta { margin-top: .6rem; background: #fff; color: var(--kc-green); border-color: #fff; }
    .cols { display: grid; gap: .9rem; }
    .cols .kc-card + .kc-card { margin-top: 0; }
    .price { font-size: 1.8rem; font-weight: 700; color: var(--kc-heading); margin: .2rem 0 .4rem; }
    .price small { font-size: .9rem; color: var(--kc-muted); font-weight: 400; }
    .pro { border-color: var(--kc-green); }
    ul { padding-left: 1.1rem; margin: 0 0 .5rem; }
  `,
})
export class LandingPage implements OnInit {
  private readonly api = inject(Api);
  readonly fromPrice = signal<number | string>('60');
  readonly checkout = signal(false);

  async ngOnInit() {
    try {
      const d = await this.api.get<{ checkoutEnabled: boolean; plans: PricedPlan[] }>('/api/membership/plans');
      const monthly = (d.plans ?? []).map((p) => p.perMonthThb);
      if (monthly.length) this.fromPrice.set(Math.min(...monthly));
      this.checkout.set(d.checkoutEnabled);
    } catch {
      // keep defaults
    }
  }
}

/** /membership/success — wait for the webhook to grant Pro. */
@Component({
  selector: 'kc-success',
  imports: [ButtonModule, RouterLink, ProgressSpinnerModule],
  template: `
    <div class="kc-card kc-center box">
      @if (state() === 'pro') {
        <i class="pi pi-check-circle big ok"></i>
        <h1>คุณเป็น Pro แล้ว 🎉</h1>
        <p class="kc-muted">ขอบคุณที่สนับสนุน Kcal Coach</p>
      } @else if (state() === 'error') {
        <i class="pi pi-exclamation-circle big kc-err"></i>
        <p class="kc-err">{{ error() }}</p>
      } @else {
        <p-progress-spinner strokeWidth="4" [style]="{ width: '44px', height: '44px' }" />
        <h1>กำลังยืนยันการชำระเงิน</h1>
        <p class="kc-muted">ถ้าสแกนจ่ายแล้ว ระบบจะเปิด Pro ให้ภายในไม่กี่วินาที</p>
        @if (state() === 'slow') { <p class="kc-muted kc-small">ยังไม่ได้รับการยืนยัน ลองเช็กอีกครั้งในอีกสักครู่</p> }
      }
      <p-button label="ไปหน้าโปรไฟล์" routerLink="/profile" styleClass="full" />
    </div>
  `,
  styles: `
    .box { display: grid; gap: .7rem; justify-items: center; margin-top: 1rem; }
    .big { font-size: 3rem; } .ok { color: var(--kc-green); }
    :host ::ng-deep .full { width: 100%; }
  `,
})
export class SuccessPage implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly session = inject(MemberSession);
  readonly state = signal<'wait' | 'slow' | 'pro' | 'error'>('wait');
  readonly error = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    void this.poll(0);
  }

  ngOnDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  private async poll(n: number) {
    try {
      const m = await this.api.get<Membership>('/api/membership');
      if (m.hasProAccess) {
        this.state.set('pro');
        return;
      }
      if (n >= 3) this.state.set('slow');
      if (n < 15) this.timer = setTimeout(() => void this.poll(n + 1), 2000);
    } catch (e) {
      if (this.session.redirectIfUnauthorized(e)) return;
      this.error.set(errorMessage(e));
      this.state.set('error');
    }
  }
}

/** /membership/cancel */
@Component({
  selector: 'kc-cancel',
  imports: [ButtonModule, RouterLink],
  template: `
    <div class="kc-card kc-center box">
      <i class="pi pi-times-circle big"></i>
      <h1>ยกเลิกการชำระเงินแล้ว</h1>
      <p class="kc-muted">ยังไม่ได้เปิด Pro จากรอบนี้ · ถ้ามีสมาชิกเดิมอยู่ สถานะจะไม่เปลี่ยน</p>
      <p-button label="ลองสมัครอีกครั้ง" routerLink="/upgrade" styleClass="full" />
      <p-button label="ไปหน้าโปรไฟล์" severity="secondary" [outlined]="true" routerLink="/profile" styleClass="full" />
    </div>
  `,
  styles: `
    .box { display: grid; gap: .7rem; justify-items: center; margin-top: 1rem; }
    .big { font-size: 3rem; color: var(--kc-muted); }
    :host ::ng-deep .full { width: 100%; }
  `,
})
export class CancelPage {}

/** /membership/mock-checkout — DEV only (PAYMENT_MODE=MOCK). */
@Component({
  selector: 'kc-mock-checkout',
  imports: [ButtonModule, MessageModule, RouterLink],
  template: `
    <div class="kc-card">
      <h1>Mock Checkout (DEV)</h1>
      @if (disabled()) {
        <p-message severity="warn" text="Mock checkout ไม่เปิดในโหมดนี้" />
        <p-button label="ไปหน้าโปรไฟล์" routerLink="/profile" styleClass="mt" />
      } @else {
        <p class="kc-muted">PAYMENT_MODE=MOCK — ไม่ใช่ Stripe จริง · session: {{ sessionId }}</p>
        <div class="kc-actions">
          <p-button label="ชำระสำเร็จ" (onClick)="run('success')" />
          <p-button label="ล้มเหลว" severity="secondary" [outlined]="true" (onClick)="run('fail')" />
          <p-button label="Past due" severity="secondary" [outlined]="true" (onClick)="run('past_due')" />
          <p-button label="ยกเลิก" severity="secondary" [outlined]="true" (onClick)="run('cancel')" />
        </div>
        @if (msg()) { <p class="kc-muted" style="margin-top:.6rem">{{ msg() }}</p> }
      }
    </div>
  `,
  styles: `:host ::ng-deep .mt { margin-top: .6rem; }`,
})
export class MockCheckoutPage implements OnInit {
  private readonly api = inject(Api);
  private readonly session = inject(MemberSession);
  readonly sessionId = new URLSearchParams(location.search).get('session_id') || '';
  readonly disabled = signal(false);
  readonly msg = signal('');

  async ngOnInit() {
    try {
      const cfg = await this.session.config();
      if (!cfg.checkoutEnabled || cfg.paymentMode !== 'MOCK') this.disabled.set(true);
      else await this.api.get('/api/membership');
    } catch (e) {
      this.session.redirectIfUnauthorized(e);
    }
  }

  async run(outcome: string) {
    this.msg.set('กำลังประมวลผล...');
    try {
      await this.api.post('/api/membership/mock/complete', { sessionId: this.sessionId, outcome });
      if (outcome === 'success') location.href = '/membership/success';
      else if (outcome === 'cancel') location.href = '/membership/cancel';
      else this.msg.set('อัปเดตสถานะ: ' + outcome);
    } catch (e) {
      if (this.session.redirectIfUnauthorized(e)) return;
      this.msg.set(errorMessage(e));
    }
  }
}
