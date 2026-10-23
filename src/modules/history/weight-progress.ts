export type WeightProgress = {
  startKg: number;
  currentKg: number;
  targetKg: number;
  /** kg moved toward the target (negative = moved away). */
  achievedKg: number;
  remainingKg: number;
  /** 0–100 (clamped) share of the planned change already achieved. */
  percent: number;
  direction: 'lose' | 'gain' | 'maintain';
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Progress = how much of the planned weight change is done.
 * Lose 80 → 70 and now 75 = 50%. Gain works the same way upward.
 * Maintain (start ≈ target): 100% while within ±1 kg of target.
 */
export function weightProgress(
  startKg: number,
  currentKg: number,
  targetKg: number,
): WeightProgress {
  const planned = targetKg - startKg;
  if (Math.abs(planned) < 0.5) {
    const off = Math.abs(currentKg - targetKg);
    return {
      startKg,
      currentKg,
      targetKg,
      achievedKg: 0,
      remainingKg: round1(off),
      percent: off <= 1 ? 100 : Math.max(0, Math.round(100 - (off - 1) * 20)),
      direction: 'maintain',
    };
  }
  const direction = planned < 0 ? 'lose' : 'gain';
  const moved = currentKg - startKg;
  const achievedKg = round1(direction === 'lose' ? -moved : moved);
  const raw = (moved / planned) * 100;
  return {
    startKg,
    currentKg,
    targetKg,
    achievedKg,
    remainingKg: round1(
      Math.max(0, Math.abs(targetKg - currentKg) * (raw >= 100 ? 0 : 1)),
    ),
    percent: Math.max(0, Math.min(100, Math.round(raw))),
    direction,
  };
}
