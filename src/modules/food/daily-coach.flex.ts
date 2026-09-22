import { FoodLog } from '@prisma/client';
import { DailyCoachSummary } from './daily-summary.service';
import { formatZonedTime } from './day-bounds';
import { formatNumber } from './food.messages';
import {
  buildNextMealTip,
  formatEatenVsTarget,
  formatRemainingBudget,
} from './nutrition-display';
import {
  FlexBubble,
  FlexComponent,
  FlexMessagePayload,
  FlexTheme,
  flexMessage,
  kvRow,
  sectionLabel,
  sep,
  t,
  truncate,
  vbox,
} from '../line/line-flex';

function multilineBlock(text: string, opts: Parameters<typeof t>[1] = {}) {
  return t(text, { size: 'sm', wrap: true, ...opts });
}

/** Coach-style daily dashboard (Flex). */
export function buildDailyDashboardFlex(params: {
  summary: DailyCoachSummary;
  logs?: Array<Pick<FoodLog, 'eatenAt' | 'foodName' | 'calories'>>;
  todayWeightKg?: number | null;
}): FlexMessagePayload {
  const { summary, logs = [], todayWeightKg = null } = params;
  const tip = buildNextMealTip(summary);

  const body: FlexComponent[] = [
    sectionLabel('📊 วันนี้'),
    multilineBlock(formatEatenVsTarget(summary.consumed, summary.target), {
      margin: '8px',
      weight: 'bold',
      color: FlexTheme.text,
    }),
    sep('14px'),
    sectionLabel('เหลือวันนี้'),
    multilineBlock(formatRemainingBudget(summary.remaining), {
      margin: '8px',
      weight: 'bold',
      color: FlexTheme.kcal,
    }),
  ];

  if (todayWeightKg != null) {
    body.push(
      t(`⚖️ น้ำหนักวันนี้ ${todayWeightKg.toFixed(1)} kg`, {
        size: 'sm',
        color: FlexTheme.textSecondary,
        margin: '12px',
      }),
    );
  }

  if (logs.length > 0) {
    body.push(sep('14px'), sectionLabel('🍽️ มื้อที่บันทึก'));
    const shown = logs.slice(0, 8);
    for (const log of shown) {
      const time = formatZonedTime(log.eatenAt);
      body.push(
        kvRow(
          `${time}  ${truncate(log.foodName, 18)}`,
          `${formatNumber(log.calories)} kcal`,
          { valueWeight: 'regular' },
        ),
      );
    }
    if (logs.length > shown.length) {
      body.push(
        t(`+ อีก ${logs.length - shown.length} มื้อ`, {
          size: 'xxs',
          color: FlexTheme.textMuted,
          margin: '4px',
        }),
      );
    }
  }

  body.push(
    sep('14px'),
    sectionLabel('💡 มื้อถัดไป'),
    multilineBlock(tip, {
      margin: '6px',
      color: FlexTheme.textSecondary,
    }),
  );

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    body: vbox(body, { paddingAll: '16px' }),
  };

  return flexMessage(
    `วันนี้ ${formatNumber(summary.consumed.calories)}/${formatNumber(summary.target.calories)} kcal`,
    bubble,
  );
}

/** Compact meal list (ประวัติ). */
export function buildHistoryFlex(
  logs: Array<Pick<FoodLog, 'eatenAt' | 'foodName' | 'calories'>>,
): FlexMessagePayload {
  if (logs.length === 0) {
    const bubble: FlexBubble = {
      type: 'bubble',
      body: vbox(
        [
          sectionLabel('🍽️ มื้อที่บันทึก'),
          t('วันนี้ยังไม่มีรายการอาหารครับ', {
            size: 'sm',
            color: FlexTheme.textSecondary,
            margin: '8px',
          }),
        ],
        { paddingAll: '16px' },
      ),
    };
    return flexMessage('วันนี้ยังไม่มีรายการอาหาร', bubble);
  }

  const total = logs.reduce((sum, log) => sum + log.calories, 0);
  const rows: FlexComponent[] = [
    sectionLabel('🍽️ มื้อที่บันทึก'),
    t(`รวม ${formatNumber(total)} kcal · ${logs.length} มื้อ`, {
      size: 'sm',
      color: FlexTheme.textSecondary,
      margin: '4px',
    }),
    sep('12px'),
  ];

  for (const log of logs.slice(0, 12)) {
    const time = formatZonedTime(log.eatenAt);
    rows.push(
      kvRow(
        `${time}  ${truncate(log.foodName, 20)}`,
        `${formatNumber(log.calories)}`,
        { valueWeight: 'bold' },
      ),
    );
  }
  if (logs.length > 12) {
    rows.push(
      t(`+ อีก ${logs.length - 12} มื้อ`, {
        size: 'xxs',
        color: FlexTheme.textMuted,
        margin: '6px',
      }),
    );
  }

  return flexMessage(`ประวัติวันนี้ ${formatNumber(total)} kcal`, {
    type: 'bubble',
    size: 'mega',
    body: vbox(rows, { paddingAll: '16px', spacing: '6px' }),
  });
}
