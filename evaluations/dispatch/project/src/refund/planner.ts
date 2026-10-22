import { evaluatePolicy, type RefundRequest } from './policy.js';

export function planRefund(request: RefundRequest): 'automatic' | 'manual-review' {
  return evaluatePolicy(request).accepted ? 'automatic' : 'manual-review';
}
