import { formatThaiDate } from './weight-date';
import { formatWeightKg } from './weight-log.service';
import {
  FlexMessagePayload,
  FlexTheme,
  flexMessage,
  sectionLabel,
  t,
  vbox,
} from '../line/line-flex';

export function buildWeightSavedFlex(
  weightKg: number,
  recordedAt: Date,
): FlexMessagePayload {
  return flexMessage(`น้ำหนัก ${formatWeightKg(weightKg)} kg`, {
    type: 'bubble',
    size: 'kilo',
    body: vbox(
      [
        sectionLabel('⚖️ น้ำหนักวันนี้'),
        t(`${formatWeightKg(weightKg)} kg`, {
          size: '3xl',
          weight: 'bold',
          color: FlexTheme.kcal,
          align: 'center',
          margin: '12px',
        }),
        t(formatThaiDate(recordedAt), {
          size: 'sm',
          color: FlexTheme.textSecondary,
          align: 'center',
          margin: '4px',
        }),
        t('บันทึกแล้ว', {
          size: 'xs',
          color: FlexTheme.accent,
          align: 'center',
          margin: '10px',
        }),
      ],
      { paddingAll: '18px' },
    ),
  });
}
