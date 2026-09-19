import { formatThaiDate, formatThaiDateParts } from './weight-date';
import {
  DailyWeightAverage,
  WeightTargetProgress,
  WeightTrend,
  formatWeightKg,
} from './weight-log.service';

export const NO_WEIGHT_DATA_TEXT = `ยังไม่มีข้อมูลน้ำหนักครับ
ลองส่ง เช่น น้ำหนัก 84.2`;

export const INVALID_WEIGHT_TEXT = `⚠️ ขอน้ำหนักเป็นตัวเลขระหว่าง 20–300 กก. นะครับ
เช่น น้ำหนัก 84.2`;

export const WEIGHT_HELP_TEXT = `ส่งน้ำหนักมาได้เลยครับ เช่น
น้ำหนัก 84.2
84.2 กก.
หนัก 84.2`;

export const WEIGHT_SAVE_ERROR_TEXT =
  'ขออภัย บันทึกน้ำหนักไม่สำเร็จในขณะนี้ ลองใหม่อีกครั้งนะครับ';

export const WEIGHT_QUERY_ERROR_TEXT =
  'ขออภัย ดึงข้อมูลน้ำหนักไม่สำเร็จในขณะนี้ ลองใหม่อีกครั้งนะครับ';

export const INSUFFICIENT_TREND_TEXT =
  'แนวโน้ม 7 วัน: ยังข้อมูลไม่พอครับ (ต้องมีบันทึกทั้งช่วงล่าสุดและช่วงก่อนหน้า)';

export function buildWeightSavedMessage(
  weightKg: number,
  recordedAt: Date,
): string {
  return `⚖️ บันทึกน้ำหนักแล้ว

${formatWeightKg(weightKg)} kg
${formatThaiDate(recordedAt)}`;
}

export function buildWeightOverviewMessage(params: {
  todayAverageKg: number | null;
  recentDays: DailyWeightAverage[];
  trend: WeightTrend | null;
  progress: WeightTargetProgress | null;
}): string {
  const { todayAverageKg, recentDays, trend, progress } = params;

  if (
    todayAverageKg == null &&
    recentDays.length === 0 &&
    !progress &&
    !trend
  ) {
    return NO_WEIGHT_DATA_TEXT;
  }

  const todayLine =
    todayAverageKg != null
      ? `วันนี้: ${formatWeightKg(todayAverageKg)} kg`
      : 'วันนี้: ยังไม่มีบันทึก';

  const historyLines =
    recentDays.length > 0
      ? recentDays
          .map(
            (day) =>
              `${formatThaiDateParts(day.parts, { includeYear: false })} ${formatWeightKg(day.averageKg)}`,
          )
          .join('\n')
      : 'ยังไม่มีข้อมูลย้อนหลัง';

  const sections = [
    `⚖️ น้ำหนัก

${todayLine}

7 วันล่าสุด:
${historyLines}`,
  ];

  if (trend) {
    sections.push(buildTrendMessage(trend));
  } else if (recentDays.length > 0) {
    sections.push(INSUFFICIENT_TREND_TEXT);
  }

  if (progress) {
    sections.push(buildTargetProgressMessage(progress));
  }

  return sections.join('\n\n');
}

export function buildTrendMessage(trend: WeightTrend): string {
  const change = trend.changeKg;
  const changeLabel =
    change > 0
      ? `+${formatWeightKg(change)} kg`
      : `${formatWeightKg(change)} kg`;

  return `📉 แนวโน้ม 7 วัน

เฉลี่ย 7 วันล่าสุด: ${formatWeightKg(trend.recentAverageKg)} kg
เฉลี่ย 7 วันก่อนหน้า: ${formatWeightKg(trend.previousAverageKg)} kg
เปลี่ยนแปลง: ${changeLabel}`;
}

export function buildTargetProgressMessage(
  progress: WeightTargetProgress,
): string {
  const remaining = progress.remainingKg;
  const remainingLine =
    remaining > 0
      ? `เหลืออีก ${formatWeightKg(remaining)} kg ถึงเป้า`
      : remaining < 0
        ? `ต่ำกว่าเป้า ${formatWeightKg(Math.abs(remaining))} kg`
        : 'ถึงเป้าแล้วครับ';

  return `🎯 เป้าหมายน้ำหนัก

ล่าสุด: ${formatWeightKg(progress.latestKg)} kg
เป้าหมาย: ${formatWeightKg(progress.targetKg)} kg
${remainingLine}`;
}

export function buildLatestWeightMessage(
  weightKg: number,
  recordedAt: Date,
): string {
  return `น้ำหนักล่าสุด ${formatWeightKg(weightKg)} kg
(${formatThaiDate(recordedAt)})`;
}

export function buildProgressSinceFirstMessage(params: {
  earliestKg: number;
  latestKg: number;
  changeKg: number;
}): string {
  const { earliestKg, latestKg, changeKg } = params;
  if (changeKg < 0) {
    return `จาก ${formatWeightKg(earliestKg)} → ${formatWeightKg(latestKg)} kg
ลดไป ${formatWeightKg(Math.abs(changeKg))} kg ครับ`;
  }
  if (changeKg > 0) {
    return `จาก ${formatWeightKg(earliestKg)} → ${formatWeightKg(latestKg)} kg
เพิ่มขึ้น ${formatWeightKg(changeKg)} kg ครับ`;
  }
  return `จาก ${formatWeightKg(earliestKg)} → ${formatWeightKg(latestKg)} kg
ยังไม่เปลี่ยนจากครั้งแรกที่บันทึกครับ`;
}

export function buildTodayWeightLine(todayAverageKg: number): string {
  return `⚖️ น้ำหนักวันนี้: ${formatWeightKg(todayAverageKg)} kg`;
}
