import {
  FOOD_ANALYSIS_JSON_SCHEMA,
  FOOD_QUANTITY_UNITS,
} from './food-analysis.types';
import {
  parseFoodAnalysisJson,
  validateFoodAnalysisResult,
  normalizeQuantityUnit,
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

  it('OpenAI JSON schema enum matches app-allowed quantityUnit set', () => {
    const schemaEnum = FOOD_ANALYSIS_JSON_SCHEMA.schema.properties.quantityUnit
      .enum as readonly string[];
    expect([...schemaEnum].sort()).toEqual([...FOOD_QUANTITY_UNITS].sort());
  });

  describe('quantityUnit regression (prod FOOD_TEXT validation failure)', () => {
    it('rejects unknown units and includes the received value in the error', () => {
      expect(() =>
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'skillet' }),
      ).toThrow(/quantityUnit "skillet" must be one of/);
    });

    it('normalizes common English synonyms / plurals into canonical units', () => {
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'pieces' })
          .quantityUnit,
      ).toBe('piece');
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'glass' })
          .quantityUnit,
      ).toBe('cup');
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'grams' })
          .quantityUnit,
      ).toBe('serving');
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'portion' })
          .quantityUnit,
      ).toBe('serving');
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'dishes' })
          .quantityUnit,
      ).toBe('plate');
    });

    it('normalizes Thai unit labels into canonical units', () => {
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'จาน' })
          .quantityUnit,
      ).toBe('plate');
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'ชิ้น' })
          .quantityUnit,
      ).toBe('piece');
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'ถ้วย' })
          .quantityUnit,
      ).toBe('cup');
    });

    it('still accepts exact canonical units after trim/case fold', () => {
      expect(
        validateFoodAnalysisResult({ ...valid, quantityUnit: ' Plate ' })
          .quantityUnit,
      ).toBe('plate');
      expect(normalizeQuantityUnit('BOWL')).toBe('bowl');
    });

    it('does not silently accept arbitrary free-text units', () => {
      expect(() =>
        validateFoodAnalysisResult({ ...valid, quantityUnit: 'whatever' }),
      ).toThrow(FoodAnalysisValidationError);
      expect(normalizeQuantityUnit('whatever')).toBe('whatever');
    });
  });
});
