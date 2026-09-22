import { FOOD_COMMANDS, isExactFoodCommand } from './food-logging.service';
import { isLikelyFoodText } from './food-text-heuristic';

describe('Rich Menu exact command matching', () => {
  it('matches TODAY / FOOD_ENTRY / COACH_ENTRY exactly', () => {
    expect(isExactFoodCommand('วันนี้', FOOD_COMMANDS.TODAY)).toBe(true);
    expect(isExactFoodCommand(' วันนี้ ', FOOD_COMMANDS.TODAY)).toBe(true);
    expect(isExactFoodCommand('📊 วันนี้', FOOD_COMMANDS.TODAY)).toBe(true);

    expect(isExactFoodCommand('อาหาร', FOOD_COMMANDS.FOOD_ENTRY)).toBe(true);
    expect(isExactFoodCommand(' อาหาร ', FOOD_COMMANDS.FOOD_ENTRY)).toBe(true);
    expect(isExactFoodCommand('อาหาร\n', FOOD_COMMANDS.FOOD_ENTRY)).toBe(true);
    expect(isExactFoodCommand('🍽️ อาหาร', FOOD_COMMANDS.FOOD_ENTRY)).toBe(true);

    expect(isExactFoodCommand('โค้ช', FOOD_COMMANDS.COACH_ENTRY)).toBe(true);
    expect(isExactFoodCommand(' โค้ช ', FOOD_COMMANDS.COACH_ENTRY)).toBe(true);
    expect(isExactFoodCommand('โค้ช\n', FOOD_COMMANDS.COACH_ENTRY)).toBe(true);
    expect(isExactFoodCommand('🧠 โค้ช', FOOD_COMMANDS.COACH_ENTRY)).toBe(true);
  });

  it('does not over-match natural language', () => {
    expect(
      isExactFoodCommand('อาหารเช้านี้กินอะไรดี', FOOD_COMMANDS.FOOD_ENTRY),
    ).toBe(false);
    expect(
      isExactFoodCommand(
        'โค้ชช่วยดูน้ำหนักให้หน่อย',
        FOOD_COMMANDS.COACH_ENTRY,
      ),
    ).toBe(false);
    expect(isExactFoodCommand('วันนี้กินอะไรดี', FOOD_COMMANDS.TODAY)).toBe(
      false,
    );
  });

  it('does not treat entry commands as food text', () => {
    expect(isLikelyFoodText('อาหาร')).toBe(false);
    expect(isLikelyFoodText('🍽️ อาหาร')).toBe(false);
    expect(isLikelyFoodText('โค้ช')).toBe(false);
  });
});
