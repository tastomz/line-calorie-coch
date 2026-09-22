export type AppEnv = {
  NODE_ENV: string;
  PORT: number;
  DATABASE_URL: string;
  APP_TIMEZONE: string;
  LINE_CHANNEL_SECRET: string;
  LINE_CHANNEL_ACCESS_TOKEN: string;
  OPENAI_API_KEY: string;
  GOOGLE_SHEETS_SPREADSHEET_ID: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  MEMBERSHIP_WEB_URL: string;
  MEMBERSHIP_SESSION_SECRET: string;
  STRIPE_PUBLISHABLE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_PRICE_ID: string;
  LINE_LOGIN_CHANNEL_ID: string;
  LINE_LOGIN_CHANNEL_SECRET: string;
  ADMIN_SESSION_SECRET: string;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  ADMIN_PASSWORD_HASH: string;
  TRIAL_DEFAULT_DAYS: number;
  PRO_MONTHLY_PRICE_THB: number;
  PAYMENT_MODE: string;
  ENABLE_DEV_MEMBERSHIP_TOOLS: string;
  ENABLE_MEMBERSHIP_CHECKOUT: string;
  ADMIN_BOOTSTRAP_LINE_USER_IDS: string;
};

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

function read(raw: NodeJS.ProcessEnv, key: string): string {
  return (raw[key] ?? '').trim();
}

function isProduction(nodeEnv: string): boolean {
  return nodeEnv === 'production';
}

function sheetsPartiallyConfigured(env: {
  id: string;
  email: string;
  key: string;
}): boolean {
  const present = [env.id, env.email, env.key].filter((v) => v.length > 0);
  return present.length > 0 && present.length < 3;
}

/**
 * Validate environment at startup.
 * Never logs or returns secret values.
 */
export function validateEnv(raw: NodeJS.ProcessEnv = process.env): AppEnv {
  const NODE_ENV = read(raw, 'NODE_ENV') || 'development';
  const PORT_RAW = read(raw, 'PORT') || '3000';
  const PORT = Number(PORT_RAW);
  if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new EnvValidationError('PORT must be an integer between 1 and 65535');
  }

  const DATABASE_URL = read(raw, 'DATABASE_URL');
  if (!DATABASE_URL) {
    throw new EnvValidationError('DATABASE_URL is required');
  }

  const APP_TIMEZONE = read(raw, 'APP_TIMEZONE') || 'Asia/Bangkok';
  const LINE_CHANNEL_SECRET = read(raw, 'LINE_CHANNEL_SECRET');
  const LINE_CHANNEL_ACCESS_TOKEN = read(raw, 'LINE_CHANNEL_ACCESS_TOKEN');
  const OPENAI_API_KEY = read(raw, 'OPENAI_API_KEY');
  const GOOGLE_SHEETS_SPREADSHEET_ID = read(
    raw,
    'GOOGLE_SHEETS_SPREADSHEET_ID',
  );
  const GOOGLE_SERVICE_ACCOUNT_EMAIL = read(
    raw,
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  );
  const GOOGLE_PRIVATE_KEY = read(raw, 'GOOGLE_PRIVATE_KEY');

  const MEMBERSHIP_WEB_URL = read(raw, 'MEMBERSHIP_WEB_URL');
  const MEMBERSHIP_SESSION_SECRET = read(raw, 'MEMBERSHIP_SESSION_SECRET');
  const STRIPE_PUBLISHABLE_KEY = read(raw, 'STRIPE_PUBLISHABLE_KEY');
  const STRIPE_SECRET_KEY = read(raw, 'STRIPE_SECRET_KEY');
  const STRIPE_WEBHOOK_SECRET = read(raw, 'STRIPE_WEBHOOK_SECRET');
  const STRIPE_PRICE_ID = read(raw, 'STRIPE_PRICE_ID');
  const LINE_LOGIN_CHANNEL_ID = read(raw, 'LINE_LOGIN_CHANNEL_ID');
  const LINE_LOGIN_CHANNEL_SECRET = read(raw, 'LINE_LOGIN_CHANNEL_SECRET');
  const ADMIN_SESSION_SECRET = read(raw, 'ADMIN_SESSION_SECRET');
  const ADMIN_USERNAME = read(raw, 'ADMIN_USERNAME');
  const ADMIN_PASSWORD = read(raw, 'ADMIN_PASSWORD');
  const ADMIN_PASSWORD_HASH = read(raw, 'ADMIN_PASSWORD_HASH');
  const PAYMENT_MODE = (read(raw, 'PAYMENT_MODE') || 'MOCK').toUpperCase();
  const ENABLE_DEV_MEMBERSHIP_TOOLS = read(raw, 'ENABLE_DEV_MEMBERSHIP_TOOLS');
  const ENABLE_MEMBERSHIP_CHECKOUT = read(raw, 'ENABLE_MEMBERSHIP_CHECKOUT');
  const ADMIN_BOOTSTRAP_LINE_USER_IDS = read(
    raw,
    'ADMIN_BOOTSTRAP_LINE_USER_IDS',
  );

  const trialRaw = read(raw, 'TRIAL_DEFAULT_DAYS') || '7';
  const TRIAL_DEFAULT_DAYS = Number(trialRaw);
  if (
    !Number.isInteger(TRIAL_DEFAULT_DAYS) ||
    TRIAL_DEFAULT_DAYS < 1 ||
    TRIAL_DEFAULT_DAYS > 365
  ) {
    throw new EnvValidationError('TRIAL_DEFAULT_DAYS must be 1–365');
  }

  const priceRaw = read(raw, 'PRO_MONTHLY_PRICE_THB') || '50';
  const PRO_MONTHLY_PRICE_THB = Number(priceRaw);
  if (!Number.isInteger(PRO_MONTHLY_PRICE_THB) || PRO_MONTHLY_PRICE_THB < 1) {
    throw new EnvValidationError(
      'PRO_MONTHLY_PRICE_THB must be a positive integer',
    );
  }

  if (STRIPE_SECRET_KEY.startsWith('sk_live_')) {
    throw new EnvValidationError(
      'STRIPE_SECRET_KEY live keys are blocked until production payment activation',
    );
  }

  if (PAYMENT_MODE !== 'MOCK' && PAYMENT_MODE !== 'STRIPE') {
    throw new EnvValidationError('PAYMENT_MODE must be MOCK or STRIPE');
  }

  if (
    isProduction(NODE_ENV) &&
    ENABLE_DEV_MEMBERSHIP_TOOLS.toLowerCase() === 'true'
  ) {
    throw new EnvValidationError(
      'ENABLE_DEV_MEMBERSHIP_TOOLS cannot be true in production',
    );
  }

  if (
    isProduction(NODE_ENV) &&
    ENABLE_MEMBERSHIP_CHECKOUT.toLowerCase() === 'true' &&
    PAYMENT_MODE === 'STRIPE' &&
    !STRIPE_SECRET_KEY
  ) {
    throw new EnvValidationError(
      'ENABLE_MEMBERSHIP_CHECKOUT requires Stripe TEST keys when PAYMENT_MODE=STRIPE',
    );
  }

  if (isProduction(NODE_ENV)) {
    if (!LINE_CHANNEL_SECRET) {
      throw new EnvValidationError(
        'LINE_CHANNEL_SECRET is required in production',
      );
    }
    if (!LINE_CHANNEL_ACCESS_TOKEN) {
      throw new EnvValidationError(
        'LINE_CHANNEL_ACCESS_TOKEN is required in production',
      );
    }
    if (!OPENAI_API_KEY) {
      throw new EnvValidationError('OPENAI_API_KEY is required in production');
    }
    if (
      !DATABASE_URL.startsWith('postgresql://') &&
      !DATABASE_URL.startsWith('postgres://')
    ) {
      throw new EnvValidationError(
        'DATABASE_URL must be a PostgreSQL URL in production',
      );
    }
    if (ADMIN_USERNAME && !ADMIN_PASSWORD_HASH) {
      throw new EnvValidationError(
        'ADMIN_PASSWORD_HASH is required in production when ADMIN_USERNAME is set',
      );
    }
  } else {
    if (
      !DATABASE_URL.startsWith('file:') &&
      !DATABASE_URL.startsWith('postgresql://') &&
      !DATABASE_URL.startsWith('postgres://')
    ) {
      throw new EnvValidationError(
        'DATABASE_URL must be a file: SQLite URL or a PostgreSQL URL',
      );
    }
  }

  if (
    sheetsPartiallyConfigured({
      id: GOOGLE_SHEETS_SPREADSHEET_ID,
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: GOOGLE_PRIVATE_KEY,
    })
  ) {
    throw new EnvValidationError(
      'Google Sheets is partially configured; set all of GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY — or leave all empty',
    );
  }

  if (
    isProduction(NODE_ENV) &&
    GOOGLE_SHEETS_SPREADSHEET_ID &&
    (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY)
  ) {
    throw new EnvValidationError(
      'Google Sheets enabled but missing service account credentials',
    );
  }

  return {
    NODE_ENV,
    PORT,
    DATABASE_URL,
    APP_TIMEZONE,
    LINE_CHANNEL_SECRET,
    LINE_CHANNEL_ACCESS_TOKEN,
    OPENAI_API_KEY,
    GOOGLE_SHEETS_SPREADSHEET_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY,
    MEMBERSHIP_WEB_URL,
    MEMBERSHIP_SESSION_SECRET,
    STRIPE_PUBLISHABLE_KEY,
    STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID,
    LINE_LOGIN_CHANNEL_ID,
    LINE_LOGIN_CHANNEL_SECRET,
    ADMIN_SESSION_SECRET,
    ADMIN_USERNAME,
    ADMIN_PASSWORD,
    ADMIN_PASSWORD_HASH,
    TRIAL_DEFAULT_DAYS,
    PRO_MONTHLY_PRICE_THB,
    PAYMENT_MODE,
    ENABLE_DEV_MEMBERSHIP_TOOLS,
    ENABLE_MEMBERSHIP_CHECKOUT,
    ADMIN_BOOTSTRAP_LINE_USER_IDS,
  };
}
