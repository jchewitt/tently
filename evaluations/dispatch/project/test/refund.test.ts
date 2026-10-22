import { planRefund } from '../src/refund/planner.js';
import { recordLogin, subscribedTopic } from '../src/audit/consumer.js';

export function verifyUnrelatedDomains(): void {
  if (planRefund({ refundId: 'refund-1', amount: 25 }) !== 'automatic' ||
      planRefund({ refundId: 'refund-2', amount: 200 }) !== 'manual-review') {
    throw new Error('Refund amount policy changed');
  }
  const accounts = new Set<string>();
  recordLogin({ accountId: 'public-fixture-account' }, accounts);
  if (subscribedTopic !== 'account.logged.v1' || !accounts.has('public-fixture-account')) {
    throw new Error('Independent audit subscription changed');
  }
}
