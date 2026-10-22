export interface DispatchReceipt {
  requestId: string;
  destination: string;
  lane: 'economy' | 'express';
  status: 'delivered';
}
