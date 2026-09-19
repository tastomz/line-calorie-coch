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
  } else {
    // Development: allow SQLite file URLs; warn-level checks are left to logs elsewhere.
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
  };
}
