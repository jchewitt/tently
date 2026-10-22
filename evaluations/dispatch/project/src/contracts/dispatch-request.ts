export interface DispatchRequest {
  requestId: string;
  destination: string;
  priority: 'standard' | 'urgent';
}
