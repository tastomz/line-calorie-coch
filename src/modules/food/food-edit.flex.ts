import { FoodLog } from '@prisma/client';
import { formatZonedTime } from './day-bounds';
import {
  FOOD_EDIT_CANCEL_TEXT,
  foodEditDelOkText,
  foodEditDelText,
  foodEditMenuText,
  foodEditNameText,
  foodEditNutText,
  foodEditQtyText,
} from './food-edit.commands';
import { formatMacro, formatNumber } from './food.messages';
import {
  FlexBubble,
  FlexComponent,
  FlexMessagePayload,
  FlexTheme,
  flexMessage,
  hbox,
  linkButton,
  macroCell,
  primaryButton,
  secondaryButton,
  sectionLabel,
  t,
  truncate,
  vbox,
} from '../line/line-flex';

function foodCardBody(log: FoodLog): FlexComponent[] {
  const time = formatZonedTime(log.eatenAt);
  return [
    t(`${time} · ${truncate(log.foodName, 22)}`, {
      size: 'md',
      weight: 'bold',
      color: FlexTheme.text,
      wrap: true,
    }),
    t(`${formatNumber(log.calories)} kcal`, {
      size: 'lg',
      weight: 'bold',
      color: FlexTheme.kcal,
      margin: '6px',
    }),
    hbox(
      [
        macroCell('P', `${formatMacro(log.proteinG)}g`),
        macroCell('C', `${formatMacro(log.carbsG)}g`),
        macroCell('F', `${formatMacro(log.fatG)}g`),
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
}

/** Carousel of today's food cards with Edit / Delete. */
export function buildTodayFoodEditListFlex(
  logs: FoodLog[],
): FlexMessagePayload {
  if (logs.length === 0) {
    return flexMessage('มื้อวันนี้', {
      type: 'bubble',
      body: vbox(
        [
          sectionLabel('🍽️ มื้อวันนี้'),
          t('วันนี้ยังไม่มีรายการอาหารครับ', {
            size: 'sm',
            color: FlexTheme.textSecondary,
            margin: '8px',
            wrap: true,
          }),
        ],
        { paddingAll: '16px' },
      ),
    });
  }

  const bubbles: FlexBubble[] = logs.slice(0, 10).map((log) => ({
    type: 'bubble',
    size: 'mega',
    body: vbox(foodCardBody(log), { paddingAll: '16px' }),
    footer: vbox(
      [
        hbox(
          [
            secondaryButton('✏️ แก้ไข', foodEditMenuText(log.id)),
            linkButton('🗑️ ลบ', foodEditDelText(log.id)),
          ],
          { spacing: 'sm' },
        ),
      ],
      { paddingAll: '12px' },
    ),
  }));

  if (logs.length > 10) {
    bubbles.push({
      type: 'bubble',
      body: vbox(
        [
          t(`+ อีก ${logs.length - 10} มื้อ`, {
            size: 'sm',
            color: FlexTheme.textMuted,
            wrap: true,
          }),
          t('แสดงได้สูงสุด 10 มื้อต่อครั้ง', {
            size: 'xxs',
            color: FlexTheme.textMuted,
            margin: '4px',
          }),
        ],
        { paddingAll: '16px' },
      ),
    });
  }

  return flexMessage(`มื้อวันนี้ ${logs.length} รายการ`, {
    type: 'carousel',
    contents: bubbles,
  });
}

export function buildFoodEditMenuFlex(log: FoodLog): FlexMessagePayload {
  return flexMessage(`แก้ไข ${log.foodName}`, {
    type: 'bubble',
    size: 'mega',
    body: vbox(
      [
        sectionLabel('✏️ แก้ไข'),
        t(truncate(log.foodName, 28), {
          size: 'lg',
          weight: 'bold',
          color: FlexTheme.text,
          margin: '6px',
          wrap: true,
        }),
        t(`${formatNumber(log.calories)} kcal`, {
          size: 'sm',
          color: FlexTheme.textSecondary,
          margin: '4px',
        }),
      ],
      { paddingAll: '16px' },
    ),
    footer: vbox(
      [
        primaryButton('ปริมาณ', foodEditQtyText(log.id)),
        secondaryButton('ชื่ออาหาร', foodEditNameText(log.id)),
        secondaryButton('สารอาหาร', foodEditNutText(log.id)),
        linkButton('ยกเลิก', FOOD_EDIT_CANCEL_TEXT),
      ],
      { paddingAll: '12px', spacing: 'sm' },
    ),
  });
}

export function buildFoodDeleteConfirmFlex(log: FoodLog): FlexMessagePayload {
  return flexMessage(`ลบ ${log.foodName}?`, {
    type: 'bubble',
    size: 'mega',
    body: vbox(
      [
        sectionLabel('🗑️ ยืนยันการลบ'),
        t(
          `ต้องการลบ ${truncate(log.foodName, 24)} · ${formatNumber(log.calories)} kcal ใช่ไหม?`,
          {
            size: 'sm',
            color: FlexTheme.text,
            margin: '8px',
            wrap: true,
          },
        ),
      ],
      { paddingAll: '16px' },
    ),
    footer: vbox(
      [
        primaryButton('ยืนยันลบ', foodEditDelOkText(log.id)),
        linkButton('ยกเลิก', FOOD_EDIT_CANCEL_TEXT),
      ],
      { paddingAll: '12px', spacing: 'sm' },
    ),
  });
}
