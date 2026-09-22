import { Goal, NutritionTargets } from '../nutrition/nutrition.types';
import {
  FlexBubble,
  FlexComponent,
  FlexMessagePayload,
  FlexTheme,
  flexMessage,
  hbox,
  primaryButton,
  secondaryButton,
  sectionLabel,
  sep,
  t,
  vbox,
} from '../line/line-flex';
import {
  buildWeightDeltaLabel,
  formatDisplayWeight,
  CONFIRM_CHOICES,
} from './onboarding.messages';
import { formatNumber, goalLabel } from './onboarding.parser';

/** Health Goal Dashboard Flex — presentation only; values come from caller. */
export function buildGoalConfirmationFlex(params: {
  currentWeightKg: number;
  targetWeightKg: number;
  goal: Goal;
  targets: NutritionTargets;
}): FlexMessagePayload {
  const current = formatDisplayWeight(params.currentWeightKg);
  const target = formatDisplayWeight(params.targetWeightKg);
  const delta = buildWeightDeltaLabel(
    params.currentWeightKg,
    params.targetWeightKg,
  );
  const goalTh = goalLabel(params.goal);
  const kcal = formatNumber(params.targets.dailyCalories);
  const protein = formatNumber(params.targets.dailyProteinG);
  const carbs = formatNumber(params.targets.dailyCarbsG);
  const fat = formatNumber(params.targets.dailyFatG);

  const weightHero = vbox(
    [
      hbox(
        [
          weightColumn(`${current} kg`, 'ปัจจุบัน', FlexTheme.kcal),
          t('→', {
            size: 'lg',
            color: FlexTheme.textMuted,
            align: 'center',
            flex: 0,
          }),
          weightColumn(`${target} kg`, 'เป้าหมาย', FlexTheme.accent),
        ],
        { margin: '4px', alignItems: 'center', spacing: 'sm' },
      ),
      t(delta, {
        size: 'sm',
        weight: 'bold',
        color: FlexTheme.accent,
        align: 'center',
        margin: '8px',
      }),
    ],
    {
      backgroundColor: FlexTheme.surfaceAlt,
      cornerRadius: '12px',
      paddingAll: '12px',
      margin: '8px',
    },
  );

  const nutrition: FlexComponent[] = [
    t(`🔥 ${kcal} kcal / วัน`, {
      size: 'md',
      weight: 'bold',
      color: FlexTheme.kcal,
      margin: '2px',
    }),
    hbox(
      [
        macroChip('🥩 โปรตีน', `${protein} g`),
        macroChip('🍚 คาร์บ', `${carbs} g`),
        macroChip('🥑 ไขมัน', `${fat} g`),
      ],
      { margin: '8px', spacing: 'sm' },
    ),
  ];

  const body: FlexComponent[] = [
    sectionLabel('🎯 เป้าหมายของคุณ'),
    weightHero,
    sep('12px'),
    sectionLabel('พลังงานต่อวัน'),
    ...nutrition,
    sep('12px'),
    hbox(
      [
        t(`🎯  ${goalTh}`, {
          size: 'sm',
          weight: 'bold',
          color: FlexTheme.accent,
          align: 'center',
          flex: 1,
        }),
      ],
      {
        backgroundColor: FlexTheme.accentSoft,
        cornerRadius: '999px',
        paddingAll: '8px',
        margin: '4px',
      },
    ),
    t('เป้านี้จะใช้ติดตามแต่ละวัน', {
      size: 'xxs',
      color: FlexTheme.textMuted,
      margin: '8px',
      align: 'center',
    }),
  ];

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    body: vbox(body, { paddingAll: '16px' }),
    footer: vbox(
      [
        primaryButton(CONFIRM_CHOICES[0].label, CONFIRM_CHOICES[0].text),
        secondaryButton(CONFIRM_CHOICES[1].label, CONFIRM_CHOICES[1].text),
      ],
      { spacing: 'sm', paddingAll: '12px' },
    ),
    styles: {
      footer: { separator: true },
    },
  };

  return flexMessage(
    `🎯 เป้าหมาย ${current}→${target} kg · ${kcal} kcal`,
    bubble,
  );
}

function weightColumn(value: string, label: string, color: string) {
  return vbox(
    [
      t(value, {
        size: 'xl',
        weight: 'bold',
        color,
        align: 'center',
      }),
      t(label, {
        size: 'xxs',
        color: FlexTheme.textMuted,
        align: 'center',
        margin: '2px',
      }),
    ],
    { flex: 1 },
  );
}

function macroChip(label: string, value: string) {
  return vbox(
    [
      t(label, {
        size: 'xxs',
        color: FlexTheme.textSecondary,
        align: 'center',
      }),
      t(value, {
        size: 'sm',
        weight: 'bold',
        color: FlexTheme.text,
        align: 'center',
        margin: '2px',
      }),
    ],
    {
      flex: 1,
      backgroundColor: FlexTheme.surfaceAlt,
      cornerRadius: '10px',
      paddingAll: '8px',
    },
  );
}
