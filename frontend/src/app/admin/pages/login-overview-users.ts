import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DrawerModule } from 'primeng/drawer';
import { SkeletonModule } from 'primeng/skeleton';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Api, errorMessage } from '../../core/api';
import { fmtDate, fmtNum, statusLabelTh } from '../../core/format';
import { AdminApi } from '../admin-api';

/* ------------------------------ login ------------------------------ */

@Component({
  selector: 'kc-admin-login',
  imports: [FormsModule, ButtonModule, InputTextModule, PasswordModule, MessageModule],
  template: `
    <div class="wrap">
      <form class="kc-card box" (ngSubmit)="login()">
        <div class="logo"><i class="pi pi-heart-fill"></i></div>
        <h1>Kcal Coach Admin</h1>
        <div class="kc-field">
          <label for="u">ชื่อผู้ใช้</label>
          <input pInputText id="u" name="u" [(ngModel)]="username" autocomplete="username" required />
        </div>
        <div class="kc-field">
          <label for="p">รหัสผ่าน</label>
          <p-password inputId="p" name="p" [(ngModel)]="password" [feedback]="false" [toggleMask]="true"
                      autocomplete="current-password" styleClass="full" inputStyleClass="full" />
        </div>
        @if (error()) { <p-message severity="error" [text]="error()!" /> }
        <p-button type="submit" label="เข้าสู่ระบบ" [loading]="busy()" styleClass="full" />
      </form>
    </div>
  `,
  styles: `
    .wrap { min-height: 100dvh; display: grid; place-items: center; padding: 1rem;
            background: radial-gradient(circle at 20% 10%, #d6ecdd 0, transparent 45%), var(--kc-bg); }
    .box { width: min(100%, 380px); display: grid; gap: 1rem; padding: 1.6rem; }
    .box h1 { text-align: center; }
    .logo { justify-self: center; width: 54px; height: 54px; border-radius: 16px; background: var(--kc-green); color: #add9bd; display: grid; place-items: center; font-size: 1.3rem; }
    :host ::ng-deep .full { width: 100%; }
  `,
})
export class AdminLoginPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  username = '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  async login() {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.post('/admin/api/login', { username: this.username, password: this.password });
      const next = new URLSearchParams(location.search).get('next');
      void this.router.navigateByUrl(next && next.startsWith('/admin') ? next : '/admin');
    } catch (e) {
      this.error.set(
        e instanceof Error && e.message === 'Too many attempts'
          ? 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่'
          : 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      );
    } finally {
      this.busy.set(false);
    }
  }
}

/* ----------------------------- overview ---------------------------- */

type Dashboard = {
  totalUsers: number;
  freeUsers: number;
  proUsers: number;
  trialUsers: number;
  activeSubscriptions: number;
  canceledSubscriptions: number;
  promoCodes: number;
  revenueNote: string;
  aiUsageTotals: Record<'foodText' | 'vision' | 'adjustment' | 'coach' | 'classify' | 'total', number>;
};

type CodexStatus = {
  enabled: boolean;
  keyOk: boolean;
  signedIn: boolean;
  pausedUntil: string | null;
  lastOkAt: string | null;
  lastError: string | null;
};

@Component({
  selector: 'kc-admin-overview',
  imports: [RouterLink, SkeletonModule, TagModule, ButtonModule],
  template: `
    <div class="page-head"><h1>ภาพรวม</h1></div>
    @if (d(); as d) {
      <div class="stats">
        <div class="stat big"><span><i class="pi pi-users"></i> ผู้ใช้ทั้งหมด</span><b>{{ fmtNum(d.totalUsers) }}</b></div>
        <div class="stat"><span>FREE</span><b>{{ fmtNum(d.freeUsers) }}</b></div>
        <div class="stat pro"><span><i class="pi pi-crown"></i> PRO</span><b>{{ fmtNum(d.proUsers) }}</b></div>
        <div class="stat"><span><i class="pi pi-sparkles"></i> Trial</span><b>{{ fmtNum(d.trialUsers) }}</b></div>
        <div class="stat"><span>สมาชิก Active</span><b>{{ fmtNum(d.activeSubscriptions) }}</b></div>
        <div class="stat"><span>ยกเลิกแล้ว</span><b>{{ fmtNum(d.canceledSubscriptions) }}</b></div>
      </div>

      <div class="two">
        <section class="kc-card">
          <div class="kc-card-title"><i class="pi pi-bolt"></i><h3>การใช้ AI (สะสม)</h3></div>
          <div class="kc-grid">
            <div class="kc-stat"><span>ทั้งหมด</span><b>{{ fmtNum(d.aiUsageTotals.total) }}</b></div>
            <div class="kc-stat"><span>ข้อความอาหาร</span><b>{{ fmtNum(d.aiUsageTotals.foodText) }}</b></div>
            <div class="kc-stat"><span>รูปอาหาร</span><b>{{ fmtNum(d.aiUsageTotals.vision) }}</b></div>
            <div class="kc-stat"><span>แก้ไข</span><b>{{ fmtNum(d.aiUsageTotals.adjustment) }}</b></div>
            <div class="kc-stat"><span>Coach</span><b>{{ fmtNum(d.aiUsageTotals.coach) }}</b></div>
            <div class="kc-stat"><span>แยกประเภท</span><b>{{ fmtNum(d.aiUsageTotals.classify) }}</b></div>
          </div>
          <p class="kc-muted kc-small" style="margin-top:.75rem">{{ d.revenueNote }}</p>
          <p-button label="ดูค่าใช้จ่าย AI" icon="pi pi-arrow-right" iconPos="right" [text]="true" routerLink="/admin/ai-usage" />
        </section>

        <section class="kc-card">
          <div class="kc-card-title"><i class="pi pi-sparkles"></i><h3>AI ของ Trial</h3></div>
          @if (codex(); as c) {
            <p-tag [value]="codexLabel(c)" [severity]="codexSeverity(c)" [rounded]="true" />
            <p class="kc-muted kc-small" style="margin-top:.6rem">ตอบสำเร็จล่าสุด {{ fmtDate(c.lastOkAt) }}</p>
            @if (c.lastError) { <p class="kc-err kc-small">error ล่าสุด: {{ c.lastError }}</p> }
          } @else {
            <p-skeleton height="2rem" />
          }
          <p-button label="จัดการ" icon="pi pi-arrow-right" iconPos="right" [text]="true" routerLink="/admin/settings" />
        </section>
      </div>

      <section class="kc-card shortcuts">
        <a routerLink="/admin/users"><i class="pi pi-search"></i><b>ค้นหาผู้ใช้</b><span>ดูสถานะ / จบ Trial</span></a>
        <a routerLink="/admin/promos"><i class="pi pi-gift"></i><b>สร้างโค้ดโปรโม</b><span>Free PRO</span></a>
        <a routerLink="/admin/plans"><i class="pi pi-tags"></i><b>แพ็กเกจ & ราคา</b><span>ส่วนลด / เปิดปิดขาย</span></a>
        <a routerLink="/admin/settings"><i class="pi pi-cog"></i><b>ตั้งค่า</b><span>Rich menu · แจ้งเตือน · รหัสผ่าน</span></a>
      </section>
    } @else {
      <div class="stats">@for (i of [1, 2, 3, 4, 5, 6]; track i) { <p-skeleton height="88px" borderRadius="14px" /> }</div>
    }
  `,
  styles: `
    .page-head { margin-bottom: 1rem; }
    .stats { display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 1rem; }
    .stat { background: #fff; border: 1px solid var(--kc-line); border-radius: 14px; padding: .9rem 1rem; }
    .stat span { color: var(--kc-muted); font-size: .85rem; }
    .stat b { display: block; font-size: 1.7rem; color: var(--kc-heading); }
    .stat.big { background: linear-gradient(135deg, #195534, #0f2a1b); border: 0; }
    .stat.big span, .stat.big b { color: #fff; } .stat.big span { opacity: .8; }
    .stat.pro b { color: var(--kc-green); }
    .two { display: grid; gap: 1rem; grid-template-columns: 2fr 1fr; }
    .two .kc-card + .kc-card { margin-top: 0; }
    @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
    .shortcuts { margin-top: 1rem; display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
    .shortcuts a { display: grid; grid-template-columns: auto 1fr; column-gap: .7rem; padding: .8rem; border-radius: 12px; text-decoration: none; color: inherit; background: var(--kc-green-soft); }
    .shortcuts a:hover { background: #d6ecdd; }
    .shortcuts i { grid-row: span 2; color: var(--kc-green); font-size: 1.2rem; align-self: center; }
    .shortcuts b { color: var(--kc-heading); } .shortcuts span { color: var(--kc-muted); font-size: .82rem; }
  `,
})
export class AdminOverviewPage implements OnInit {
  private readonly api = inject(AdminApi);
  readonly d = signal<Dashboard | null>(null);
  readonly codex = signal<CodexStatus | null>(null);
  readonly fmtNum = fmtNum;
  readonly fmtDate = fmtDate;

  async ngOnInit() {
    this.d.set(await this.api.get<Dashboard>('dashboard'));
    this.codex.set(await this.api.get<CodexStatus>('codex').catch(() => null));
  }

  codexLabel(c: CodexStatus) {
    if (!c.keyOk) return 'ยังไม่ได้ตั้ง CODEX_VAULT_KEY';
    if (!c.enabled) return 'ปิดอยู่ (Trial ใช้ API)';
    if (!c.signedIn) return 'ยังไม่ได้เชื่อม — Trial ใช้ AI ไม่ได้';
    if (c.pausedUntil) return 'พักชั่วคราว';
    return 'ใช้งานอยู่';
  }

  codexSeverity(c: CodexStatus): 'success' | 'warn' | 'danger' | 'secondary' {
    if (!c.keyOk || (c.enabled && !c.signedIn)) return 'danger';
    if (!c.enabled) return 'secondary';
    return c.pausedUntil ? 'warn' : 'success';
  }
}

/* ------------------------------ users ------------------------------ */

type UserRow = { id: string; lineUserId: string | null; displayName: string | null; createdAt: string };
type UserDetail = {
  user: UserRow;
  entitlement: { plan: string; status: string; hasProAccess: boolean; periodEnd: string | null };
  subscription: { plan: string; status: string; provider: string; trialEndsAt: string | null; currentPeriodEnd: string | null; canceledAt: string | null } | null;
  usage: Record<string, number>;
  promoRedemptions: { code: string; redeemedAt: string; expiresAt: string | null }[];
};

const USAGE_LABELS: Record<string, string> = {
  totalCalls: 'รวม',
  foodTextCalls: 'ข้อความอาหาร',
  visionCalls: 'รูปอาหาร',
  adjustmentCalls: 'แก้ไข',
  coachCalls: 'Coach',
  classifyCalls: 'แยกประเภท',
  bodyScanCalls: 'Body Scan',
  mealPlanCalls: 'แผนอาหาร',
  weeklyReviewCalls: 'สรุปสัปดาห์',
};

@Component({
  selector: 'kc-admin-users',
  imports: [FormsModule, ButtonModule, InputTextModule, TableModule, TagModule, DrawerModule, IconFieldModule, InputIconModule, MessageModule],
  template: `
    <div class="page-head"><h1>ผู้ใช้</h1></div>
    <section class="kc-card">
      <form class="kc-row" (ngSubmit)="search()">
        <p-iconfield class="grow">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText name="q" [(ngModel)]="q" placeholder="ชื่อ / LINE userId / userId" class="full" />
        </p-iconfield>
        <p-button type="submit" label="ค้นหา" [loading]="searching()" />
      </form>
      <p class="kc-muted kc-small" style="margin:.5rem 0 0">ค้นจากชื่อตรงตัวพิมพ์ใหญ่/เล็ก</p>
    </section>

    @if (searched()) {
      <section class="kc-card">
        <p-table [value]="rows()" [rows]="20" [paginator]="rows().length > 20" dataKey="id" [tableStyle]="{ 'min-width': '520px' }">
          <ng-template #header>
            <tr><th>ชื่อ</th><th>LINE userId</th><th>สมัครเมื่อ</th><th></th></tr>
          </ng-template>
          <ng-template #body let-u>
            <tr class="click" (click)="open(u)">
              <td><b>{{ u.displayName || '-' }}</b></td>
              <td class="kc-muted mono">{{ u.lineUserId || '-' }}</td>
              <td class="kc-muted">{{ fmtDate(u.createdAt) }}</td>
              <td style="text-align:right"><p-button icon="pi pi-angle-right" [text]="true" severity="secondary" /></td>
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="4" class="kc-muted">ไม่พบผู้ใช้</td></tr></ng-template>
        </p-table>
      </section>
    }

    <p-drawer [visible]="!!detail()" (visibleChange)="!$event && detail.set(null)" position="right" styleClass="kc-user-drawer"
              [header]="detail()?.user?.displayName || 'ผู้ใช้'">
      @if (detail(); as d) {
        <div class="kc-stack">
          <div class="ent">
            <p-tag [value]="d.entitlement.hasProAccess ? 'PRO' : 'FREE'" [severity]="d.entitlement.hasProAccess ? 'success' : 'secondary'" />
            <span>{{ statusLabel(d.entitlement.status) }}</span>
            @if (d.entitlement.periodEnd) { <span class="kc-muted">ถึง {{ fmtDate(d.entitlement.periodEnd) }}</span> }
          </div>
          @if (d.entitlement.status === 'TRIALING') {
            <p-message severity="info">
              <div class="trial">
                <span>อยู่ใน Trial (ใช้ AI ผ่าน Codex)</span>
                <p-button label="จบ Trial ตอนนี้" severity="danger" size="small" [loading]="ending()" (onClick)="endTrial(d)" />
              </div>
            </p-message>
          }
          <dl class="kv">
            <dt>userId</dt><dd class="mono">{{ d.user.id }}</dd>
            <dt>LINE userId</dt><dd class="mono">{{ d.user.lineUserId || '-' }}</dd>
            <dt>สมัครเมื่อ</dt><dd>{{ fmtDate(d.user.createdAt) }}</dd>
            @if (d.subscription; as s) {
              <dt>Subscription</dt><dd>{{ s.plan }} · {{ s.status }} · {{ s.provider }}</dd>
              <dt>หมดรอบ</dt><dd>{{ fmtDate(s.currentPeriodEnd || s.trialEndsAt) }}</dd>
            }
          </dl>
          <div>
            <h3>AI วันนี้</h3>
            <div class="kc-grid">
              @for (k of usageKeys(d); track k) {
                <div class="kc-stat"><span>{{ usageLabel(k) }}</span><b>{{ d.usage[k] }}</b></div>
              }
            </div>
          </div>
          @if (d.promoRedemptions.length) {
            <div>
              <h3>โค้ดที่ใช้</h3>
              @for (r of d.promoRedemptions; track r.code) {
                <div class="promo"><b>{{ r.code }}</b><span class="kc-muted">{{ fmtDate(r.redeemedAt) }}</span></div>
              }
            </div>
          }
        </div>
      }
    </p-drawer>
  `,
  styles: `
    .page-head { margin-bottom: 1rem; }
    .click { cursor: pointer; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; word-break: break-all; }
    .ent { display: flex; gap: .5rem; align-items: center; flex-wrap: wrap; }
    .trial { display: flex; gap: .75rem; align-items: center; justify-content: space-between; flex-wrap: wrap; width: 100%; }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: .45rem .75rem; margin: 0; font-size: .9rem; }
    .kv dt { color: var(--kc-muted); } .kv dd { margin: 0; }
    .promo { display: flex; justify-content: space-between; padding: .35rem 0; border-bottom: 1px solid var(--kc-line); font-size: .9rem; }
    :host ::ng-deep .kc-user-drawer { width: min(100vw, 460px); }
    :host ::ng-deep .full { width: 100%; }
  `,
})
export class AdminUsersPage {
  private readonly api = inject(AdminApi);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  q = '';
  readonly rows = signal<UserRow[]>([]);
  readonly searched = signal(false);
  readonly searching = signal(false);
  readonly detail = signal<UserDetail | null>(null);
  readonly ending = signal(false);
  readonly fmtDate = fmtDate;
  readonly statusLabel = statusLabelTh;

  async search() {
    this.searching.set(true);
    try {
      this.rows.set(await this.api.get<UserRow[]>('users?q=' + encodeURIComponent(this.q.trim())));
      this.searched.set(true);
    } catch (e) {
      this.toast.add({ severity: 'error', summary: errorMessage(e) });
    } finally {
      this.searching.set(false);
    }
  }

  async open(u: UserRow) {
    this.detail.set(await this.api.get<UserDetail>('users/' + encodeURIComponent(u.id)));
  }

  usageKeys(d: UserDetail) {
    return Object.keys(USAGE_LABELS).filter((k) => typeof d.usage?.[k] === 'number');
  }

  usageLabel(k: string) {
    return USAGE_LABELS[k] ?? k;
  }

  endTrial(d: UserDetail) {
    this.confirm.confirm({
      header: 'จบ Trial ตอนนี้?',
      message: `${d.user.displayName || d.user.id} จะกลับเป็น FREE (หรือ Pro ที่จ่ายเงินไว้ถ้ายังไม่หมด)`,
      acceptLabel: 'จบ Trial',
      rejectLabel: 'ยกเลิก',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: async () => {
        this.ending.set(true);
        try {
          this.detail.set(await this.api.post<UserDetail>('users/' + encodeURIComponent(d.user.id) + '/end-trial'));
          this.toast.add({ severity: 'success', summary: 'จบ Trial แล้ว', life: 2500 });
        } catch (e) {
          this.toast.add({ severity: 'error', summary: errorMessage(e) });
        } finally {
          this.ending.set(false);
        }
      },
    });
  }
}
