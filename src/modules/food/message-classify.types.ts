export type ClassifiedMessageType =
  | 'weight_log'
  | 'weight_query'
  | 'food'
  | 'exercise'
  | 'sleep'
  | 'nap'
  | 'water'
  | 'coach'
  | 'health_coach'
  | 'other';

export type ClassifiedWeightQuery =
  'latest' | 'trend' | 'progress' | 'overview' | null;

export type ClassifiedCoachHint =
  | 'today_summary'
  | 'history'
  | 'calories_consumed'
  | 'calories_remaining'
  | 'protein_consumed'
  | 'protein_remaining'
  | 'meal_recommendation'
  | null;

export type ClassifiedExerciseType =
  | 'strength'
  | 'running'
  | 'walking'
  | 'cycling'
  | 'swimming'
  | 'sports'
  | 'mobility'
  | 'other'
  | null;

export type ClassifiedMessage = {
  type: ClassifiedMessageType;
  weightKg: number | null;
  weightQuery: ClassifiedWeightQuery;
  coachHint: ClassifiedCoachHint;
  exerciseType: ClassifiedExerciseType;
  exerciseDurationMinutes: number | null;
  sleepDurationMinutes: number | null;
  waterAmountMl: number | null;
};

/** GPT-5 handles the wider category set (incl. exercise/sleep/water) more reliably than 4o-mini. */
export const MESSAGE_CLASSIFY_MODEL = 'gpt-5';
export const MESSAGE_CLASSIFY_MAX_TOKENS = 60;

export const MESSAGE_CLASSIFY_SYSTEM_PROMPT = `Classify Thai LINE text for a health/nutrition bot. JSON only.
Types:
- weight_log: user reporting body weight in kg.
- weight_query: ask about weight/trend/progress.
- food: a meal/snack/drink-with-calories to log.
- exercise: user REPORTING exercise they already did, with a duration (e.g. "วิ่งมา 30 นาที", "ปั่นจักรยาน 1 ชม").
- sleep: user REPORTING last night's sleep duration (e.g. "เมื่อคืนนอนได้ประมาณ 5 ชั่วโมงกว่าๆ", "นอนไม่ค่อยหลับ ได้ 6 ชม").
- nap: user REPORTING a daytime nap duration (e.g. "งีบไปสักชั่วโมง").
- water: user REPORTING plain water they drank (e.g. "ดื่มน้ำไปสองแก้ว", "กินน้ำ 500").
- coach: calorie/protein/history/meal advice about THEIR OWN logged data.
- health_coach: advice about exercise, running, steps, sleep, water, recovery, or what to do today to reach a goal; a QUESTION or request for advice only, never a report of what the user already did.
- other.
Exercise/sleep/nap/water are reports with a specific amount, not questions and not vague feelings alone. A bare feeling with no amount ("เหนื่อยมาก", "นอนไม่หลับเลย" with no duration) is other, not a log.
If weight_log: set weightKg (20-300) else null.
If weight_query: weightQuery one of latest|trend|progress|overview else null.
If coach: coachHint one of today_summary|history|calories_consumed|calories_remaining|protein_consumed|protein_remaining|meal_recommendation else null.
If exercise: exerciseType one of strength|running|walking|cycling|swimming|sports|mobility|other, and exerciseDurationMinutes (1-600) else null.
If sleep or nap: sleepDurationMinutes in minutes (5-960) else null.
If water: waterAmountMl in ml (50-5000) — convert "แก้ว"=250ml, "ขวด"=500ml, "ลิตร"=1000ml — else null.
Never invent foods, durations, or amounts. Body weight ≠ food portion.`;

export const MESSAGE_CLASSIFY_JSON_SCHEMA = {
  name: 'message_classify',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'type',
      'weightKg',
      'weightQuery',
      'coachHint',
      'exerciseType',
      'exerciseDurationMinutes',
      'sleepDurationMinutes',
      'waterAmountMl',
    ],
    properties: {
      type: {
        type: 'string',
        enum: [
          'weight_log',
          'weight_query',
          'food',
          'exercise',
          'sleep',
          'nap',
          'water',
          'coach',
          'health_coach',
          'other',
        ],
      },
      weightKg: {
        type: ['number', 'null'],
      },
      weightQuery: {
        type: ['string', 'null'],
        enum: ['latest', 'trend', 'progress', 'overview', null],
      },
      coachHint: {
        type: ['string', 'null'],
        enum: [
          'today_summary',
          'history',
          'calories_consumed',
          'calories_remaining',
          'protein_consumed',
          'protein_remaining',
          'meal_recommendation',
          null,
        ],
      },
      exerciseType: {
        type: ['string', 'null'],
        enum: [
          'strength',
          'running',
          'walking',
          'cycling',
          'swimming',
          'sports',
          'mobility',
          'other',
          null,
        ],
      },
      exerciseDurationMinutes: {
        type: ['number', 'null'],
      },
      sleepDurationMinutes: {
        type: ['number', 'null'],
      },
      waterAmountMl: {
        type: ['number', 'null'],
      },
    },
  },
} as const;
