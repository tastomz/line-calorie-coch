import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const baseDev = {
    NODE_ENV: 'development',
    PORT: '3000',
    DATABASE_URL: 'file:./dev.db',
    LINE_CHANNEL_SECRET: '',
    LINE_CHANNEL_ACCESS_TOKEN: '',
    OPENAI_API_KEY: '',
  };

  it('accepts development SQLite without LINE/OpenAI', () => {
    const env = validateEnv(baseDev);
    expect(env.DATABASE_URL).toBe('file:./dev.db');
    expect(env.PORT).toBe(3000);
  });

  it('rejects missing DATABASE_URL', () => {
    expect(() => validateEnv({ ...baseDev, DATABASE_URL: '' })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('requires production secrets and Postgres URL', () => {
    expect(() =>
      validateEnv({
        ...baseDev,
        NODE_ENV: 'production',
        DATABASE_URL: 'file:./dev.db',
        LINE_CHANNEL_SECRET: 's',
        LINE_CHANNEL_ACCESS_TOKEN: 't',
        OPENAI_API_KEY: 'k',
      }),
    ).toThrow(/PostgreSQL/);

    expect(() =>
      validateEnv({
        ...baseDev,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://localhost/db',
        LINE_CHANNEL_SECRET: '',
        LINE_CHANNEL_ACCESS_TOKEN: 't',
        OPENAI_API_KEY: 'k',
      }),
    ).toThrow(/LINE_CHANNEL_SECRET/);
  });

  it('rejects partial Google Sheets config', () => {
    expect(() =>
      validateEnv({
        ...baseDev,
        GOOGLE_SHEETS_SPREADSHEET_ID: 'sheet',
        GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
        GOOGLE_PRIVATE_KEY: '',
      }),
    ).toThrow(/partially configured/);
  });

  it('accepts full production config', () => {
    const env = validateEnv({
      NODE_ENV: 'production',
      PORT: '8080',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      LINE_CHANNEL_SECRET: 'secret',
      LINE_CHANNEL_ACCESS_TOKEN: 'token',
      OPENAI_API_KEY: 'key',
      GOOGLE_SHEETS_SPREADSHEET_ID: 'id',
      GOOGLE_SERVICE_ACCOUNT_EMAIL: 'sa@example.com',
      GOOGLE_PRIVATE_KEY:
        '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----',
    });
    expect(env.PORT).toBe(8080);
  });
});
