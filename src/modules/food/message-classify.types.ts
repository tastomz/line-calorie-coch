export type ClassifiedMessageType =
  'weight_log' | 'weight_query' | 'food' | 'coach' | 'other';

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

export type ClassifiedMessage = {
  type: ClassifiedMessageType;
  weightKg: number | null;
  weightQuery: ClassifiedWeightQuery;
  coachHint: ClassifiedCoachHint;
};

export const MESSAGE_CLASSIFY_MODEL = 'gpt-4o-mini';
export const MESSAGE_CLASSIFY_MAX_TOKENS = 60;

export const MESSAGE_CLASSIFY_SYSTEM_PROMPT = `Classify Thai LINE text for a nutrition bot. JSON only.
Types: weight_log (user reporting body weight kg), weight_query (ask about weight/trend/progress), food (meal to log), coach (calorie/protein/history/meal advice), other.
If weight_log: set weightKg (20-300) else null.
If weight_query: weightQuery one of latest|trend|progress|overview else null.
If coach: coachHint one of today_summary|history|calories_consumed|calories_remaining|protein_consumed|protein_remaining|meal_recommendation else null.
Never invent foods. Body weight ≠ food portion.`;

export const MESSAGE_CLASSIFY_JSON_SCHEMA = {
  name: 'message_classify',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['type', 'weightKg', 'weightQuery', 'coachHint'],
    properties: {
      type: {
        type: 'string',
        enum: ['weight_log', 'weight_query', 'food', 'coach', 'other'],
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
    },
  },
} as const;
