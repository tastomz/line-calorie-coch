import { FoodLog } from '@prisma/client';
import {
  FlexBubble,
  FlexComponent,
  FlexMessagePayload,
  FlexTheme,
  flexMessage,
  hbox,
  postbackAction,
  sectionLabel,
  sep,
  t,
  truncate,
  vbox,
} from '../line/line-flex';
import {
  DailyCoachSummary,
  DayTotalsRow,
  MacroTotals,
} from './daily-summary.service';
import {
  describeDayTh,
  formatThaiShortDate,
  formatZonedTime,
} from './day-bounds';
import { foodDayCommandText } from './food-day';
import { formatNumber } from './food.messages';

export const LOG_YESTERDAY_HINT =
  'บันทึกย้อนหลัง: พิมพ์ เช่น "เมื่อวาน ข้าวมันไก่"';
export const RANGE_HINT = 'ดูหลายวัน: พิมพ์ "ย้อนหลัง"';

function dayHeading(day: Date, daysAgo: number): string {
  const label = describeDayTh(day);
  return daysAgo === 1
    ? `📅 ${label} (${formatThaiShortDate(day)})`
    : `📅 ${label}`;
}

function macroLine(
  icon: string,
  name: string,
  consumed: number,
  target: number,
  unit: string,
): string {
  return `${icon} ${name} ${formatNumber(consumed)} / ${formatNumber(target)} ${unit}`;
}

/** Read-only detail of one past day — numbers come straight from FoodLog rows. */
export function buildPastDayMessage(params: {
  day: Date;
  daysAgo: number;
  logs: Array<Pick<FoodLog, 'eatenAt' | 'foodName' | 'calories'>>;
  summary: DailyCoachSummary | null;
}): string {
  const { day, daysAgo, logs, summary } = params;
  const heading = dayHeading(day, daysAgo);
  const hints = [daysAgo === 1 ? LOG_YESTERDAY_HINT : null, RANGE_HINT]
    .filter(Boolean)
    .join('\n');

  if (logs.length === 0) {
    return `${heading}\n\nยังไม่มีรายการอาหารในวันนั้นครับ\n\n${hints}`;
  }

  const lines = logs.map(
    (log) =>
      `${formatZonedTime(log.eatenAt)}  ${log.foodName}   ${formatNumber(log.calories)} kcal`,
  );
  const total = logs.reduce((sum, log) => sum + log.calories, 0);

  const totals = summary
    ? [
        macroLine(
          '🔥',
          'พลังงาน',
          summary.consumed.calories,
          summary.target.calories,
          'kcal',
        ),
        macroLine(
          '🥩',
          'โปรตีน',
          summary.consumed.proteinG,
          summary.target.proteinG,
          'g',
        ),
        macroLine(
          '🍚',
          'คาร์บ',
          summary.consumed.carbsG,
          summary.target.carbsG,
          'g',
        ),
        macroLine(
          '🥑',
          'ไขมัน',
          summary.consumed.fatG,
          summary.target.fatG,
          'g',
        ),
      ].join('\n')
    : `รวม ${formatNumber(total)} kcal`;

  return `${heading}

🍽️ มื้อที่บันทึก (${logs.length} มื้อ)
${lines.join('\n')}

${totals}

${hints}`;
}

function rowLabel(row: DayTotalsRow): string {
  return describeDayTh(row.date);
}

function percentOfTarget(
  row: DayTotalsRow,
  target: MacroTotals | null,
): string {
  if (!target || target.calories <= 0 || row.mealCount === 0) {
    return '';
  }
  return `${Math.round((row.consumed.calories / target.calories) * 100)}%`;
}

function rowKcalText(row: DayTotalsRow, target: MacroTotals | null): string {
  if (row.mealCount === 0) {
    return 'ไม่มีบันทึก';
  }
  return target
    ? `${formatNumber(row.consumed.calories)} / ${formatNumber(target.calories)} kcal`
    : `${formatNumber(row.consumed.calories)} kcal`;
}

export function buildDayRangeText(
  days: DayTotalsRow[],
  target: MacroTotals | null,
): string {
  const lines = days.map((row) => {
    const pct = percentOfTarget(row, target);
    return `${rowLabel(row)}  ${rowKcalText(row, target)}${pct ? `  (${pct})` : ''}`;
  });
  return `📅 ย้อนหลัง ${days.length} วัน

${lines.join('\n')}

ดูรายละเอียด: พิมพ์ "เมื่อวาน" หรือ "2 วันก่อน"
${LOG_YESTERDAY_HINT}`;
}

function dayRow(row: DayTotalsRow, target: MacroTotals | null): FlexComponent {
  const pct = percentOfTarget(row, target);
  const empty = row.mealCount === 0;
  return hbox(
    [
      vbox(
        [
          t(rowLabel(row), {
            size: 'sm',
            weight: 'bold',
            color: FlexTheme.text,
          }),
          t(empty ? 'ยังไม่มีมื้อ' : `${row.mealCount} มื้อ`, {
            size: 'xxs',
            color: FlexTheme.textMuted,
          }),
        ],
        { flex: 3 },
      ),
      vbox(
        [
          t(rowKcalText(row, target), {
            size: 'sm',
            color: empty ? FlexTheme.textMuted : FlexTheme.kcal,
            align: 'end',
          }),
          t(pct || ' ', {
            size: 'xxs',
            color: FlexTheme.textSecondary,
            align: 'end',
          }),
        ],
        { flex: 5 },
      ),
      t('›', { size: 'lg', color: FlexTheme.textMuted, align: 'end', flex: 1 }),
    ],
    {
      paddingAll: '8px',
      alignItems: 'center',
      action: postbackAction(
        truncate(rowLabel(row), 40),
        foodDayCommandText(row.daysAgo),
        `📅 ${rowLabel(row)}`,
      ),
    },
  );
}

/** Tappable per-day overview; each row opens that day's detail. */
export function buildDayRangeFlex(
  days: DayTotalsRow[],
  target: MacroTotals | null,
): FlexMessagePayload {
  const rows: FlexComponent[] = [];
  days.forEach((row, index) => {
    if (index > 0) {
      rows.push(sep('4px'));
    }
    rows.push(dayRow(row, target));
  });

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    body: vbox(
      [
        sectionLabel(`📅 ย้อนหลัง ${days.length} วัน`),
        t('แตะวันที่เพื่อดูรายละเอียด', {
          size: 'xxs',
          color: FlexTheme.textMuted,
          margin: '4px',
        }),
        vbox(rows, { margin: '10px' }),
        t(LOG_YESTERDAY_HINT, {
          size: 'xxs',
          color: FlexTheme.textMuted,
          margin: '10px',
        }),
      ],
      { paddingAll: '16px' },
    ),
  };
  return flexMessage(`ย้อนหลัง ${days.length} วัน`, bubble);
}
