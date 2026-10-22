export interface Queue<T> {
  publish(value: T): Promise<void>;
  subscribe(handler: (value: T) => Promise<void>): void;
}

export interface TopicPublisher {
  publish(topic: string, payload: unknown): Promise<void>;
}

// A dependency-free asynchronous test transport, not a production broker.
export class MemoryQueue<T> implements Queue<T> {
  private readonly handlers: ((value: T) => Promise<void>)[] = [];

  subscribe(handler: (value: T) => Promise<void>): void {
    this.handlers.push(handler);
  }

  async publish(value: T): Promise<void> {
    await Promise.resolve();
    for (const handler of this.handlers) await handler(value);
  }
}
