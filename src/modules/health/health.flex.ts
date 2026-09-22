import { BodyProgressDelta, BodyScanDraft } from './body-scan.service';
import { DailyHealthSnapshot } from './health-dashboard.service';
import { WeeklyMetrics } from './weekly-review.service';
import { formatNumber } from '../food/food.messages';
import {
  FlexBubble,
  FlexComponent,
  FlexMessagePayload,
  FlexTheme,
  flexMessage,
  kvRow,
  primaryButton,
  secondaryButton,
  sectionLabel,
  sep,
  t,
  vbox,
} from '../line/line-flex';

function multiline(text: string, opts: Parameters<typeof t>[1] = {}) {
  return t(text, { size: 'sm', wrap: true, ...opts });
}

export function buildBodyScanPreviewFlex(
  draft: BodyScanDraft,
): FlexMessagePayload {
  const body: FlexComponent[] = [sectionLabel('🧍 Body Scan')];
  if (draft.weightKg != null) {
    body.push(
      t(`${draft.weightKg} kg`, {
        size: 'xl',
        weight: 'bold',
        color: FlexTheme.kcal,
        margin: '8px',
      }),
    );
  }
  if (draft.bodyFatPercent != null) {
    body.push(
      t(`${draft.bodyFatPercent}% body fat`, {
        size: 'sm',
        color: FlexTheme.textSecondary,
      }),
    );
  }
  if (draft.skeletalMuscleMassKg != null) {
    body.push(kvRow('Muscle', `${draft.skeletalMuscleMassKg} kg`));
  }
  if (draft.waistCm != null) {
    body.push(kvRow('Waist', `${draft.waistCm} cm`));
  }
  if (draft.bmrKcal != null) {
    body.push(kvRow('BMR', `${formatNumber(draft.bmrKcal)} kcal`));
  }
  body.push(
    sep('14px'),
    multiline('ตรวจสอบข้อมูลก่อนบันทึก', {
      color: FlexTheme.textSecondary,
    }),
  );

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'kilo',
    body: vbox(body, { paddingAll: '16px' }),
    footer: vbox(
      [
        primaryButton('✓ บันทึก', 'บันทึกผลตรวจ'),
        secondaryButton('ยกเลิก', 'ยกเลิกผลตรวจ'),
      ],
      { spacing: 'sm', paddingAll: '12px' },
    ),
  };
  return flexMessage('Body Scan — ตรวจก่อนบันทึก', bubble);
}

export function buildBodyProgressFlex(
  deltas: BodyProgressDelta[],
): FlexMessagePayload {
  const body: FlexComponent[] = [sectionLabel('📈 Body Progress')];
  let any = false;
  for (const d of deltas) {
    if (d.from == null || d.to == null || d.delta == null) continue;
    any = true;
    const arrow = d.delta === 0 ? '→' : d.delta < 0 ? '↓' : '↑';
    body.push(
      t(d.labelTh, {
        size: 'xs',
        color: FlexTheme.textMuted,
        margin: '10px',
      }),
      t(`${d.from} → ${d.to} ${d.unit}`.trim(), {
        size: 'sm',
        weight: 'bold',
        color: FlexTheme.text,
      }),
      t(`${arrow} ${Math.abs(d.delta)} ${d.unit}`.trim(), {
        size: 'xs',
        color: FlexTheme.accent,
      }),
    );
  }
  if (!any) {
    body.push(
      multiline('ยังมีผลสแกนไม่พอสำหรับเปรียบเทียบครับ', {
        margin: '8px',
        color: FlexTheme.textSecondary,
      }),
    );
  }
  return flexMessage('Body Progress', {
    type: 'bubble',
    size: 'kilo',
    body: vbox(body, { paddingAll: '16px' }),
  });
}

export function buildHealthDashboardFlex(
  snap: DailyHealthSnapshot,
  formatDuration: (m: number) => string,
): FlexMessagePayload {
  const body: FlexComponent[] = [
    sectionLabel('📊 วันนี้'),
    t(snap.programLabel, {
      size: 'xs',
      color: FlexTheme.textMuted,
      margin: '2px',
    }),
  ];
  if (snap.nutrition) {
    body.push(
      t(
        `🔥 ${formatNumber(snap.nutrition.consumed.calories)} / ${formatNumber(snap.nutrition.target.calories)} kcal`,
        { size: 'sm', weight: 'bold', margin: '10px', wrap: true },
      ),
      t(
        `🥩 ${formatNumber(snap.nutrition.consumed.proteinG)} / ${formatNumber(snap.nutrition.target.proteinG)} g`,
        { size: 'sm', weight: 'bold', wrap: true },
      ),
    );
  }
  const rowBits: string[] = [];
  if (snap.weightKg != null) rowBits.push(`⚖️ ${snap.weightKg.toFixed(1)} kg`);
  if (snap.sleepMinutes != null)
    rowBits.push(`😴 ${formatDuration(snap.sleepMinutes)}`);
  if (rowBits.length) {
    body.push(
      multiline(rowBits.join('\n'), { margin: '10px', color: FlexTheme.text }),
    );
  }
  const row2: string[] = [];
  if (snap.exerciseMinutes > 0) row2.push(`🏋️ ${snap.exerciseMinutes} min`);
  if (snap.steps != null) row2.push(`👣 ${formatNumber(snap.steps)}`);
  if (row2.length) {
    body.push(multiline(row2.join('\n'), { color: FlexTheme.text }));
  }
  body.push(
    t(
      `💧 ${(snap.waterMl / 1000).toFixed(1)} / ${(snap.waterTargetMl / 1000).toFixed(1)} L`,
      { size: 'sm', margin: '8px' },
    ),
  );
  if (snap.recoveryScore != null) {
    body.push(t(`❤️ Recovery ${snap.recoveryScore}/5`, { size: 'sm' }));
  }
  body.push(
    sep('14px'),
    sectionLabel('💡 Coach Tip'),
    multiline(snap.tip, { margin: '6px', color: FlexTheme.textSecondary }),
  );
  return flexMessage('📊 วันนี้', {
    type: 'bubble',
    size: 'mega',
    body: vbox(body, { paddingAll: '16px' }),
  });
}

export function buildWeeklyReviewFlex(params: {
  metrics: WeeklyMetrics;
  aiSummary: string | null;
  focus: string[];
}): FlexMessagePayload {
  const m = params.metrics;
  const body: FlexComponent[] = [sectionLabel('📈 Weekly Review')];
  if (m.weightChangeKg != null) {
    body.push(
      kvRow(
        '⚖️ น้ำหนัก',
        `${m.weightChangeKg > 0 ? '+' : ''}${m.weightChangeKg} kg`,
      ),
    );
  }
  if (m.avgCalories != null) {
    body.push(kvRow('🔥 Calories', `${formatNumber(m.avgCalories)}/day`));
  }
  if (m.avgProteinG != null) {
    body.push(kvRow('🥩 Protein', `${m.avgProteinG} g/day`));
  }
  if (m.avgSleepHours != null) {
    body.push(kvRow('😴 Sleep', `${m.avgSleepHours} h/day`));
  }
  body.push(kvRow('🏋️ Exercise', `${m.workouts} ครั้ง`));
  if (m.avgSteps != null) {
    body.push(kvRow('👣 Steps', `${formatNumber(m.avgSteps)}/day`));
  }
  body.push(sep('12px'), sectionLabel("🧠 Coach's Take"));
  body.push(
    multiline(params.aiSummary ?? 'ยังไม่มีสรุป', {
      margin: '6px',
      color: FlexTheme.textSecondary,
    }),
  );
  if (params.focus.length > 0) {
    body.push(sep('12px'), sectionLabel('🎯 สัปดาห์หน้า'));
    params.focus.forEach((f, i) => {
      body.push(
        multiline(`${i + 1}. ${f}`, {
          margin: '4px',
          color: FlexTheme.text,
        }),
      );
    });
  }
  return flexMessage('📈 Weekly Review', {
    type: 'bubble',
    size: 'mega',
    body: vbox(body, { paddingAll: '16px' }),
  });
}

export function buildMealPlanFlex(
  slots: Array<{
    mealType: string;
    calorieTarget: number;
    proteinTargetG: number;
  }>,
): FlexMessagePayload {
  const label: Record<string, string> = {
    BREAKFAST: 'Breakfast',
    LUNCH: 'Lunch',
    DINNER: 'Dinner',
    SNACK: 'Snack',
  };
  const body: FlexComponent[] = [sectionLabel('🍱 แผนอาหารวันนี้')];
  for (const s of slots) {
    body.push(
      t(label[s.mealType] ?? s.mealType, {
        size: 'xs',
        color: FlexTheme.textMuted,
        margin: '10px',
      }),
      t(
        `${formatNumber(s.calorieTarget)} kcal · P ${formatNumber(s.proteinTargetG)}g`,
        { size: 'sm', weight: 'bold' },
      ),
    );
  }
  return flexMessage('🍱 แผนอาหารวันนี้', {
    type: 'bubble',
    size: 'kilo',
    body: vbox(body, { paddingAll: '16px' }),
  });
}

export function buildHydrationFlex(
  totalMl: number,
  targetMl: number,
): FlexMessagePayload {
  return flexMessage('💧 น้ำวันนี้', {
    type: 'bubble',
    size: 'kilo',
    body: vbox(
      [
        sectionLabel('💧 น้ำวันนี้'),
        t(
          `${(totalMl / 1000).toFixed(1)} / ${(targetMl / 1000).toFixed(1)} L`,
          {
            size: 'xl',
            weight: 'bold',
            color: FlexTheme.kcal,
            align: 'center',
            margin: '12px',
          },
        ),
      ],
      { paddingAll: '16px' },
    ),
    footer: vbox(
      [
        primaryButton('+250 ml', '+250 ml'),
        secondaryButton('+500 ml', '+500 ml'),
      ],
      { spacing: 'sm', paddingAll: '12px' },
    ),
  });
}
