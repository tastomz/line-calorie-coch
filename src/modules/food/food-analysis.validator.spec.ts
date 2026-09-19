import {
  parseFoodAnalysisJson,
  validateFoodAnalysisResult,
  FoodAnalysisValidationError,
} from './food-analysis.validator';

describe('food-analysis.validator', () => {
  const valid = {
    foodName: 'ข้าวกะเพราไก่ไข่ดาว',
    estimatedCalories: 650,
    proteinG: 35,
    carbsG: 70,
    fatG: 25,
    confidence: 0.8,
    assumptions: ['ข้าวประมาณ 200 g'],
    estimatedQuantity: 1,
    quantityUnit: 'plate',
  };

  it('accepts a valid structured AI response', () => {
    expect(validateFoodAnalysisResult(valid)).toEqual(valid);
  });

  it('parses JSON content', () => {
    expect(parseFoodAnalysisJson(JSON.stringify(valid)).foodName).toBe(
      valid.foodName,
    );
  });

  it('rejects negative nutrition values', () => {
    expect(() =>
      validateFoodAnalysisResult({ ...valid, proteinG: -1 }),
    ).toThrow(FoodAnalysisValidationError);
  });

  it('rejects missing foodName', () => {
    expect(() =>
      validateFoodAnalysisResult({ ...valid, foodName: '  ' }),
    ).toThrow(/foodName/);
  });

  it('rejects confidence above 1', () => {
    expect(() =>
      validateFoodAnalysisResult({ ...valid, confidence: 1.5 }),
    ).toThrow(/confidence/);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseFoodAnalysisJson('{not-json')).toThrow(
      FoodAnalysisValidationError,
    );
  });
});
