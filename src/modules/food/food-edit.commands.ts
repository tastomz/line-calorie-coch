/**
 * Exact message-action commands for today's FoodLog edit/delete.
 * Prefix routing — never fuzzy match natural language.
 */

export type FoodEditCommand =
  | { type: 'menu'; foodLogId: string }
  | { type: 'qty'; foodLogId: string }
  | { type: 'name'; foodLogId: string }
  | { type: 'nut'; foodLogId: string }
  | { type: 'del'; foodLogId: string }
  | { type: 'delok'; foodLogId: string }
  | { type: 'cancel' };

const CMD_RE =
  /^foodedit:(menu|qty|name|nut|del|delok|cancel)(?::([A-Za-z0-9_-]+))?$/;

export function parseFoodEditCommand(text: string): FoodEditCommand | null {
  const m = text.trim().match(CMD_RE);
  if (!m) {
    return null;
  }
  const action = m[1];
  const foodLogId = m[2];
  if (action === 'cancel') {
    return { type: 'cancel' };
  }
  if (!foodLogId) {
    return null;
  }
  return {
    type: action as Exclude<FoodEditCommand['type'], 'cancel'>,
    foodLogId,
  };
}

export function foodEditMenuText(foodLogId: string): string {
  return `foodedit:menu:${foodLogId}`;
}

export function foodEditQtyText(foodLogId: string): string {
  return `foodedit:qty:${foodLogId}`;
}

export function foodEditNameText(foodLogId: string): string {
  return `foodedit:name:${foodLogId}`;
}

export function foodEditNutText(foodLogId: string): string {
  return `foodedit:nut:${foodLogId}`;
}

export function foodEditDelText(foodLogId: string): string {
  return `foodedit:del:${foodLogId}`;
}

export function foodEditDelOkText(foodLogId: string): string {
  return `foodedit:delok:${foodLogId}`;
}

export const FOOD_EDIT_CANCEL_TEXT = 'foodedit:cancel';
