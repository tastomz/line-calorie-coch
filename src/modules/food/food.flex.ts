import { PendingFoodAnalysis } from '@prisma/client';
import { FoodAnalysisResult } from './food-analysis.types';
import { DailySummary } from './daily-totals.service';
import { quantityUnitLabelTh } from './quantity-adjustment';
import { formatMacro, formatNumber } from './food.messages';
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
  hbox,
  kvRow,
  linkButton,
  macroCell,
  primaryButton,
  secondaryButton,
  sectionLabel,
  sep,
  t,
  truncate,
  vbox,
} from '../line/line-flex';

function qtyParts(
  analysis: FoodAnalysisResult,
  pending?: Pick<
    PendingFoodAnalysis,
    'originalQuantity' | 'consumedQuantity' | 'quantityUnit'
  > | null,
) {
  const unit = quantityUnitLabelTh(
    pending?.quantityUnit ?? analysis.quantityUnit,
  );
  const originalQty = pending?.originalQuantity ?? analysis.estimatedQuantity;
  const consumedQty = pending?.consumedQuantity ?? analysis.estimatedQuantity;
  const qtyChanged =
    pending != null &&
    pending.originalQuantity != null &&
    pending.consumedQuantity != null &&
    pending.consumedQuantity !== pending.originalQuantity;
  return { unit, originalQty, consumedQty, qtyChanged };
}

function assumptionPreview(analysis: FoodAnalysisResult): string | null {
  if (analysis.assumptions.length === 0) return null;
  return truncate(analysis.assumptions.slice(0, 2).join(' · '), 72);
}

/** Flex card: food estimate awaiting confirmation. */
export function buildFoodEstimateFlex(
  analysis: FoodAnalysisResult,
  pending?: Pick<
    PendingFoodAnalysis,
    'originalQuantity' | 'consumedQuantity' | 'quantityUnit'
  > | null,
): FlexMessagePayload {
  const confidencePct = Math.round(analysis.confidence * 100);
  const { unit, originalQty, consumedQty, qtyChanged } = qtyParts(
    analysis,
    pending,
  );
  const assumption = assumptionPreview(analysis);

  const qtyText = qtyChanged
    ? `${formatMacro(consumedQty)} ${unit} จาก ${formatMacro(originalQty)} ${unit}`
    : `${formatMacro(originalQty)} ${unit}`;

  const bodyContents = [
    sectionLabel('🍽️ มื้อนี้ · ยังไม่บันทึก'),
    t(analysis.foodName, {
      size: 'xl',
      weight: 'bold',
      color: FlexTheme.text,
      margin: '6px',
    }),
    t(`ประมาณ ${formatNumber(analysis.estimatedCalories)} kcal`, {
      size: 'xxl',
      weight: 'bold',
      color: FlexTheme.kcal,
      margin: '8px',
    }),
    hbox(
      [
        macroCell('P', `${formatMacro(analysis.proteinG)}g`),
        macroCell('C', `${formatMacro(analysis.carbsG)}g`),
        macroCell('F', `${formatMacro(analysis.fatG)}g`),
      ],
      {
        margin: '12px',
        spacing: 'sm',
        paddingAll: '10px',
        backgroundColor: FlexTheme.surfaceAlt,
        cornerRadius: '10px',
      },
    ),
    sep('14px'),
    kvRow('ปริมาณ', qtyText, { valueWeight: 'regular' }),
    kvRow('ความมั่นใจ', `${confidencePct}%`, {
      valueWeight: 'regular',
      valueColor: FlexTheme.textSecondary,
    }),
  ];

  if (assumption) {
    bodyContents.push(
      t(`ประเมินจาก ${assumption}`, {
        size: 'xs',
        color: FlexTheme.textMuted,
        margin: '8px',
      }),
    );
  }

  bodyContents.push(
    t('ถ้ากินไม่หมด พิมพ์จำนวนได้ เช่น กินแค่ 3 ชิ้น', {
      size: 'xxs',
      color: FlexTheme.textMuted,
      margin: '10px',
    }),
  );

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    body: vbox(bodyContents, {
      paddingAll: '16px',
      backgroundColor: FlexTheme.surface,
    }),
    footer: vbox(
      [
        primaryButton('✓ บันทึกมื้อนี้', 'บันทึก'),
        hbox(
          [
            secondaryButton('✎ แก้จำนวน', 'แก้ไข'),
            linkButton('ยกเลิก', 'ยกเลิก'),
          ],
          { spacing: 'sm', margin: '6px' },
        ),
      ],
      {
        spacing: 'sm',
        paddingAll: '12px',
        backgroundColor: FlexTheme.surface,
      },
    ),
    styles: {
      footer: { separator: true },
    },
  };

  const alt = `ประเมิน: ${analysis.foodName} ${formatNumber(analysis.estimatedCalories)} kcal — ยังไม่บันทึก`;
  return flexMessage(alt, bubble);
}

/** Flex card after local quantity adjustment. */
export function buildQuantityAdjustedFlex(
  analysis: FoodAnalysisResult,
  pending: Pick<
    PendingFoodAnalysis,
    'originalQuantity' | 'consumedQuantity' | 'quantityUnit'
  >,
): FlexMessagePayload {
  const { unit, originalQty, consumedQty } = qtyParts(analysis, pending);

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    body: vbox(
      [
        sectionLabel('🍽️ ปรับปริมาณ'),
        t(analysis.foodName, {
          size: 'lg',
          weight: 'bold',
          color: FlexTheme.text,
          margin: '4px',
        }),
        t(
          `${formatMacro(consumedQty)} ${unit} จาก ${formatMacro(originalQty)} ${unit}`,
          {
            size: 'sm',
            color: FlexTheme.textSecondary,
            margin: '4px',
          },
        ),
        t(`${formatNumber(analysis.estimatedCalories)} kcal`, {
          size: 'xxl',
          weight: 'bold',
          color: FlexTheme.kcal,
          margin: '10px',
        }),
        hbox(
          [
            macroCell('P', `${formatMacro(analysis.proteinG)}g`),
            macroCell('C', `${formatMacro(analysis.carbsG)}g`),
            macroCell('F', `${formatMacro(analysis.fatG)}g`),
          ],
          {
            margin: '10px',
            spacing: 'sm',
            paddingAll: '10px',
            backgroundColor: FlexTheme.surfaceAlt,
            cornerRadius: '10px',
          },
        ),
      ],
      { paddingAll: '16px' },
    ),
    footer: vbox(
      [
        primaryButton(
          `✓ บันทึก ${formatNumber(analysis.estimatedCalories)} kcal`,
          'บันทึก',
        ),
        hbox(
          [
            secondaryButton('✎ แก้จำนวน', 'แก้ไข'),
            linkButton('ยกเลิก', 'ยกเลิก'),
          ],
          { spacing: 'sm', margin: '6px' },
        ),
      ],
      { spacing: 'sm', paddingAll: '12px' },
    ),
    styles: { footer: { separator: true } },
  };

  return flexMessage(
    `ปรับแล้ว: ${analysis.foodName} ${formatNumber(analysis.estimatedCalories)} kcal`,
    bubble,
  );
}

/** After confirm — meal + today + next coaching. */
export function buildFoodSavedFlex(
  analysis: FoodAnalysisResult,
  summary: DailySummary,
): FlexMessagePayload {
  const coach = summary.targets
    ? {
        date: new Date(),
        consumed: {
          calories: summary.totals.calories,
          proteinG: summary.totals.proteinG,
          carbsG: summary.totals.carbsG,
          fatG: summary.totals.fatG,
        },
        target: {
          calories: summary.targets.dailyCalories,
          proteinG: summary.targets.dailyProteinG,
          carbsG: summary.targets.dailyCarbsG,
          fatG: summary.targets.dailyFatG,
        },
        remaining: {
          calories: summary.targets.dailyCalories - summary.totals.calories,
          proteinG: summary.targets.dailyProteinG - summary.totals.proteinG,
          carbsG: summary.targets.dailyCarbsG - summary.totals.carbsG,
          fatG: summary.targets.dailyFatG - summary.totals.fatG,
        },
      }
    : null;

  const bodyContents: FlexComponent[] = [
    sectionLabel('✅ บันทึกแล้ว'),
    t(analysis.foodName, {
      size: 'lg',
      weight: 'bold',
      margin: '4px',
    }),
    t(`${formatNumber(analysis.estimatedCalories)} kcal`, {
      size: 'xl',
      weight: 'bold',
      color: FlexTheme.kcal,
      margin: '4px',
    }),
    hbox(
      [
        macroCell('P', `${formatMacro(analysis.proteinG)}g`),
        macroCell('C', `${formatMacro(analysis.carbsG)}g`),
        macroCell('F', `${formatMacro(analysis.fatG)}g`),
      ],
      {
        margin: '10px',
        spacing: 'sm',
        paddingAll: '8px',
        backgroundColor: FlexTheme.surfaceAlt,
        cornerRadius: '10px',
      },
    ),
  ];

  if (coach) {
    bodyContents.push(
      sep('14px'),
      sectionLabel('📊 วันนี้'),
      t(formatEatenVsTarget(coach.consumed, coach.target), {
        size: 'sm',
        weight: 'bold',
        wrap: true,
        margin: '8px',
      }),
      sep('12px'),
      sectionLabel('เหลือวันนี้'),
      t(formatRemainingBudget(coach.remaining), {
        size: 'sm',
        weight: 'bold',
        wrap: true,
        color: FlexTheme.kcal,
        margin: '8px',
      }),
      sep('12px'),
      sectionLabel('💡 มื้อถัดไป'),
      t(buildNextMealTip(coach), {
        size: 'sm',
        wrap: true,
        color: FlexTheme.textSecondary,
        margin: '6px',
      }),
    );
  }

  const bubble: FlexBubble = {
    type: 'bubble',
    size: 'mega',
    body: vbox(bodyContents, { paddingAll: '16px' }),
  };

  return flexMessage(
    `บันทึก ${analysis.foodName} ${formatNumber(analysis.estimatedCalories)} kcal`,
    bubble,
  );
}
