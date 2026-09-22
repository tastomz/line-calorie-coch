import { formatNumber } from '../food/food.messages';
import { BodyProgressDelta, BodyScanDraft } from './body-scan.service';
import { DailyHealthSnapshot } from './health-dashboard.service';
import { WeeklyMetrics } from './weekly-review.service';
import type { HealthDashboardService } from './health-dashboard.service';

export const HEALTH_CONFIRM_CHOICES = [
  { label: '✓ บันทึก', text: 'บันทึกผลตรวจ' },
  { label: 'ยกเลิก', text: 'ยกเลิกผลตรวจ' },
];

export const BODY_SCAN_HELP =
  'ส่งรูปผล Body Scan / InBody / Evolt มาได้เลยครับ\nระบบจะดึงค่าให้ตรวจก่อนบันทึก';

export function buildBodyScanPreviewMessage(draft: BodyScanDraft): string {
  const lines = ['🧍 Body Scan', ''];
  if (draft.weightKg != null) lines.push(`น้ำหนัก ${draft.weightKg} kg`);
  if (draft.bodyFatPercent != null)
    lines.push(`Body Fat ${draft.bodyFatPercent}%`);
  if (draft.skeletalMuscleMassKg != null)
    lines.push(`Muscle ${draft.skeletalMuscleMassKg} kg`);
  if (draft.waistCm != null) lines.push(`Waist ${draft.waistCm} cm`);
  if (draft.bmrKcal != null)
    lines.push(`BMR ${formatNumber(draft.bmrKcal)} kcal`);
  if (draft.teeKcal != null)
    lines.push(`TEE ${formatNumber(draft.teeKcal)} kcal`);
  lines.push('', 'ตรวจสอบข้อมูลก่อนบันทึก');
  return lines.join('\n');
}

export function buildBodyProgressMessage(deltas: BodyProgressDelta[]): string {
  const lines = ['📈 Body Progress', ''];
  for (const d of deltas) {
    if (d.from == null || d.to == null || d.delta == null) continue;
    const arrow = d.delta === 0 ? '→' : d.delta < 0 ? '↓' : '↑';
    lines.push(d.labelTh);
    lines.push(`${d.from} → ${d.to} ${d.unit}`.trim());
    lines.push(`${arrow} ${Math.abs(d.delta)} ${d.unit}`.trim());
    lines.push('');
  }
  if (lines.length <= 2) {
    return '📈 Body Progress\n\nยังมีผลสแกนไม่พอสำหรับเปรียบเทียบครับ';
  }
  return lines.join('\n').trim();
}

export function buildSleepSavedMessage(params: {
  durationMinutes: number;
  bedtimeLabel: string;
  wakeLabel: string;
  score?: number | null;
}): string {
  const h = Math.floor(params.durationMinutes / 60);
  const m = params.durationMinutes % 60;
  const dur = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
  const lines = [
    '😴 การนอน',
    '',
    dur,
    `${params.bedtimeLabel} → ${params.wakeLabel}`,
  ];
  if (params.score != null) lines.push(`Score ${params.score}`);
  lines.push('', 'บันทึกแล้ว');
  return lines.join('\n');
}

export function buildExerciseSavedMessage(params: {
  name: string;
  durationMinutes: number;
}): string {
  return `🏋️ วันนี้ออกกำลังกาย

${params.name}
${params.durationMinutes} นาที

บันทึกแล้ว`;
}

export function buildStepsMessage(steps: number): string {
  return `👣 วันนี้

${formatNumber(steps)} steps`;
}

export function buildHydrationMessage(
  totalMl: number,
  targetMl: number,
): string {
  return `💧 น้ำวันนี้

${(totalMl / 1000).toFixed(1)} / ${(targetMl / 1000).toFixed(1)} L`;
}

export function buildRecoverySavedMessage(params: {
  energyScore: number;
  stressScore: number;
  recoveryScore: number;
  sorenessScore: number;
}): string {
  return `❤️ วันนี้เป็นยังไง?

⚡ Energy ${params.energyScore}/5
😌 Stress ${params.stressScore}/5
💪 Recovery ${params.recoveryScore}/5
🦵 Soreness ${params.sorenessScore}/5

บันทึกแล้ว`;
}

export function buildMealPlanMessage(
  slots: Array<{
    mealType: string;
    calorieTarget: number;
    proteinTargetG: number;
  }>,
): string {
  const label: Record<string, string> = {
    BREAKFAST: 'Breakfast',
    LUNCH: 'Lunch',
    DINNER: 'Dinner',
    SNACK: 'Snack',
  };
  const lines = ['🍱 แผนอาหารวันนี้', ''];
  for (const s of slots) {
    lines.push(label[s.mealType] ?? s.mealType);
    lines.push(
      `${formatNumber(s.calorieTarget)} kcal · P ${formatNumber(s.proteinTargetG)}g`,
    );
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function buildWeeklyReviewMessage(params: {
  metrics: WeeklyMetrics;
  aiSummary: string | null;
  focus: string[];
}): string {
  const m = params.metrics;
  const lines = ['📈 Weekly Review', ''];
  if (m.weightChangeKg != null) {
    lines.push(
      `⚖️ น้ำหนัก ${m.weightChangeKg > 0 ? '+' : ''}${m.weightChangeKg} kg`,
    );
  }
  if (m.avgCalories != null) {
    lines.push(`🔥 Calories ${formatNumber(m.avgCalories)} kcal/day`);
  }
  if (m.avgProteinG != null) {
    lines.push(`🥩 Protein ${m.avgProteinG} g/day`);
  }
  if (m.avgSleepHours != null) {
    lines.push(`😴 Sleep ${m.avgSleepHours} h/day`);
  }
  lines.push(`🏋️ Exercise ${m.workouts} ครั้ง`);
  if (m.avgSteps != null) {
    lines.push(`👣 Steps ${formatNumber(m.avgSteps)}/day`);
  }
  lines.push('', '────────────', '', "🧠 Coach's Take");
  lines.push(params.aiSummary ?? 'ยังไม่มีสรุป AI');
  if (params.focus.length > 0) {
    lines.push('', '────────────', '', '🎯 สัปดาห์หน้า');
    params.focus.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  }
  return lines.join('\n');
}

export function buildDashboardMessage(
  snap: DailyHealthSnapshot,
  dashboard: HealthDashboardService,
): string {
  return dashboard.formatDashboardText(snap);
}
