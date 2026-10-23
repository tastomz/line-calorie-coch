import { Component, OnInit, inject, input, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageModule } from 'primeng/message';
import { Api, errorMessage } from '../core/api';
import { MemberSession, PricedPlan } from '../core/member';
import { baht, fmtDateShort } from '../core/format';

/** Pro packages with a PromptPay buy button. Server decides prices; client sends planCode only. */
@Component({
  selector: 'kc-plan-picker',
  imports: [ButtonModule, TagModule, SkeletonModule, MessageModule],
  template: `
    @if (loading()) {
      <div class="plans">
        @for (i of [1, 2, 3, 4]; track i) {
          <p-skeleton height="92px" borderRadius="14px" />
        }
      </div>
    } @else if (loadError()) {
      <p-message severity="error" [text]="loadError()!" />
    } @else if (!plans().length) {
      <p class="kc-muted">ยังไม่มีแพ็กเกจเปิดขายครับ</p>
    } @else {
      <div class="plans">
        @for (p of plans(); track p.code) {
          <button type="button" class="plan" [class.best]="p.code === bestCode()"
                  [disabled]="!checkoutEnabled() || busy() !== null" (click)="buy(p)">
            <div class="top">
              <b>{{ p.labelTh }}</b>
              @if (p.code === bestCode()) { <p-tag value="คุ้มสุด" severity="success" [rounded]="true" /> }
              @if (p.discountActive) { <p-tag [value]="p.discountLabel || 'ลดราคา'" severity="warn" [rounded]="true" /> }
            </div>
            <div class="price">
              @if (p.discountActive) { <s>{{ baht(p.priceThb) }}</s> }
              <span>{{ baht(p.finalPriceThb) }}</span>
            </div>
            <div class="kc-muted kc-small">
              {{ p.days }} วัน @if (p.days > 30) { · ตกเดือนละ {{ baht(p.perMonthThb) }} }
            </div>
            @if (p.discountActive && p.discountEndsAt) {
              <div class="kc-muted kc-small">ราคานี้ถึง {{ fmtDateShort(p.discountEndsAt) }}</div>
            }
            @if (busy() === p.code) { <i class="pi pi-spin pi-spinner spin"></i> }
          </button>
        }
      </div>
      <p class="kc-muted kc-small note">
        @if (checkoutEnabled()) {
          กดเลือกแพ็กเกจ แล้วสแกน QR พร้อมเพย์ด้วยแอปธนาคาร · จ่ายครั้งเดียว ไม่ตัดเงินอัตโนมัติ · ถ้ายังเป็น Pro อยู่ จะบวกวันต่อจากวันหมดอายุเดิม
        } @else {
          การชำระเงินยังไม่เปิดให้บริการ — ใช้โค้ดโปรโมชั่นที่หน้าโปรไฟล์ได้ถ้ามี
        }
      </p>
      @if (buyError()) { <p-message severity="error" [text]="buyError()!" /> }
    }
  `,
  styles: `
    .plans { display: grid; gap: .65rem; grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .plan { position: relative; text-align: left; background: #fff; border: 1.5px solid var(--kc-line); border-radius: 14px;
            padding: .8rem .85rem; cursor: pointer; font: inherit; color: inherit; transition: border-color .15s, box-shadow .15s, transform .1s; }
    .plan:hover:not(:disabled) { border-color: var(--kc-green); box-shadow: 0 4px 14px rgba(25,85,52,.12); }
    .plan:active:not(:disabled) { transform: scale(.98); }
    .plan:disabled { opacity: .6; cursor: default; }
    .plan.best { border-color: var(--kc-green); background: linear-gradient(180deg, #f3faf5, #fff); }
    .top { display: flex; align-items: center; gap: .35rem; flex-wrap: wrap; color: var(--kc-heading); }
    .price { margin: .35rem 0 .1rem; }
    .price span { font-size: 1.45rem; font-weight: 700; color: var(--kc-heading); }
    .price s { color: var(--kc-muted); margin-right: .35rem; font-size: .9rem; }
    .spin { position: absolute; top: .7rem; right: .7rem; color: var(--kc-green); }
    .note { margin-top: .75rem; }
  `,
})
export class PlanPicker implements OnInit {
  private readonly api = inject(Api);
  private readonly session = inject(MemberSession);
  readonly checkoutOverride = input<boolean | null>(null);

  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly plans = signal<PricedPlan[]>([]);
  readonly checkoutEnabled = signal(false);
  readonly bestCode = signal<string | null>(null);
  readonly busy = signal<string | null>(null);
  readonly buyError = signal<string | null>(null);
  readonly baht = baht;
  readonly fmtDateShort = fmtDateShort;

  async ngOnInit() {
    try {
      const d = await this.api.get<{ checkoutEnabled: boolean; plans: PricedPlan[] }>('/api/membership/plans');
      this.plans.set(d.plans ?? []);
      this.checkoutEnabled.set(this.checkoutOverride() ?? d.checkoutEnabled);
      const best = (d.plans ?? []).reduce<PricedPlan | null>(
        (b, p) => (p.days > 30 && (!b || p.perMonthThb < b.perMonthThb) ? p : b),
        null,
      );
      this.bestCode.set(best?.code ?? null);
    } catch (e) {
      this.loadError.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async buy(p: PricedPlan) {
    this.busy.set(p.code);
    this.buyError.set(null);
    try {
      const r = await this.api.post<{ url: string }>('/api/membership/checkout', { planCode: p.code });
      location.href = r.url;
    } catch (e) {
      if (this.session.redirectIfUnauthorized(e)) return;
      this.buyError.set(errorMessage(e));
      this.busy.set(null);
    }
  }
}
