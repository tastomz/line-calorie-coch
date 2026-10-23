import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { ConfirmationService, MessageService } from 'primeng/api';
import { errorMessage } from '../../core/api';
import { baht } from '../../core/format';
import { AdminApi } from '../admin-api';

/* ------------------------------ promos ----------------------------- */

type Promo = {
  id: string;
  code: string;
  trialDays: number;
  redeemedCount: number;
  maxRedemptions: number | null;
  active: boolean;
};

const PREFIX = /^[A-Z0-9]{2,12}$/;

@Component({
  selector: 'kc-admin-promos',
  imports: [FormsModule, ButtonModule, InputTextModule, InputNumberModule, TableModule, TagModule, MessageModule],
  template: `
    <div class="page-head"><h1>โค้ดโปรโม (Free PRO)</h1></div>

    <section class="kc-card">
      <div class="kc-card-title"><i class="pi pi-plus-circle"></i><h3>สร้างโค้ดใหม่</h3></div>
      <form (ngSubmit)="generate()">
        <div class="kc-form">
          <div class="kc-field">
            <label for="prefix">คำนำหน้า (A–Z, 0–9 · 2–12 ตัว)</label>
            <input pInputText id="prefix" name="prefix" [(ngModel)]="prefix" maxlength="12" autocomplete="off" spellcheck="false" class="upper" />
          </div>
          <div class="kc-field">
            <label for="days">Pro ฟรีกี่วัน</label>
            <p-inputnumber inputId="days" name="days" [(ngModel)]="days" [min]="1" [max]="365" [showButtons]="true" suffix=" วัน" />
          </div>
          <div class="kc-field">
            <label for="max">ใช้ได้กี่คน</label>
            <p-inputnumber inputId="max" name="max" [(ngModel)]="max" [min]="1" [max]="1000" [showButtons]="true" suffix=" คน" />
          </div>
        </div>
        <p class="kc-muted kc-small preview">ตัวอย่าง: <b>{{ previewPrefix() }}-XXXXXX</b> · ส่วน XXXXXX สุ่มจาก server</p>
        @if (formError()) { <p-message severity="error" [text]="formError()!" /> }
        <div class="kc-actions"><p-button type="submit" label="สร้างโค้ด" icon="pi pi-bolt" [loading]="busy()" /></div>
      </form>
      @if (created(); as c) {
        <div class="created">
          <div>
            <span class="kc-muted kc-small">โค้ดใหม่</span>
            <div class="code">{{ c.code }}</div>
            <span class="kc-muted kc-small">Pro {{ c.trialDays }} วัน · ใช้ได้ {{ c.maxRedemptions }} คน</span>
          </div>
          <p-button icon="pi pi-copy" label="คัดลอก" [outlined]="true" (onClick)="copy(c.code)" />
        </div>
      }
    </section>

    <section class="kc-card">
      <div class="kc-card-title"><i class="pi pi-list"></i><h3>โค้ดทั้งหมด</h3></div>
      <p-table [value]="promos()" [rows]="15" [paginator]="promos().length > 15" [tableStyle]="{ 'min-width': '520px' }" sortField="active" [sortOrder]="-1">
        <ng-template #header>
          <tr><th>โค้ด</th><th>วัน</th><th>ใช้แล้ว</th><th>สถานะ</th><th></th></tr>
        </ng-template>
        <ng-template #body let-p>
          <tr>
            <td><b class="mono">{{ p.code }}</b></td>
            <td>{{ p.trialDays }}</td>
            <td>{{ p.redeemedCount }}@if (p.maxRedemptions != null) {/{{ p.maxRedemptions }}}</td>
            <td><p-tag [value]="p.active ? 'เปิดใช้' : 'ปิดแล้ว'" [severity]="p.active ? 'success' : 'secondary'" /></td>
            <td style="text-align:right">
              @if (p.active) { <p-button label="ปิดโค้ด" size="small" severity="danger" [text]="true" (onClick)="deactivate(p)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="5" class="kc-muted">ยังไม่มีโค้ด</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: `
    .page-head { margin-bottom: 1rem; }
    .upper { text-transform: uppercase; }
    .preview { margin: .75rem 0 0; }
    .created { margin-top: 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;
               background: var(--kc-green-soft); border-radius: 12px; padding: .9rem 1rem; }
    .code { font-size: 1.5rem; font-weight: 700; letter-spacing: 1px; color: var(--kc-heading); font-family: ui-monospace, Menlo, monospace; }
    .mono { font-family: ui-monospace, Menlo, monospace; }
  `,
})
export class AdminPromosPage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  prefix = 'TASTOM';
  days = 30;
  max = 1;
  readonly promos = signal<Promo[]>([]);
  readonly busy = signal(false);
  readonly formError = signal<string | null>(null);
  readonly created = signal<{ code: string; trialDays: number; maxRedemptions: number } | null>(null);

  ngOnInit() {
    void this.load();
  }

  previewPrefix() {
    return this.prefix.trim().toUpperCase() || 'TASTOM';
  }

  async load() {
    this.promos.set(await this.api.get<Promo[]>('promos'));
  }

  async generate() {
    this.formError.set(null);
    const prefix = this.previewPrefix();
    if (!PREFIX.test(prefix)) {
      this.formError.set('คำนำหน้าต้องเป็น A–Z หรือ 0–9 ยาว 2–12 ตัว (ห้ามมีขีดหรือเว้นวรรค)');
      return;
    }
    this.busy.set(true);
    try {
      this.created.set(
        await this.api.post('promos/generate', { prefix, trialDays: this.days, maxRedemptions: this.max }),
      );
      await this.load();
    } catch (e) {
      this.formError.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async copy(code: string) {
    await navigator.clipboard.writeText(code);
    this.toast.add({ severity: 'success', summary: 'คัดลอกแล้ว', detail: code, life: 2000 });
  }

  deactivate(p: Promo) {
    this.confirm.confirm({
      header: 'ปิดโค้ดนี้?',
      message: `${p.code} จะใช้ไม่ได้อีก (คนที่ใช้ไปแล้วยังได้สิทธิ์ครบ)`,
      acceptLabel: 'ปิดโค้ด',
      rejectLabel: 'ยกเลิก',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: async () => {
        await this.api.patch('promos/' + encodeURIComponent(p.id), { active: false });
        await this.load();
      },
    });
  }
}

/* ------------------------------- plans ----------------------------- */

type DiscountType = 'NONE' | 'PERCENT' | 'AMOUNT';
type AdminPlan = {
  id: string;
  code: string;
  labelTh: string;
  days: number;
  priceThb: number;
  discountType: DiscountType;
  discountValue: number;
  discountLabel: string | null;
  discountStartsAt: string | null;
  discountEndsAt: string | null;
  active: boolean;
  sortOrder: number;
  priced: { finalPriceThb: number; discountActive: boolean; perMonthThb: number; priceThb: number; discountLabel: string | null };
};
type PlanForm = {
  labelTh: string;
  days: number | null;
  priceThb: number | null;
  sortOrder: number | null;
  active: boolean;
  discountType: DiscountType;
  discountValue: number | null;
  discountLabel: string;
  discountStartsAt: Date | null;
  discountEndsAt: Date | null;
};

@Component({
  selector: 'kc-admin-plans',
  imports: [FormsModule, ButtonModule, InputTextModule, InputNumberModule, SelectModule, DatePickerModule, ToggleSwitchModule, TagModule, MessageModule, SkeletonModule],
  template: `
    <div class="page-head">
      <h1>แพ็กเกจ & ราคา Pro</h1>
      <p class="kc-muted">ลูกค้าจ่ายครั้งเดียวผ่าน QR พร้อมเพย์ ได้ Pro ตามจำนวนวัน · ราคาต่ำสุด ฿10 · แก้แล้วมีผลกับการกดจ่ายครั้งถัดไปทันที</p>
    </div>

    @if (loading()) {
      @for (i of [1, 2]; track i) { <p-skeleton height="220px" borderRadius="16px" styleClass="sk" /> }
    }

    @for (p of plans(); track p.id) {
      <section class="kc-card plan" [class.off]="!p.active">
        <div class="plan-head">
          <div>
            <h3>{{ p.labelTh }} <span class="kc-muted kc-small">({{ p.code }})</span></h3>
            <div class="price">
              @if (p.priced.discountActive) { <s>{{ baht(p.priced.priceThb) }}</s> }
              <b>{{ baht(p.priced.finalPriceThb) }}</b>
              <span class="kc-muted kc-small">· {{ p.days }} วัน · ≈{{ baht(p.priced.perMonthThb) }}/เดือน</span>
            </div>
          </div>
          <div class="tags">
            @if (p.priced.discountActive) { <p-tag [value]="p.priced.discountLabel || 'ส่วนลด'" severity="warn" /> }
            <p-tag [value]="p.active ? 'เปิดขาย' : 'ปิดขาย'" [severity]="p.active ? 'success' : 'secondary'" />
          </div>
        </div>

        @if (forms()[p.id]; as f) {
          <div class="kc-form">
            <div class="kc-field"><label>ชื่อที่แสดง</label><input pInputText [(ngModel)]="f.labelTh" maxlength="40" /></div>
            <div class="kc-field"><label>จำนวนวัน</label><p-inputnumber [(ngModel)]="f.days" [min]="1" [max]="3650" /></div>
            <div class="kc-field"><label>ราคาเต็ม (บาท)</label><p-inputnumber [(ngModel)]="f.priceThb" [min]="10" prefix="฿" /></div>
            <div class="kc-field"><label>ลำดับ (น้อยขึ้นก่อน)</label><p-inputnumber [(ngModel)]="f.sortOrder" /></div>
            <div class="kc-field"><label>เปิดขาย</label><p-toggleswitch [(ngModel)]="f.active" /></div>
          </div>
          <div class="discount">
            <div class="kc-form">
              <div class="kc-field"><label>ส่วนลด</label>
                <p-select [options]="discountTypes" [(ngModel)]="f.discountType" optionLabel="label" optionValue="value" appendTo="body" />
              </div>
              @if (f.discountType !== 'NONE') {
                <div class="kc-field"><label>มูลค่า{{ f.discountType === 'PERCENT' ? ' (%)' : ' (บาท)' }}</label>
                  <p-inputnumber [(ngModel)]="f.discountValue" [min]="1" [max]="f.discountType === 'PERCENT' ? 90 : 100000" />
                </div>
                <div class="kc-field"><label>ป้ายโปร</label><input pInputText [(ngModel)]="f.discountLabel" maxlength="40" placeholder="เช่น โปรเปิดตัว" /></div>
                <div class="kc-field"><label>เริ่ม (ว่าง = ทันที)</label>
                  <p-datepicker [(ngModel)]="f.discountStartsAt" [showTime]="true" hourFormat="24" [showClear]="true" dateFormat="dd/mm/yy" appendTo="body" />
                </div>
                <div class="kc-field"><label>สิ้นสุด (ว่าง = ไม่หมด)</label>
                  <p-datepicker [(ngModel)]="f.discountEndsAt" [showTime]="true" hourFormat="24" [showClear]="true" dateFormat="dd/mm/yy" appendTo="body" />
                </div>
              }
            </div>
          </div>
          @if (errors()[p.id]) { <p-message severity="error" [text]="errors()[p.id]!" styleClass="mt" /> }
          <div class="kc-actions">
            <p-button label="บันทึก" icon="pi pi-save" [loading]="saving() === p.id" (onClick)="save(p)" />
          </div>
        }
      </section>
    }

    <section class="kc-card">
      <div class="kc-card-title"><i class="pi pi-plus-circle"></i><h3>เพิ่มแพ็กเกจ</h3></div>
      <div class="kc-form">
        <div class="kc-field"><label>รหัส (a–z, 0–9, -)</label><input pInputText [(ngModel)]="newPlan.code" maxlength="20" placeholder="เช่น 2m" /></div>
        <div class="kc-field"><label>ชื่อที่แสดง</label><input pInputText [(ngModel)]="newPlan.labelTh" maxlength="40" placeholder="เช่น 2 เดือน" /></div>
        <div class="kc-field"><label>จำนวนวัน</label><p-inputnumber [(ngModel)]="newPlan.days" [min]="1" [max]="3650" /></div>
        <div class="kc-field"><label>ราคา (บาท)</label><p-inputnumber [(ngModel)]="newPlan.priceThb" [min]="10" prefix="฿" /></div>
        <div class="kc-field"><label>ลำดับ</label><p-inputnumber [(ngModel)]="newPlan.sortOrder" /></div>
      </div>
      @if (createError()) { <p-message severity="error" [text]="createError()!" styleClass="mt" /> }
      <div class="kc-actions"><p-button label="เพิ่มแพ็กเกจ" icon="pi pi-plus" [loading]="creating()" (onClick)="create()" /></div>
    </section>
  `,
  styles: `
    .page-head { margin-bottom: 1rem; }
    .plan.off { opacity: .75; }
    .plan-head { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .plan-head h3 { margin: 0; }
    .price b { font-size: 1.35rem; color: var(--kc-heading); }
    .price s { color: var(--kc-muted); margin-right: .35rem; }
    .tags { display: flex; gap: .4rem; align-items: flex-start; }
    .discount { margin-top: 1rem; padding-top: 1rem; border-top: 1px dashed var(--kc-line); }
    :host ::ng-deep .mt { margin-top: .75rem; }
    :host ::ng-deep .sk { margin-bottom: .9rem; }
  `,
})
export class AdminPlansPage implements OnInit {
  private readonly api = inject(AdminApi);
  private readonly toast = inject(MessageService);
  readonly loading = signal(true);
  readonly plans = signal<AdminPlan[]>([]);
  readonly forms = signal<Record<string, PlanForm>>({});
  readonly errors = signal<Record<string, string | null>>({});
  readonly saving = signal<string | null>(null);
  readonly creating = signal(false);
  readonly createError = signal<string | null>(null);
  readonly baht = baht;
  readonly discountTypes = [
    { label: 'ไม่มี', value: 'NONE' },
    { label: 'ลดเป็น %', value: 'PERCENT' },
    { label: 'ลดเป็นบาท', value: 'AMOUNT' },
  ];
  newPlan: { code: string; labelTh: string; days: number | null; priceThb: number | null; sortOrder: number | null } = {
    code: '',
    labelTh: '',
    days: null,
    priceThb: null,
    sortOrder: 50,
  };

  ngOnInit() {
    void this.load();
  }

  async load() {
    try {
      const plans = await this.api.get<AdminPlan[]>('plans');
      this.plans.set(plans);
      const forms: Record<string, PlanForm> = {};
      for (const p of plans) {
        forms[p.id] = {
          labelTh: p.labelTh,
          days: p.days,
          priceThb: p.priceThb,
          sortOrder: p.sortOrder,
          active: p.active,
          discountType: p.discountType,
          discountValue: p.discountType === 'NONE' ? null : p.discountValue,
          discountLabel: p.discountLabel ?? '',
          discountStartsAt: p.discountStartsAt ? new Date(p.discountStartsAt) : null,
          discountEndsAt: p.discountEndsAt ? new Date(p.discountEndsAt) : null,
        };
      }
      this.forms.set(forms);
    } finally {
      this.loading.set(false);
    }
  }

  async save(p: AdminPlan) {
    const f = this.forms()[p.id];
    const body: Record<string, unknown> = {
      labelTh: f.labelTh.trim(),
      days: f.days,
      priceThb: f.priceThb,
      sortOrder: f.sortOrder ?? 0,
      active: f.active,
      discountType: f.discountType,
    };
    if (f.discountType !== 'NONE') {
      body['discountValue'] = f.discountValue;
      body['discountLabel'] = f.discountLabel.trim() || null;
      body['discountStartsAt'] = f.discountStartsAt ? f.discountStartsAt.toISOString() : null;
      body['discountEndsAt'] = f.discountEndsAt ? f.discountEndsAt.toISOString() : null;
    }
    this.saving.set(p.id);
    this.errors.update((e) => ({ ...e, [p.id]: null }));
    try {
      await this.api.patch('plans/' + encodeURIComponent(p.id), body);
      this.toast.add({ severity: 'success', summary: `บันทึก ${f.labelTh} แล้ว`, life: 2000 });
      await this.load();
    } catch (e) {
      this.errors.update((x) => ({ ...x, [p.id]: errorMessage(e) }));
    } finally {
      this.saving.set(null);
    }
  }

  async create() {
    this.creating.set(true);
    this.createError.set(null);
    try {
      await this.api.post('plans', {
        code: this.newPlan.code.trim().toLowerCase(),
        labelTh: this.newPlan.labelTh.trim(),
        days: this.newPlan.days,
        priceThb: this.newPlan.priceThb,
        sortOrder: this.newPlan.sortOrder ?? 0,
      });
      this.newPlan = { code: '', labelTh: '', days: null, priceThb: null, sortOrder: 50 };
      this.toast.add({ severity: 'success', summary: 'เพิ่มแพ็กเกจแล้ว', life: 2000 });
      await this.load();
    } catch (e) {
      this.createError.set(errorMessage(e));
    } finally {
      this.creating.set(false);
    }
  }
}
