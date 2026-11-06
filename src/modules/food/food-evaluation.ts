/**
 * Offline, pure evaluation metrics for an explicitly labeled food-photo dataset.
 * This module does not call AI, store images or invent nutrition ground truth.
 */
export type GoldenPhotoKind =
  | 'food'
  | 'menu'
  | 'workout'
  | 'other'
  | 'uncertain';

export type NutritionMeasure =
  | 'edibleGrams'
  | 'calories'
  | 'proteinG'
  | 'carbsG'
  | 'fatG';

export type GoldenPhotoCase = {
  id: string;
  expectedKind: GoldenPhotoKind;
  /** Optional independently verified, measured labels. */
  reference?: Partial<Record<NutritionMeasure, number>>;
};

export type GoldenPhotoPrediction = {
  id: string;
  kind: GoldenPhotoKind;
  /** Optional predictions; do not conflate unreported values with zero. */
  estimate?: Partial<Record<NutritionMeasure, number>>;
  structuredOutputValid?: boolean;
  userCorrected?: boolean;
  latencyMs?: number;
  costThb?: number;
  success: boolean;
};

export type FoodEvaluationMetrics = {
  cases: number;
  predictions: number;
  classificationAccuracy: number | null;
  portionMaeGrams: number | null;
  calorieMae: number | null;
  proteinMaeG: number | null;
  carbsMaeG: number | null;
  fatMaeG: number | null;
  invalidOutputRate: number | null;
  userCorrectionRate: number | null;
  latencyP50Ms: number | null;
  latencyP95Ms: number | null;
  costPerSuccessfulAnalysisThb: number | null;
};

function average(values: readonly number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: readonly number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * fraction) - 1] ?? null;
}

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Match by ID. Unlabeled cases cannot contribute an MAE; absent predictions
 * cannot be silently scored as correct.
 */
export function evaluateFoodGoldenDataset(
  cases: readonly GoldenPhotoCase[],
  predictions: readonly GoldenPhotoPrediction[],
): FoodEvaluationMetrics {
  const byId = new Map(predictions.map((prediction) => [prediction.id, prediction]));
  const matched = cases
    .map((item) => ({ item, prediction: byId.get(item.id) }))
    .filter(
      (
        pair,
      ): pair is { item: GoldenPhotoCase; prediction: GoldenPhotoPrediction } =>
        pair.prediction !== undefined,
    );

  const errors = (measure: NutritionMeasure): number | null =>
    average(
      matched.flatMap(({ item, prediction }) => {
        const expected = item.reference?.[measure];
        const actual = prediction.estimate?.[measure];
        return validNumber(expected) && validNumber(actual)
          ? [Math.abs(actual - expected)]
          : [];
      }),
    );

  const classified = matched.filter(({ prediction }) => prediction.kind !== 'uncertain');
  const validated = matched.filter(
    ({ prediction }) => prediction.structuredOutputValid !== undefined,
  );
  const corrected = matched.filter(
    ({ prediction }) => prediction.userCorrected !== undefined,
  );
  const successes = matched.filter(({ prediction }) => prediction.success);
  const priced = successes.filter(({ prediction }) => validNumber(prediction.costThb));

  return {
    cases: cases.length,
    predictions: matched.length,
    classificationAccuracy: matched.length
      ? matched.filter(
          ({ item, prediction }) => item.expectedKind === prediction.kind,
        ).length / matched.length
      : null,
    portionMaeGrams: errors('edibleGrams'),
    calorieMae: errors('calories'),
    proteinMaeG: errors('proteinG'),
    carbsMaeG: errors('carbsG'),
    fatMaeG: errors('fatG'),
    invalidOutputRate: validated.length
      ? validated.filter(({ prediction }) => !prediction.structuredOutputValid)
          .length / validated.length
      : null,
    userCorrectionRate: corrected.length
      ? corrected.filter(({ prediction }) => prediction.userCorrected).length /
        corrected.length
      : null,
    latencyP50Ms: percentile(
      matched.flatMap(({ prediction }) =>
        validNumber(prediction.latencyMs) ? [prediction.latencyMs] : [],
      ),
      0.5,
    ),
    latencyP95Ms: percentile(
      matched.flatMap(({ prediction }) =>
        validNumber(prediction.latencyMs) ? [prediction.latencyMs] : [],
      ),
      0.95,
    ),
    costPerSuccessfulAnalysisThb: priced.length
      ? average(priced.map(({ prediction }) => prediction.costThb ?? 0))
      : null,
  };
}
