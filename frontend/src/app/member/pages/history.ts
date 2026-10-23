import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { MessageModule } from 'primeng/message';
import { MessageService } from 'primeng/api';
import { Api, errorMessage } from '../../core/api';
import { MemberSession } from '../../core/member';
import { fmtNum } from '../../core/format';

type Food = { name: string; calories: number; mealType: string };
type Day = {
  date: string;
  calories: number;
  proteinG: number;
  waterMl: number | null;
  sleepMinutes: number | null;
  exerciseMinutes: number | null;
  exerciseKcal: number | null;
  weightKg: number | null;
  foods: Food[];
};
type Progress = {
  direction: 'lose' | 'gain' | 'maintain';
  percent: number;
  achievedKg: number;
  remainingKg: number;
  startKg: number;
  currentKg: number;
  targetKg: number;
};
type History = {
  hasProfile: boolean;
  progress: Progress | null;
  targets: { dailyCalories: number; dailyProteinG: number } | null;
  days: Day[];
};

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MEAL_TH: Record<string, string> = { BREAKFAST: 'เช้า', LUNCH: 'กลางวัน', DINNER: 'เย็น', SNACK: 'ว่าง' };

@Component({
  selector: 'kc-history',
  imports: [FormsModule, RouterLink, ButtonModule, InputNumberModule, ProgressBarModule, SkeletonModule, MessageModule],
  template: `
    <h1>ประวัติ 7 วัน</h1>
    @if (loading()) {
      <div class="kc-stack">
        <p-skeleton height="190px" borderRadius="16px" />
        @for (i of [1, 2, 3]; track i) { <p-skeleton height="110px" borderRadius="16px" /> }
      </div>
    } @else if (error()) {
      <p-message severity="error" [text]="error()!" />
    } @else if (h(); as h) {
      @if (!h.hasProfile) {
        <div class="kc-card kc-center">
          <h3>ยังไม่มีเป้าหมาย</h3>
          <p class="kc-muted">พิมพ์ <b>เริ่ม</b> ในแชท LINE เพื่อตั้งค่าโปรไฟล์ แล้วกลับมาดูประวัติได้เลย</p>
        </div>
      } @else {
        <div class="kc-stack">
          @if (h.progress; as p) {
            <section class="kc-card">
              <div class="kc-card-title"><i class="pi pi-flag"></i><h3>ความสำเร็จตามเป้าหมาย</h3></div>
              <div class="prog">
                <div class="pct">{{ p.percent }}%</div>
                <div class="kc-muted">
                  {{ dirText(p) }} <b class="ink">{{ fmtNum(p.direction === 'maintain' ? p.remainingKg : p.achievedKg, 1) }} kg</b>
                  @if (p.direction !== 'maintain' && p.remainingKg > 0) {
                    <br />อีก {{ fmtNum(p.remainingKg, 1) }} kg ถึงเป้า
                  } @else if (p.percent >= 100) {
                    <br />ถึงเป้าแล้ว 🎉
                  }
                </div>
              </div>
              <p-progressbar [value]="p.percent" [showValue]="false" />
              <div class="weights">
                <div><span>เริ่มต้น</span><b>{{ fmtNum(p.startKg, 1) }} kg</b></div>
                <div class="c"><span>ปัจจุบัน</span><b>{{ fmtNum(p.currentKg, 1) }} kg</b></div>
                <div class="r"><span>เป้าหมาย</span><b>{{ fmtNum(p.targetKg, 1) }} kg</b></div>
              </div>
              <div class="kc-row" style="margin-top:1rem">
                <p-inputnumber class="grow" [(ngModel)]="weight" mode="decimal" [minFractionDigits]="0" [maxFractionDigits]="1"
                               [min]="20" [max]="300" suffix=" kg" placeholder="น้ำหนักวันนี้" inputStyleClass="full" />
                <p-button label="บันทึก" icon="pi pi-check" [loading]="saving()" [disabled]="!weight" (onClick)="saveWeight()" />
              </div>
            </section>
          }

          @for (d of h.days; track d.date; let i = $index) {
            <section class="kc-card day" [class.empty]="!d.foods.length">
              <div class="day-head">
                <h3>{{ dayLabel(d.date, i) }}</h3>
                <span class="kc-muted"><i class="pi pi-bolt kcal-ic"></i>
                  <b class="ink">{{ fmtNum(d.calories) }}</b>@if (h.targets) { / {{ fmtNum(h.targets.dailyCalories) }} } kcal</span>
              </div>
              @if (h.targets && d.calories) {
                <div class="bar" [class.over]="calPct(d, h) > 110" [class.under]="calPct(d, h) < 90">
                  <span [style.width.%]="min(100, calPct(d, h))"></span>
                </div>
              }
              <div class="chips">
                <span class="chip">🥩 โปรตีน {{ fmtNum(d.proteinG) }}@if (h.targets) {/{{ fmtNum(h.targets.dailyProteinG) }}} g</span>
                @if (d.waterMl) { <span class="chip">💧 {{ fmtNum(d.waterMl / 1000, 1) }} L</span> }
                @if (d.sleepMinutes != null) { <span class="chip">😴 {{ sleep(d.sleepMinutes) }}</span> }
                @if (d.exerciseMinutes) { <span class="chip">🏃 {{ d.exerciseMinutes }} นาที@if (d.exerciseKcal) { · {{ d.exerciseKcal }} kcal }</span> }
                @if (d.weightKg != null) { <span class="chip">⚖️ {{ fmtNum(d.weightKg, 1) }} kg</span> }
              </div>
              @if (d.foods.length) {
                <button type="button" class="toggle" (click)="toggle(d.date)">
                  <i class="pi" [class.pi-chevron-down]="!open().has(d.date)" [class.pi-chevron-up]="open().has(d.date)"></i>
                  ดูอาหาร {{ d.foods.length }} รายการ
                </button>
                @if (open().has(d.date)) {
                  <div class="foods">
                    @for (f of d.foods; track $index) {
                      <div class="food">
                        <span>@if (meal(f.mealType)) { <span class="kc-muted">{{ meal(f.mealType) }} · </span> }{{ f.name }}</span>
                        <span class="kc-muted">{{ fmtNum(f.calories) }} kcal</span>
                      </div>
                    }
                  </div>
                }
              } @else {
                <p class="kc-muted kc-small" style="margin:.5rem 0 0">ยังไม่ได้บันทึกอาหาร</p>
              }
            </section>
          }
          <p-button label="ไปหน้าโปรไฟล์" icon="pi pi-user" severity="secondary" [outlined]="true" styleClass="full" routerLink="/profile" />
        </div>
      }
    }
  `,
  styles: `
    .prog { display: flex; align-items: center; gap: 1rem; margin-bottom: .8rem; }
    .pct { font-size: 2.6rem; font-weight: 700; color: var(--kc-green); line-height: 1; }
    .ink { color: var(--kc-ink); }
    .weights { display: flex; justify-content: space-between; margin-top: .7rem; font-size: .85rem; color: var(--kc-muted); }
    .weights b { display: block; color: var(--kc-ink); font-size: 1.05rem; }
    .weights .c { text-align: center; } .weights .r { text-align: right; }
    .day.empty { opacity: .6; }
    .day-head { display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }
    .day-head h3 { margin: 0; }
    .kcal-ic { color: var(--kc-warn); font-size: .8rem; }
    .bar { height: 6px; background: #eef1ee; border-radius: 99px; overflow: hidden; margin-top: .55rem; }
    .bar span { display: block; height: 100%; background: var(--kc-green); border-radius: 99px; }
    .bar.under span { background: #d69e2e; } .bar.over span { background: var(--kc-danger); }
    .chips { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .65rem; }
    .chip { font-size: .8rem; padding: .2rem .6rem; border-radius: 99px; background: var(--kc-green-soft); color: var(--kc-heading); }
    .toggle { margin-top: .6rem; background: none; border: 0; padding: 0; color: var(--kc-green); font: inherit; font-size: .88rem; cursor: pointer; display: inline-flex; gap: .35rem; align-items: center; }
    .foods { margin-top: .35rem; }
    .food { display: flex; justify-content: space-between; gap: .5rem; padding: .45rem 0; border-bottom: 1px solid var(--kc-line); font-size: .9rem; }
    .food:last-child { border-bottom: 0; }
    :host ::ng-deep .full { width: 100%; }
  `,
})
export class HistoryPage implements OnInit {
  private readonly api = inject(Api);
  private readonly session = inject(MemberSession);
  private readonly toast = inject(MessageService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly h = signal<History | null>(null);
  readonly open = signal(new Set<string>());
  readonly saving = signal(false);
  weight: number | null = null;
  readonly fmtNum = fmtNum;
  readonly min = Math.min;

  async ngOnInit() {
    try {
      const m = await this.session.ensure();
      if (!m) return;
      await this.reload();
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  private async reload() {
    this.h.set(await this.api.get<History>('/api/membership/history'));
  }

  dirText(p: Progress) {
    return p.direction === 'lose' ? 'ลดไปแล้ว' : p.direction === 'gain' ? 'เพิ่มไปแล้ว' : 'ห่างจากเป้า';
  }

  dayLabel(key: string, idx: number) {
    const [y, m, d] = key.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    const base = `${TH_DAYS[dt.getUTCDay()]} ${d} ${TH_MONTHS[m - 1]}`;
    return idx === 0 ? `วันนี้ · ${base}` : idx === 1 ? `เมื่อวาน · ${base}` : base;
  }

  calPct(d: Day, h: History) {
    const t = h.targets?.dailyCalories ?? 0;
    return t ? Math.round((d.calories / t) * 100) : 0;
  }

  sleep(min: number) {
    return `${Math.floor(min / 60)} ชม. ${min % 60} นาที`;
  }

  meal(t: string) {
    return MEAL_TH[t] ?? '';
  }

  toggle(date: string) {
    const s = new Set(this.open());
    if (s.has(date)) s.delete(date);
    else s.add(date);
    this.open.set(s);
  }

  async saveWeight() {
    if (!this.weight) return;
    this.saving.set(true);
    try {
      await this.api.post('/api/membership/weight', { weightKg: this.weight });
      this.toast.add({ severity: 'success', summary: `บันทึก ${fmtNum(this.weight, 1)} kg แล้ว`, life: 2500 });
      this.weight = null;
      await this.reload();
    } catch (e) {
      if (this.session.redirectIfUnauthorized(e)) return;
      this.toast.add({ severity: 'error', summary: errorMessage(e), life: 4000 });
    } finally {
      this.saving.set(false);
    }
  }
}
