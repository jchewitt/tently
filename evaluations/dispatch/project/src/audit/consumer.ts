// This unrelated audit subscriber has the same basename as the archival consumer.
export const subscribedTopic = 'account.logged.v1';

export function recordLogin(payload: { accountId: string }, accounts: Set<string>): void {
  accounts.add(payload.accountId);
}
