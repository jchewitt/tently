export interface Queue<T> {
  publish(value: T): Promise<void>;
  subscribe(handler: (value: T) => Promise<void>): void;
}
export class MemoryQueue<T> implements Queue<T> {
  private handlers: ((value: T) => Promise<void>)[] = [];
  subscribe(handler: (value: T) => Promise<void>) { this.handlers.push(handler); }
  async publish(value: T) {
    await Promise.resolve();
    for (const handler of this.handlers) await handler(value);
  }
}
