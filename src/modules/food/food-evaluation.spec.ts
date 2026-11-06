import { evaluateFoodGoldenDataset } from './food-evaluation';

describe('food-photo golden dataset metrics', () => {
  it('reports unknown metrics rather than false zero error for no labels', () => {
    const result = evaluateFoodGoldenDataset([], []);
    expect(result).toMatchObject({
      cases: 0,
      predictions: 0,
      classificationAccuracy: null,
      calorieMae: null,
      portionMaeGrams: null,
      invalidOutputRate: null,
      costPerSuccessfulAnalysisThb: null,
    });
  });

  it('calculates metrics only from matching labels and predictions', () => {
    // Synthetic arithmetic fixtures, not real nutrition ground truth.
    const cases = [
      {
        id: 'synthetic-meal',
        expectedKind: 'food' as const,
        reference: { edibleGrams: 150, calories: 300, proteinG: 20 },
      },
      { id: 'synthetic-menu', expectedKind: 'menu' as const },
    ];
    const predictions = [
      {
        id: 'synthetic-meal',
        kind: 'food' as const,
        estimate: { edibleGrams: 170, calories: 350, proteinG: 25 },
        structuredOutputValid: true,
        userCorrected: false,
        latencyMs: 1000,
        costThb: 0.01,
        success: true,
      },
      {
        id: 'synthetic-menu',
        kind: 'food' as const,
        structuredOutputValid: false,
        userCorrected: true,
        latencyMs: 2000,
        success: false,
      },
    ];
    const result = evaluateFoodGoldenDataset(cases, predictions);
    expect(result).toMatchObject({
      cases: 2,
      predictions: 2,
      classificationAccuracy: 0.5,
      portionMaeGrams: 20,
      calorieMae: 50,
      proteinMaeG: 5,
      carbsMaeG: null,
      invalidOutputRate: 0.5,
      userCorrectionRate: 0.5,
      latencyP50Ms: 1000,
      latencyP95Ms: 2000,
      costPerSuccessfulAnalysisThb: 0.01,
    });
  });

  it('ignores unlabeled nutrition fields and missing prediction IDs', () => {
    const result = evaluateFoodGoldenDataset(
      [
        { id: 'not-yet-reviewed', expectedKind: 'food' },
        { id: 'missing', expectedKind: 'other' },
      ],
      [{ id: 'not-yet-reviewed', kind: 'food', success: true }],
    );
    expect(result.predictions).toBe(1);
    expect(result.calorieMae).toBeNull();
    expect(result.invalidOutputRate).toBeNull();
  });
});
