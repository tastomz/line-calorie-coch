import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageModule } from 'primeng/message';
import { ConfirmationService } from 'primeng/api';
import { Api, ApiError, errorMessage } from '../../core/api';
import { MemberSession, Membership, PROFILE_PATH } from '../../core/member';
import { fmtDate, fmtDateShort, fmtNum, redeemErrorTh, statusLabelTh } from '../../core/format';
import { PlanPicker } from '../plan-picker';

type UsageRow = { label: string; icon: string; used: number; limit: number };

const USAGE: { key: string; usage: string; label: string; icon: string }[] = [
  { key: 'FOOD_TEXT', usage: 'foodTextCalls', label: 'บันทึกอาหาร (ข้อความ)', icon: 'pi-comment' },
  { key: 'FOOD_VISION', usage: 'visionCalls', label: 'วิเคราะห์รูปอาหาร', icon: 'pi-camera' },
  { key: 'COMPOSITION_ADJUSTMENT', usage: 'adjustmentCalls', label: 'แก้ไขอาหาร', icon: 'pi-pencil' },
  { key: 'COACH', usage: 'coachCalls', label: 'AI Coach', icon: 'pi-sparkles' },
  { key: 'BODY_SCAN', usage: 'bodyScanCalls', label: 'Body Scan', icon: 'pi-id-card' },
  { key: 'MEAL_PLAN', usage: 'mealPlanCalls', label: 'แผนอาหาร', icon: 'pi-list' },
  { key: 'WEEKLY_REVIEW', usage: 'weeklyReviewCalls', label: 'สรุปรายสัปดาห์', icon: 'pi-calendar' },
];

@Component({
  selector: 'kc-profile',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    TagModule,
    ProgressBarModule,
    SkeletonModule,
    MessageModule,
    PlanPicker,
  ],
  template: `
    @if (loading()) {
      <p class="kc-muted kc-small">{{ status() }}</p>
      <div class="kc-stack">
        <p-skeleton height="148px" borderRadius="18px" />
        <p-skeleton height="120px" borderRadius="16px" />
        <p-skeleton height="200px" borderRadius="16px" />
      </div>
    } @else if (error()) {
      <div class="kc-card kc-center">
        <i class="pi pi-exclamation-circle big-ic"></i>
        <p class="kc-err">{{ error() }}</p>
        <p-button label="ลองอีกครั้ง" icon="pi pi-refresh" (onClick)="load()" />
      </div>
    } @else if (m(); as m) {
      <div class="kc-stack">
        <!-- membership -->
        <section class="hero" [class.pro]="m.plan === 'PRO'">
          <div class="hero-top">
            <div>
              <div class="hello">สวัสดี</div>
              <div class="name">{{ m.displayName || 'ผู้ใช้ LINE' }}</div>
            </div>
            <span class="plan-chip">
              @if (m.plan === 'PRO') { <i class="pi pi-crown"></i> PRO } @else if (m.plan === 'TRIAL') { <i class="pi pi-ticket"></i> TRIAL } @else { FREE }
            </span>
          </div>
          <div class="hero-bottom">
            <span>{{ statusLabel(m.status) }}</span>
            @if (m.plan !== 'FREE' && m.periodEnd) { <span>ใช้งานถึง {{ fmtDateShort(m.periodEnd) }}</span> }
          </div>
        </section>

        <!-- goal -->
        <section class="kc-card">
          <div class="kc-card-title"><i class="pi pi-flag"></i><h3>เป้าหมายของฉัน</h3></div>
          @if (m.nutrition; as n) {
            <div class="goal">
              <div><span class="kc-muted kc-small">ตอนนี้</span><b>{{ fmtNum(n.currentWeightKg, 1) }} kg</b></div>
              <i class="pi pi-arrow-right kc-muted"></i>
              <div><span class="kc-muted kc-small">เป้าหมาย</span><b>{{ fmtNum(n.targetWeightKg, 1) }} kg</b></div>
            </div>
            <div class="kc-grid macros">
              <div class="kc-stat"><span>พลังงาน/วัน</span><b>{{ fmtNum(n.dailyCalories) }}</b><span>kcal</span></div>
              <div class="kc-stat"><span>โปรตีน</span><b>{{ fmtNum(n.dailyProteinG) }}</b><span>g</span></div>
              <div class="kc-stat"><span>คาร์บ</span><b>{{ fmtNum(n.dailyCarbsG) }}</b><span>g</span></div>
              <div class="kc-stat"><span>ไขมัน</span><b>{{ fmtNum(n.dailyFatG) }}</b><span>g</span></div>
            </div>
            <p class="kc-muted kc-small" style="margin-top:.75rem">แก้ไขเป้าหมายในแชท LINE ได้โดยพิมพ์ <b>เป้าหมาย</b></p>
          } @else {
            <p class="kc-muted">ยังไม่มีโปรไฟล์โภชนาการ — พิมพ์ <b>เริ่ม</b> ในแชท LINE เพื่อตั้งค่า</p>
          }
          <p-button label="ดูประวัติ 7 วัน" icon="pi pi-chart-line" [outlined]="true" styleClass="full" routerLink="/history" />
        </section>

        <!-- AI usage -->
        <section class="kc-card">
          <div class="kc-card-title"><i class="pi pi-bolt"></i><h3>AI วันนี้</h3></div>
          @for (u of usage(); track u.label) {
            <div class="usage">
              <div class="usage-head">
                <span><i class="pi {{ u.icon }}"></i> {{ u.label }}</span>
                <span class="kc-muted">{{ u.used }}/{{ u.limit }}</span>
              </div>
              <p-progressbar [value]="pct(u)" [showValue]="false" />
            </div>
          }
        </section>

        <!-- Pro packages / subscription -->
        @if (m.checkoutEnabled) {
          @if (!m.autoRenew) {
            <section class="kc-card">
              <div class="kc-card-title"><i class="pi pi-crown"></i><h3>{{ m.plan === 'PRO' ? 'ต่ออายุ Pro' : 'สมัครสมาชิก Pro' }}</h3></div>
              @if (m.plan !== 'FREE' && m.periodEnd) {
                <p class="kc-muted kc-small">ตอนนี้ใช้ได้ถึง {{ fmtDateShort(m.periodEnd) }} · ซื้อเพิ่มจะบวกวันต่อจากนี้</p>
              }
              <kc-plan-picker />
            </section>
          } @else if (m.status === 'CANCELED') {
            <section class="kc-card">
              <p class="kc-muted">สมาชิกจะสิ้นสุดวันที่ {{ fmtDate(m.periodEnd) }}</p>
              <p-button label="กลับมาใช้งานต่อ" (onClick)="resume()" />
            </section>
          } @else {
            <section class="kc-card">
              <p-button label="ยกเลิกสมาชิก" severity="secondary" [outlined]="true" (onClick)="cancelSub()" />
            </section>
          }
        }

        <!-- promo entry: compact card opens a focused redeem screen -->
        @if (m.plan === 'FREE') {
          <button class="promo-entry" type="button" (click)="openPromo()">
            <span class="promo-entry-icon"><i class="pi pi-gift"></i></span>
            <span class="promo-entry-copy"><b>ใช้โค้ดโปรโมชั่น</b><small>กรอกโค้ดส่วนลดหรือสิทธิพิเศษ เพื่อรับโปรโมชั่นของคุณ</small></span>
            <i class="pi pi-chevron-right promo-entry-arrow"></i>
          </button>
        }

        @if (promoOpen()) {
          <div class="promo-overlay" role="presentation" (click)="closePromo()">
            <section class="promo-dialog" role="dialog" aria-modal="true" aria-labelledby="promo-title" (click)="$event.stopPropagation()">
              <button class="promo-close" type="button" aria-label="ปิด" (click)="closePromo()" [disabled]="redeeming()"><i class="pi pi-times"></i></button>
              @if (promoSuccess(); as success) {
                <div class="promo-success-icon"><i class="pi pi-check"></i></div>
                <h2 id="promo-title">ใช้โค้ดสำเร็จ!</h2>
                <p>คุณได้รับสิทธิ์ Trial {{ success.trialDays }} วันเรียบร้อยแล้ว</p>
                <p class="promo-hint">ใช้งานได้ถึง {{ fmtDate(success.expiresAt) }}</p>
                <p-button label="กลับไปหน้าโปรไฟล์" styleClass="promo-submit" (onClick)="closePromo()" />
              } @else {
                <div class="promo-icon"><i class="pi pi-gift"></i></div>
                <h2 id="promo-title">กรอกโค้ดโปรโมชั่น</h2>
                <p>กรอกโค้ดส่วนลดหรือสิทธิพิเศษ<br>เพื่อรับโปรโมชั่นของคุณ</p>
                <form (submit)="$event.preventDefault(); redeem()">
                  <label class="promo-label" for="promo-code">โค้ดโปรโมชั่น</label>
                  <div class="promo-input-wrap">
                    <i class="pi pi-tag"></i>
                    <input id="promo-code" pInputText name="promo" [(ngModel)]="promo" placeholder="กรอกโค้ดที่นี่" autocomplete="off" autocapitalize="characters" [disabled]="redeeming()" />
                  </div>
                  @if (promoMsg(); as pm) {
                    <p-message severity="error" [text]="pm.text" styleClass="mt" />
                  }
                  <button class="promo-submit" type="submit" [disabled]="redeeming() || !promo.trim()">
                    @if (redeeming()) { กำลังตรวจสอบโค้ด... } @else { ใช้งาน }
                  </button>
                </form>
                <p class="promo-hint">ใช้โค้ดได้เฉพาะสมาชิก Free ที่ยังไม่มี Trial หรือ Pro</p>
              }
            </section>
          </div>
        }

        <!-- reset goal -->
        <section class="kc-card danger-zone">
          <div class="kc-card-title"><i class="pi pi-refresh"></i><h3>ตั้งเป้าหมายใหม่</h3></div>
          <p class="kc-muted kc-small">เริ่มต้นใหม่ทั้งหมด: <b>ลบประวัติอาหาร น้ำหนัก การนอน ออกกำลังกาย น้ำ และแผนอาหารทั้งหมด</b> แล้วตั้งเป้าหมายใหม่ในแชท · สมาชิก Pro ยังอยู่ครบ</p>
          @if (!resetOpen()) {
            <p-button label="ตั้งเป้าหมายใหม่" severity="danger" [outlined]="true" (onClick)="resetOpen.set(true)" />
          } @else {
            <p-message severity="warn" text="ลบแล้วกู้คืนไม่ได้ พิมพ์คำว่า ลบข้อมูล เพื่อยืนยัน" />
            <div class="kc-row" style="margin-top:.6rem">
              <input pInputText class="grow" [(ngModel)]="resetText" placeholder="ลบข้อมูล" autocomplete="off" />
              <p-button label="ยืนยันลบ" severity="danger" [loading]="resetting()" [disabled]="resetText.trim() !== 'ลบข้อมูล'" (onClick)="resetGoal()" />
            </div>
            @if (resetMsg(); as rm) { <p-message [severity]="rm.ok ? 'success' : 'error'" [text]="rm.text" styleClass="mt" /> }
          }
        </section>

        <p-button label="ออกจากระบบ" icon="pi pi-sign-out" severity="secondary" [text]="true" styleClass="full" (onClick)="logout()" />
      </div>
    }
  `,
  styles: `
    .promo-entry { width:100%; display:flex; align-items:center; gap:.9rem; text-align:left; padding:1.05rem; border:1px solid var(--kc-line); border-radius:16px; background:#fff; cursor:pointer; color:var(--kc-heading); font:inherit; }
    .promo-entry-icon { width:46px; height:46px; background:#e8f6ec; color:#138348; border-radius:14px; display:grid; place-items:center; font-size:1.5rem; flex-shrink:0; }
    .promo-entry-copy { flex:1; display:flex; flex-direction:column; gap:.25rem; min-width:0; }
    .promo-entry-copy b { font-size:1.04rem; }
    .promo-entry-copy small { color:var(--kc-muted); font-size:.82rem; line-height:1.4; }
    .promo-entry-arrow { color:var(--kc-muted); }
    .promo-overlay { position:fixed; inset:0; z-index:2000; background:rgba(13,35,26,.55); display:flex; align-items:center; justify-content:center; padding:1rem; }
    .promo-dialog { position:relative; width:min(100%,430px); max-height:90dvh; overflow-y:auto; border-radius:24px; background:#fff; padding:2.5rem 1.4rem 1.6rem; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,.24); }
    .promo-close { position:absolute; right:1rem; top:1rem; border:0; background:transparent; font-size:1.15rem; padding:.4rem; cursor:pointer; color:#384a40; }
    .promo-icon,.promo-success-icon { width:74px; height:74px; margin:0 auto 1.15rem; display:grid; place-items:center; border-radius:50%; background:#e3f6e9; color:#11864c; font-size:2rem; }
    .promo-success-icon { width:88px; height:88px; font-size:2.4rem; }
    .promo-dialog h2 { margin:0 0 .55rem; color:#124d30; font-size:1.42rem; }
    .promo-dialog p { margin:0 auto 1.4rem; color:#59695f; line-height:1.65; font-size:.95rem; }
    .promo-dialog form { text-align:left; }
    .promo-label { display:block; margin-bottom:.5rem; font-weight:650; font-size:.9rem; color:#254b36; }
    .promo-input-wrap { display:flex; align-items:center; gap:.7rem; border:1px solid #bed8c8; padding:0 .9rem; border-radius:14px; height:54px; color:#2d8959; }
    .promo-input-wrap:focus-within { border-color:#07874a; box-shadow:0 0 0 3px #e1f7e9; }
    .promo-input-wrap input { border:0; box-shadow:none; outline:none; width:100%; min-width:0; font:inherit; }
    .promo-submit { margin-top:1rem; width:100%; min-height:52px; border:0; border-radius:13px; background:#07884d; color:#fff; font:inherit; font-weight:700; cursor:pointer; }
    .promo-submit:disabled { opacity:.55; cursor:not-allowed; }
    .promo-dialog .promo-hint { margin:1rem auto 0; font-size:.82rem; color:#7c8a81; }
    .hero { border-radius: 20px; padding: 1.1rem 1.2rem 1rem; color: #fff;
            background: linear-gradient(135deg, #2f8453 0%, #14442a 100%); box-shadow: 0 8px 24px rgba(20,68,42,.25); }
    .hero.pro { background: linear-gradient(135deg, #195534 0%, #082014 100%); }
    .hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: .5rem; }
    .hello { opacity: .8; font-size: .85rem; }
    .name { font-size: 1.3rem; font-weight: 700; }
    .plan-chip { background: rgba(255,255,255,.16); border: 1px solid rgba(255,255,255,.3); border-radius: 999px; padding: .2rem .7rem; font-weight: 700; font-size: .85rem; white-space: nowrap; }
    .hero-bottom { margin-top: 1.4rem; display: flex; justify-content: space-between; gap: .5rem; flex-wrap: wrap; font-size: .85rem; opacity: .92; }
    .goal { display: flex; align-items: center; justify-content: space-around; margin-bottom: .9rem; }
    .goal div { text-align: center; }
    .goal b { display: block; font-size: 1.4rem; color: var(--kc-heading); }
    .macros { grid-template-columns: repeat(2, 1fr); margin-bottom: .2rem; }
    .macros .kc-stat b { display: inline; margin-right: .2rem; }
    .macros .kc-stat span:last-child { display: inline; }
    .usage + .usage { margin-top: .7rem; }
    .usage-head { display: flex; justify-content: space-between; font-size: .9rem; margin-bottom: .3rem; }
    .usage-head i { color: var(--kc-green); margin-right: .25rem; font-size: .85rem; }
    .big-ic { font-size: 2rem; color: var(--kc-danger); margin-bottom: .5rem; display: block; }
    :host ::ng-deep .mt { margin-top: .6rem; }
    :host ::ng-deep .full { width: 100%; margin-top: .4rem; }
  `,
})
export class ProfilePage implements OnInit {
  private readonly api = inject(Api);
  private readonly session = inject(MemberSession);
  private readonly confirm = inject(ConfirmationService);

  readonly loading = signal(true);
  readonly status = signal('กำลังเข้าสู่ระบบ Kcal Coach...');
  readonly error = signal<string | null>(null);
  readonly m = signal<Membership | null>(null);
  readonly usage = computed<UsageRow[]>(() => {
    const m = this.m();
    if (!m) return [];
    return USAGE.filter((u) => m.limits?.[u.key] != null).map((u) => ({
      label: u.label,
      icon: u.icon,
      used: Number(m.usage?.[u.usage] ?? 0),
      limit: Number(m.limits[u.key]),
    }));
  });

  promo = '';
  readonly promoOpen = signal(false);
  readonly promoSuccess = signal<{ trialDays: number; expiresAt: string } | null>(null);
  openPromo() {
    this.promo = '';
    this.promoMsg.set(null);
    this.promoSuccess.set(null);
    this.promoOpen.set(true);
  }
  closePromo() {
    if (this.redeeming()) return;
    this.promoOpen.set(false);
    this.promoMsg.set(null);
  }
  readonly redeeming = signal(false);
  readonly promoMsg = signal<{ ok: boolean; text: string } | null>(null);
  readonly resetOpen = signal(false);
  resetText = '';
  readonly resetting = signal(false);
  readonly resetMsg = signal<{ ok: boolean; text: string } | null>(null);

  readonly fmtNum = fmtNum;
  readonly fmtDate = fmtDate;
  readonly fmtDateShort = fmtDateShort;
  readonly statusLabel = statusLabelTh;

  ngOnInit() {
    void this.load();
  }

  pct(u: UsageRow) {
    return u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0;
  }

  async load() {
    this.loading.set(true);
    this.error.set(null);
    try {
      const m = await this.session.ensure((t) => this.status.set(t));
      if (!m) return; // LIFF redirect
      this.m.set(m);
      this.loading.set(false);
    } catch (e) {
      this.error.set(errorMessage(e, 'ไม่สามารถเข้าสู่ระบบผ่าน LINE ได้ กรุณาลองใหม่อีกครั้ง'));
      this.loading.set(false);
    }
  }

  private async refresh() {
    try {
      this.m.set(await this.api.get<Membership>('/api/membership'));
    } catch (e) {
      this.session.redirectIfUnauthorized(e);
    }
  }

  async redeem() {
    this.redeeming.set(true);
    this.promoMsg.set(null);
    try {
      const r = await this.api.post<{ trialDays: number; expiresAt: string }>('/api/membership/promo/redeem', {
        code: this.promo,
      });
      this.promoSuccess.set(r);
      this.promo = '';
      await this.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        void this.load();
        return;
      }
      this.promoMsg.set({ ok: false, text: redeemErrorTh(errorMessage(e)) });
    } finally {
      this.redeeming.set(false);
    }
  }

  cancelSub() {
    this.confirm.confirm({
      header: 'ยกเลิกสมาชิก?',
      message: 'จะใช้งาน Pro ได้ถึงสิ้นรอบบิล',
      acceptLabel: 'ยืนยันยกเลิก',
      rejectLabel: 'ไม่ยกเลิก',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: async () => {
        await this.api.post('/api/membership/cancel');
        await this.refresh();
      },
    });
  }

  async resume() {
    await this.api.post('/api/membership/resume');
    await this.refresh();
  }

  async resetGoal() {
    this.resetting.set(true);
    this.resetMsg.set(null);
    try {
      await this.api.post('/api/membership/reset-goal', { confirm: this.resetText.trim() });
      this.resetMsg.set({ ok: true, text: 'ลบข้อมูลแล้ว กำลังพากลับไปตั้งเป้าหมายใหม่ในแชท...' });
      if (await this.session.sendStartAndClose()) return;
      this.resetMsg.set({ ok: true, text: 'ลบข้อมูลแล้ว ✅ กลับไปที่แชท LINE แล้วพิมพ์ "เริ่ม" เพื่อตั้งเป้าหมายใหม่' });
      await this.refresh();
    } catch (e) {
      if (this.session.redirectIfUnauthorized(e)) return;
      this.resetMsg.set({ ok: false, text: errorMessage(e) });
    } finally {
      this.resetting.set(false);
    }
  }

  async logout() {
    await this.session.logout();
    location.replace(PROFILE_PATH);
  }
}
