export interface RefundRequest {
  refundId: string;
  amount: number;
}

export function evaluatePolicy(request: RefundRequest): { accepted: boolean } {
  return { accepted: request.amount > 0 && request.amount <= 100 };
}
