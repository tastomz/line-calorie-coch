import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageModule } from 'primeng/message';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { PasswordModule } from 'primeng/password';
import { ConfirmationService, MessageService } from 'primeng/api';
import { errorMessage } from '../../core/api';
import { baht, fmtDate, fmtNum } from '../../core/format';
import { AdminApi } from '../admin-api';

/* ------------------------------ AI usage --------------------------- */

type CostRow = { estimatedCostThb?: number | null; costKnown?: boolean };
type Summary = {
  fromDate: string;
  toDate: string;
  activeUsers: number;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: {
    available: boolean;
    totalCostThb?: number;
    inputCostThb?: number;
    outputCostThb?: number;
    note?: string;
    message?: string;
    partialCostThb?: number | null;
    unknownRequests?: number;
  };
};
type Rows<T> = { rows: T[] };
type MemberRow = { users: number; requests: number; totalTokens: number; estimatedCostThb: number | null };

@Component({
  selector: 'kc-admin-usage',
  imports: [FormsModule, SelectButtonModule, TableModule, SkeletonModule, TagModule],
  template: `
    <div class="page-head">
      <h1>AI Usage</h1>
      <p-selectbutton [options]="ranges" [(ngModel)]="range" optionLabel="label" optionValue="value" (onChange)="load()" [allowEmpty]="false" />
    </div>

    @if (s(); as s) {
      <p class="kc-muted kc-small">{{ s.fromDate }} → {{ s.toDate }}</p>
      <div class="stats">
        <div class="stat cost">
          <span><i class="pi pi-wallet"></i> ค่าใช้จ่ายโดยประมาณ</span>
          @if (s.estimatedCost.available) {
            <b>{{ money(s.estimatedCost.totalCostThb) }}</b>
            <small>Input {{ money(s.estimatedCost.inputCostThb) }} · Output {{ money(s.estimatedCost.outputCostThb) }}</small>
          } @else {
            <b class="sm">{{ s.estimatedCost.message || '—' }}</b>
            @if (s.estimatedCost.partialCostThb != null) { <small>ส่วนที่รู้ราคา {{ money(s.estimatedCost.partialCostThb) }}</small> }
          }
        </div>
        <div class="stat"><span>ผู้ใช้ที่ใช้ AI</span><b>{{ fmtNum(s.activeUsers) }}</b></div>
        <div class="stat"><span>จำนวนครั้ง</span><b>{{ fmtNum(s.requests) }}</b></div>
        <div class="stat"><span>Input tokens</span><b>{{ fmtNum(s.inputTokens) }}</b></div>
        <div class="stat"><span>Output tokens</span><b>{{ fmtNum(s.outputTokens) }}</b></div>
      </div>
      @if (s.estimatedCost.note) { <p class="kc-muted kc-small">{{ s.estimatedCost.note }}</p> }

      <div class="two">
        <section class="kc-card">
          <h3>ตามฟีเจอร์</h3>
          <p-table [value]="feature()" size="small">
            <ng-template #header><tr><th>ฟีเจอร์</th><th class="r">ครั้ง</th><th class="r">Tokens</th><th class="r">ค่าใช้จ่าย</th></tr></ng-template>
            <ng-template #body let-r><tr><td>{{ r.feature }}</td><td class="r">{{ fmtNum(r.requests) }}</td><td class="r">{{ fmtNum(r.totalTokens) }}</td><td class="r">{{ cost(r) }}</td></tr></ng-template>
            <ng-template #emptymessage><tr><td colspan="4" class="kc-muted">ไม่มีข้อมูล</td></tr></ng-template>
          </p-table>
        </section>
        <section class="kc-card">
          <h3>ตามโมเดล</h3>
          <p-table [value]="model()" size="small">
            <ng-template #header><tr><th>โมเดล</th><th class="r">ครั้ง</th><th class="r">Tokens</th><th class="r">ค่าใช้จ่าย</th></tr></ng-template>
            <ng-template #body let-r>
              <tr>
                <td>{{ r.model }} @if (isCodex(r.model)) { <p-tag value="ChatGPT" severity="info" /> } @else if (!r.priced) { <span class="kc-muted kc-small">(ไม่รู้ราคา)</span> }</td>
                <td class="r">{{ fmtNum(r.requests) }}</td><td class="r">{{ fmtNum(r.totalTokens) }}</td>
                <td class="r">{{ isCodex(r.model) ? 'ฟรี (Trial)' : cost(r) }}</td>
              </tr>
            </ng-template>
            <ng-template #emptymessage><tr><td colspan="4" class="kc-muted">ไม่มีข้อมูล</td></tr></ng-template>
          </p-table>
        </section>
      </div>

      <section class="kc-card">
        <h3>ตามสถานะสมาชิก (ปัจจุบัน)</h3>
        @if (membership()?.note) { <p class="kc-muted kc-small">{{ membership()?.note }}</p> }
        <p-table [value]="memberRows()" size="small">
          <ng-template #header><tr><th></th><th class="r">ผู้ใช้</th><th class="r">ครั้ง</th><th class="r">Tokens</th><th class="r">ค่าใช้จ่าย</th></tr></ng-template>
          <ng-template #body let-r><tr><td><b>{{ r.label }}</b></td><td class="r">{{ fmtNum(r.users) }}</td><td class="r">{{ fmtNum(r.requests) }}</td><td class="r">{{ fmtNum(r.totalTokens) }}</td><td class="r">{{ r.estimatedCostThb == null ? '—' : money(r.estimatedCostThb) }}</td></tr></ng-template>
        </p-table>
      </section>

      <div class="two">
        <section class="kc-card">
          <h3>รายวัน</h3>
          <p-table [value]="daily()" size="small" [scrollable]="true" scrollHeight="360px">
            <ng-template #header><tr><th>วันที่</th><th class="r">ครั้ง</th><th class="r">Tokens</th><th class="r">ค่าใช้จ่าย</th></tr></ng-template>
            <ng-template #body let-r><tr><td>{{ r.date }}</td><td class="r">{{ fmtNum(r.requests) }}</td><td class="r">{{ fmtNum(r.totalTokens) }}</td><td class="r">{{ cost(r) }}</td></tr></ng-template>
            <ng-template #emptymessage><tr><td colspan="4" class="kc-muted">ไม่มีข้อมูล</td></tr></ng-template>
          </p-table>
        </section>
        <section class="kc-card">
          <h3>ผู้ใช้ที่ใช้มากสุด</h3>
          <p-table [value]="users()" size="small" [scrollable]="true" scrollHeight="360px">
            <ng-template #header><tr><th>ผู้ใช้</th><th>แผน</th><th class="r">ครั้ง</th><th class="r">Tokens</th></tr></ng-template>
            <ng-template #body let-r><tr><td>{{ r.displayName || r.lineUserId || r.userId.slice(0, 8) }}</td><td>{{ r.membership }}</td><td class="r">{{ fmtNum(r.requests) }}</td><td class="r">{{ fmtNum(r.totalTokens) }}</td></tr></ng-template>
            <ng-template #emptymessage><tr><td colspan="4" class="kc-muted">ไม่มีข้อมูล</td></tr></ng-template>
          </p-table>
        </section>
      </div>
    } @else {
      <div class="stats">@for (i of [1, 2, 3, 4, 5]; track i) { <p-skeleton height="90px" borderRadius="14px" /> }</div>
    }
  `,
  styles: `
    .page-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; }
    .page-head h1 { margin: 0; }
    .stats { display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin: .5rem 0 1rem; }
    .stat { background: #fff; border: 1px solid var(--kc-line); border-radius: 14px; padding: .9rem 1rem; }
    .stat span { color: var(--kc-muted); font-size: .85rem; }
    .stat b { display: block; font-size: 1.5rem; color: var(--kc-heading); }
    .stat b.sm { font-size: .95rem; }
    .stat small { color: var(--kc-muted); font-size: .78rem; }
    .stat.cost { background: linear-gradient(135deg, #195534, #0f2a1b); border: 0; }
    .stat.cost span, .stat.cost b, .stat.cost small { color: #fff; } .stat.cost span, .stat.cost small { opacity: .8; }
    .two { display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; margin: 1rem 0; }
    .two .kc-card + .kc-card { margin-top: 0; }
    @media (max-width: 900px) { .two { grid-template-columns: 1fr; } }
    .r { text-align: right !important; }
  `,
})
export class AdminUsagePage implements OnInit {
  private readonly api = inject(AdminApi);
  readonly ranges = [
    { label: 'วันนี้', value: 'today' },
    { label: '7 วัน', value: '7d' },
    { label: '30 วัน', value: '30d' },
  ];
  range = '7d';
  readonly s = signal<Summary | null>(null);
  readonly feature = signal<(CostRow & Record<string, unknown>)[]>([]);
  readonly model = signal<(CostRow & Record<string, unknown>)[]>([]);
  readonly daily = signal<(CostRow & Record<string, unknown>)[]>([]);
  readonly users = signal<Record<string, unknown>[]>([]);
  readonly membership = signal<{ note?: string; FREE?: MemberRow; PRO?: MemberRow } | null>(null);
  readonly memberRows = signal<(MemberRow & { label: string })[]>([]);
  readonly fmtNum = fmtNum;

  ngOnInit() {
    void this.load();
  }

  money(n: number | null | undefined) {
    return baht(n, 4);
  }

  cost(r: CostRow) {
    return r.estimatedCostThb == null || r.costKnown === false ? '—' : this.money(r.estimatedCostThb);
  }

  isCodex(model: unknown) {
    return typeof model === 'string' && model.startsWith('codex:');
  }

  async load() {
    const q = '?range=' + encodeURIComponent(this.range);
    const [s, f, m, mem, d, u] = await Promise.all([
      this.api.get<Summary>('ai-usage/summary' + q),
      this.api.get<Rows<CostRow & Record<string, unknown>>>('ai-usage/by-feature' + q),
      this.api.get<Rows<CostRow & Record<string, unknown>>>('ai-usage/by-model' + q),
      this.api.get<{ note?: string; FREE?: MemberRow; PRO?: MemberRow }>('ai-usage/by-membership' + q),
      this.api.get<Rows<CostRow & Record<string, unknown>>>('ai-usage/by-day' + q),
      this.api.get<Rows<Record<string, unknown>>>('ai-usage/by-user' + q + '&limit=30'),
    ]);
    this.s.set(s);
    this.feature.set(f.rows ?? []);
    this.model.set(m.rows ?? []);
    this.membership.set(mem);
    const empty: MemberRow = { users: 0, requests: 0, totalTokens: 0, estimatedCostThb: null };
    this.memberRows.set([
      { label: 'FREE', ...(mem.FREE ?? empty) },
      { label: 'PRO', ...(mem.PRO ?? empty) },
    ]);
    this.daily.set(d.rows ?? []);
    this.users.set(u.rows ?? []);
  }
}

/* ------------------------------ settings --------------------------- */

type CodexStatus = {
  enabled: boolean;
  keyOk: boolean;
  keyError: string | null;
  signedIn: boolean;
  account: string | null;
  lastRefresh: string | null;
  model: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  pausedUntil: string | null;
};

@Component({
  selector: 'kc-admin-settings',
  imports: [FormsModule, ButtonModule, InputTextModule, TextareaModule, PasswordModule, MessageModule, TagModule],
  template: `
    <div class="page-head"><h1>ตั้งค่า</h1></div>

    <!-- Trial AI -->
    <section class="kc-card" id="trial-ai">
      <div class="kc-card-title"><i class="pi pi-sparkles"></i><h3>AI ของแพ็คเกจ Trial (ChatGPT sign-in)</h3></div>
      <p class="kc-muted kc-small">ผู้ใช้ Trial ใช้ AI <b>ทุกขั้น</b> ผ่าน Codex ด้วยบัญชี ChatGPT ของเรา ไม่ใช้ API key (ไม่มี fallback) · Free/Pro ใช้ API key + GPT-6 ขึ้นไป</p>
      @if (codex(); as c) {
        <div class="status">
          <p-tag [value]="codexLabel(c)" [severity]="codexSeverity(c)" [rounded]="true" />
          @if (c.signedIn) {
            <span class="kc-muted kc-small">บัญชี {{ c.account || '-' }} · โมเดล {{ c.model || 'ค่าเริ่มต้น' }} · ตอบสำเร็จล่าสุด {{ fmtDate(c.lastOkAt) }} · refresh token {{ fmtDate(c.lastRefresh) }}</span>
          }
        </div>
        @if (c.lastError) { <p-message severity="warn" [text]="'error ล่าสุด: ' + c.lastError" styleClass="mt" /> }
      }
      <div class="kc-form mt2">
        <div class="kc-field">
          <label>โมเดล (เว้นว่าง = ค่าเริ่มต้นของ Codex)</label>
          <input pInputText [(ngModel)]="codexModel" placeholder="เช่น gpt-6.1-sol" />
        </div>
      </div>
      <details class="connect">
        <summary>เชื่อม / เปลี่ยนบัญชี ChatGPT</summary>
        <ol class="kc-muted kc-small">
          <li>บนเครื่องตัวเอง: <code>npx -y &#64;openai/codex&#64;latest login</code> (เลือก Sign in with ChatGPT)</li>
          <li><code>cat ~/.codex/auth.json | pbcopy</code> แล้ววางในช่องด้านล่าง</li>
          <li>ระบบเข้ารหัส (AES-256-GCM) ก่อนเก็บ · ไม่แสดง token กลับมาอีก</li>
        </ol>
        <textarea pTextarea [(ngModel)]="authJson" rows="5" class="full mono" placeholder='{"tokens":{...}}' autocomplete="off" spellcheck="false"></textarea>
      </details>
      <div class="kc-actions">
        <p-button label="บันทึก" icon="pi pi-save" [loading]="busy() === 'save'" (onClick)="saveCodex()" />
        <p-button label="ทดสอบ" icon="pi pi-play" [outlined]="true" [loading]="busy() === 'test'" (onClick)="testCodex()" />
        <p-button label="ลบการเชื่อม" icon="pi pi-trash" severity="danger" [text]="true" (onClick)="removeCodex()" />
      </div>
      @if (codexMsg(); as m) { <p-message [severity]="m.ok ? 'success' : 'error'" [text]="m.text" styleClass="mt" /> }
    </section>

    <!-- admin notify -->
    <section class="kc-card">
      <div class="kc-card-title"><i class="pi pi-bell"></i><h3>แจ้งเตือนเมื่อมีคนขอคุยกับแอดมิน</h3></div>
      <p class="kc-muted kc-small">บอทส่งข้อความเข้า LINE ของแอดมินที่ผูกไว้ เฉพาะตอนผู้ใช้กดแท็บ "แอดมิน" (1 ข้อความ/ครั้ง)</p>
      @for (r of notify(); track r.id) {
        <div class="notify-row">
          <span><i class="pi pi-check-circle kc-ok"></i> {{ r.displayName || r.id }}</span>
          <p-button label="เอาออก" size="small" severity="danger" [text]="true" (onClick)="removeNotify(r)" />
        </div>
      } @empty {
        <p class="kc-muted">ยังไม่มีแอดมินที่ผูกไว้</p>
      }
      @if (pair(); as p) {
        <div class="pair">
          <span class="kc-muted kc-small">ส่งข้อความนี้ให้บอทจาก <b>LINE ของแอดมินเอง</b> (ใช้ได้ถึง {{ time(p.expiresAt) }} น.)</span>
          <div class="pair-code">{{ p.code }}</div>
          <div class="kc-row">
            <p-button label="คัดลอก" icon="pi pi-copy" [outlined]="true" (onClick)="copy(p.code)" />
            <p-button label="ส่งแล้ว รีเฟรช" icon="pi pi-refresh" [text]="true" (onClick)="loadNotify()" />
          </div>
        </div>
      }
      <div class="kc-actions"><p-button label="สร้างรหัสผูก LINE แอดมิน" icon="pi pi-link" (onClick)="createPair()" /></div>
    </section>

    <!-- rich menu -->
    <section class="kc-card">
      <div class="kc-card-title"><i class="pi pi-th-large"></i><h3>Rich menu (แท็บ โค้ช / แอดมิน)</h3></div>
      <p class="kc-muted kc-small">ติดตั้งเมนูแบบแท็บให้ผู้ใช้ทุกคน (แทนเมนูใน LINE OA Manager) · กดซ้ำได้ถ้าเปลี่ยนรูป</p>
      <div class="menus">
        <figure><img src="/admin/richmenu/coach.jpg" alt="แท็บโค้ช" /><figcaption>แท็บโค้ช</figcaption></figure>
        <figure><img src="/admin/richmenu/admin.jpg" alt="แท็บแอดมิน" /><figcaption>แท็บแอดมิน</figcaption></figure>
      </div>
      <div class="kc-actions"><p-button label="ติดตั้ง Rich menu" icon="pi pi-upload" [loading]="busy() === 'menu'" (onClick)="installMenu()" /></div>
    </section>

    <!-- password -->
    <section class="kc-card" id="password">
      <div class="kc-card-title"><i class="pi pi-key"></i><h3>เปลี่ยนรหัสผ่าน Admin</h3></div>
      <p class="kc-muted kc-small">อย่างน้อย 12 ตัวอักษร · เปลี่ยนแล้วเครื่องอื่นที่ล็อกอินอยู่จะถูกออกจากระบบ</p>
      <div class="kc-form">
        <div class="kc-field"><label>รหัสผ่านปัจจุบัน</label>
          <p-password [(ngModel)]="pw.current" [feedback]="false" [toggleMask]="true" autocomplete="current-password" styleClass="full" inputStyleClass="full" /></div>
        <div class="kc-field"><label>รหัสผ่านใหม่ (12+ ตัว)</label>
          <p-password [(ngModel)]="pw.next" [toggleMask]="true" autocomplete="new-password" styleClass="full" inputStyleClass="full"
                      promptLabel="ตั้งรหัสผ่าน" weakLabel="อ่อน" mediumLabel="พอใช้" strongLabel="แข็งแรง" /></div>
        <div class="kc-field"><label>ยืนยันรหัสผ่านใหม่</label>
          <p-password [(ngModel)]="pw.confirm" [feedback]="false" [toggleMask]="true" autocomplete="new-password" styleClass="full" inputStyleClass="full" /></div>
      </div>
      @if (pwMsg(); as m) { <p-message [severity]="m.ok ? 'success' : 'error'" [text]="m.text" styleClass="mt" /> }
      <div class="kc-actions"><p-button label="เปลี่ยนรหัสผ่าน" icon="pi pi-check" [loading]="busy() === 'pw'" (onClick)="changePassword()" /></div>
    </section>
  `,
  styles: `
    .page-head { margin-bottom: 1rem; }
    .status { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
    .connect { margin-top: .9rem; }
    .connect summary { cursor: pointer; color: var(--kc-green); font-weight: 500; }
    .connect ol { padding-left: 1.2rem; }
    .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; }
    .notify-row { display: flex; justify-content: space-between; align-items: center; padding: .3rem 0; border-bottom: 1px solid var(--kc-line); }
    .pair { margin-top: .9rem; background: var(--kc-green-soft); border-radius: 12px; padding: .9rem 1rem; }
    .pair-code { font-size: 1.6rem; font-weight: 700; letter-spacing: 2px; color: var(--kc-heading); margin: .3rem 0 .5rem; font-family: ui-monospace, Menlo, monospace; }
    .menus { display: grid; gap: .8rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
    .menus figure { margin: 0; } .menus img { width: 100%; border-radius: 10px; border: 1px solid var(--kc-line); display: block; }
    .menus figcaption { font-size: .8rem; color: var(--kc-muted); margin-top: .3rem; text-align: center; }
    .full { width: 100%; }
    .mt2 { margin-top: 1rem; }
    :host ::ng-deep .mt { margin-top: .75rem; }
    :host ::ng-deep .full { width: 100%; }
  `,
})
export class AdminSettingsPage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly busy = signal<string | null>(null);
  readonly codex = signal<CodexStatus | null>(null);
  readonly codexMsg = signal<{ ok: boolean; text: string } | null>(null);
  codexModel = '';
  authJson = '';
  readonly notify = signal<{ id: string; displayName: string | null }[]>([]);
  readonly pair = signal<{ code: string; expiresAt: string } | null>(null);
  pw = { current: '', next: '', confirm: '' };
  readonly pwMsg = signal<{ ok: boolean; text: string } | null>(null);
  readonly fmtDate = fmtDate;

  ngOnInit() {
    void this.loadCodex();
    void this.loadNotify();
  }

  private setCodex(c: CodexStatus) {
    this.codex.set(c);
    this.codexModel = c.model ?? '';
  }

  async loadCodex() {
    this.setCodex(await this.api.get<CodexStatus>('codex'));
  }

  codexLabel(c: CodexStatus) {
    if (!c.keyOk) return 'ยังไม่ได้ตั้ง CODEX_VAULT_KEY';
    if (!c.enabled) return 'ปิดอยู่ (CODEX_TRIAL_ENABLED=false)';
    if (!c.signedIn) return 'ยังไม่ได้เชื่อม — ผู้ใช้ Trial ใช้ AI ไม่ได้';
    if (c.pausedUntil) return `พักถึง ${fmtDate(c.pausedUntil)} (ล้มเหลวติดกัน)`;
    return 'ใช้งานอยู่';
  }

  codexSeverity(c: CodexStatus): 'success' | 'warn' | 'danger' | 'secondary' {
    if (!c.keyOk || (c.enabled && !c.signedIn)) return 'danger';
    if (!c.enabled) return 'secondary';
    return c.pausedUntil ? 'warn' : 'success';
  }

  async saveCodex() {
    this.busy.set('save');
    this.codexMsg.set(null);
    const auth = this.authJson.trim();
    try {
      this.setCodex(await this.api.post<CodexStatus>('codex', { authJson: auth, model: this.codexModel.trim() }));
      this.authJson = '';
      this.codexMsg.set({ ok: true, text: auth ? 'เชื่อมบัญชี ChatGPT แล้ว — กด "ทดสอบ" เพื่อลองยิงจริง' : 'บันทึกโมเดลแล้ว' });
    } catch (e) {
      this.codexMsg.set({ ok: false, text: errorMessage(e) });
    } finally {
      this.busy.set(null);
    }
  }

  async testCodex() {
    this.busy.set('test');
    this.codexMsg.set(null);
    try {
      const r = await this.api.post<{ ok: boolean; ms: number; answer?: string; error?: string }>('codex/test');
      const sec = (r.ms / 1000).toFixed(1);
      this.codexMsg.set(r.ok ? { ok: true, text: `ตอบใน ${sec} วิ: ${r.answer}` } : { ok: false, text: `${r.error} (${sec} วิ)` });
      await this.loadCodex();
    } catch (e) {
      this.codexMsg.set({ ok: false, text: errorMessage(e) });
    } finally {
      this.busy.set(null);
    }
  }

  removeCodex() {
    this.confirm.confirm({
      header: 'ลบการเชื่อม ChatGPT?',
      message: 'ผู้ใช้ Trial จะใช้ AI ไม่ได้จนกว่าจะเชื่อมใหม่',
      acceptLabel: 'ลบ',
      rejectLabel: 'ยกเลิก',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: async () => {
        this.setCodex(await this.api.post<CodexStatus>('codex/remove'));
        this.codexMsg.set({ ok: true, text: 'ลบแล้ว' });
      },
    });
  }

  async loadNotify() {
    this.notify.set(await this.api.get<{ id: string; displayName: string | null }[]>('admin-notify'));
  }

  async createPair() {
    try {
      this.pair.set(await this.api.post<{ code: string; expiresAt: string }>('admin-notify/pair-code'));
    } catch (e) {
      this.toast.add({ severity: 'error', summary: errorMessage(e) });
    }
  }

  removeNotify(r: { id: string; displayName: string | null }) {
    this.confirm.confirm({
      header: 'เลิกส่งแจ้งเตือน?',
      message: `เลิกส่งแจ้งเตือนให้ ${r.displayName || r.id}`,
      acceptLabel: 'เอาออก',
      rejectLabel: 'ยกเลิก',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: async () => {
        await this.api.post('admin-notify/' + encodeURIComponent(r.id) + '/remove');
        await this.loadNotify();
      },
    });
  }

  time(iso: string) {
    return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  async copy(text: string) {
    await navigator.clipboard.writeText(text);
    this.toast.add({ severity: 'success', summary: 'คัดลอกแล้ว', life: 1500 });
  }

  installMenu() {
    this.confirm.confirm({
      header: 'ติดตั้ง Rich menu?',
      message: 'ติดตั้งเมนูแบบแท็บให้ผู้ใช้ทุกคน',
      acceptLabel: 'ติดตั้ง',
      rejectLabel: 'ยกเลิก',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: async () => {
        this.busy.set('menu');
        try {
          await this.api.post('rich-menu/setup');
          this.toast.add({ severity: 'success', summary: 'ติดตั้งแล้ว', detail: 'ปิดแล้วเปิดแชท LINE ใหม่เพื่อดูเมนู', life: 4000 });
        } catch (e) {
          this.toast.add({ severity: 'error', summary: errorMessage(e) });
        } finally {
          this.busy.set(null);
        }
      },
    });
  }

  async changePassword() {
    this.pwMsg.set(null);
    if (this.pw.next.length < 12) {
      this.pwMsg.set({ ok: false, text: 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 12 ตัว' });
      return;
    }
    if (this.pw.next !== this.pw.confirm) {
      this.pwMsg.set({ ok: false, text: 'ยืนยันรหัสผ่านไม่ตรงกัน' });
      return;
    }
    this.busy.set('pw');
    try {
      await this.api.post('password', { currentPassword: this.pw.current, newPassword: this.pw.next });
      this.pw = { current: '', next: '', confirm: '' };
      this.pwMsg.set({ ok: true, text: 'เปลี่ยนรหัสผ่านแล้ว — ครั้งหน้าล็อกอินด้วยรหัสใหม่' });
    } catch (e) {
      this.pwMsg.set({ ok: false, text: errorMessage(e) });
    } finally {
      this.busy.set(null);
    }
  }
}
