import type { DispatchRequest } from '../contracts/dispatch-request.js';

export function evaluatePolicy(request: DispatchRequest): { accepted: boolean; lane: 'economy' | 'express' } {
  return {
    accepted: request.destination.trim().length > 0,
    lane: request.priority === 'urgent' ? 'express' : 'economy',
  };
}
