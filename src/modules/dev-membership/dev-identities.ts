export const DEV_TEST_IDENTITIES = {
  USER_A: {
    key: 'USER_A',
    lineUserId: 'local-test-user-a',
    displayName: 'Test User A',
  },
  USER_B: {
    key: 'USER_B',
    lineUserId: 'local-test-user-b',
    displayName: 'Test User B',
  },
  ADMIN: {
    key: 'ADMIN',
    lineUserId: 'local-admin-user',
    displayName: 'Local Admin',
  },
} as const;

export type DevIdentityKey = keyof typeof DEV_TEST_IDENTITIES;
