import type { DispatchRequest } from './dispatch-request.js';

export interface DispatchPlan {
  request: DispatchRequest;
  lane: 'economy' | 'express';
  attempt: number;
}
