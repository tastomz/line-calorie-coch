import {
  FOOD_EDIT_CANCEL_TEXT,
  foodEditDelOkText,
  foodEditDelText,
  foodEditMenuText,
  foodEditNameText,
  foodEditNutText,
  foodEditQtyText,
  parseFoodEditCommand,
} from './food-edit.commands';
import { parseNutritionEdit } from './food-edit.nutrition-parse';
import { foodEditSessionBuffer } from './food-edit.session';

describe('food-edit.commands', () => {
  it('parses exact foodeedit commands', () => {
    expect(parseFoodEditCommand(foodEditMenuText('abc'))).toEqual({
      type: 'menu',
      foodLogId: 'abc',
    });
    expect(parseFoodEditCommand(foodEditQtyText('id1'))).toEqual({
      type: 'qty',
      foodLogId: 'id1',
    });
    expect(parseFoodEditCommand(foodEditNameText('id1'))).toEqual({
      type: 'name',
      foodLogId: 'id1',
    });
    expect(parseFoodEditCommand(foodEditNutText('id1'))).toEqual({
      type: 'nut',
      foodLogId: 'id1',
    });
    expect(parseFoodEditCommand(foodEditDelText('id1'))).toEqual({
      type: 'del',
      foodLogId: 'id1',
    });
    expect(parseFoodEditCommand(foodEditDelOkText('id1'))).toEqual({
      type: 'delok',
      foodLogId: 'id1',
    });
    expect(parseFoodEditCommand(FOOD_EDIT_CANCEL_TEXT)).toEqual({
      type: 'cancel',
    });
  });

  it('does not match natural language', () => {
    expect(parseFoodEditCommand('แก้ไขอาหารให้หน่อย')).toBeNull();
    expect(parseFoodEditCommand('foodedit:menu')).toBeNull();
    expect(parseFoodEditCommand('วันนี้')).toBeNull();
  });
});

describe('parseNutritionEdit', () => {
  it('parses labeled and ordered nutrition', () => {
    expect(parseNutritionEdit('kcal 650 protein 35 carbs 70 fat 20')).toEqual({
      ok: true,
      nutrition: {
        calories: 650,
        proteinG: 35,
        carbsG: 70,
        fatG: 20,
      },
    });
    expect(parseNutritionEdit('650 35 70 20')).toEqual({
      ok: true,
      nutrition: {
        calories: 650,
        proteinG: 35,
        carbsG: 70,
        fatG: 20,
      },
    });
  });

  it('rejects invalid / out-of-bounds', () => {
    expect(parseNutritionEdit('hello')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parseNutritionEdit('kcal -1 protein 1 carbs 1 fat 1')).toEqual({
      ok: false,
      reason: 'invalid',
    });
    expect(parseNutritionEdit('99999 1 1 1')).toEqual({
      ok: false,
      reason: 'out_of_bounds',
    });
  });
});

describe('foodEditSessionBuffer', () => {
  beforeEach(() => foodEditSessionBuffer.reset());

  it('stores and clears sessions', () => {
    foodEditSessionBuffer.set('u1', {
      kind: 'await_quantity',
      foodLogId: 'f1',
    });
    expect(foodEditSessionBuffer.get('u1')?.kind).toBe('await_quantity');
    foodEditSessionBuffer.clear('u1');
    expect(foodEditSessionBuffer.get('u1')).toBeNull();
  });
});
