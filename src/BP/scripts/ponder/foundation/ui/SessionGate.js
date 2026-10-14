/**
 * One writer per player. Closing invalidates both queued operations and stale
 * form responses immediately, while cleanup waits for the in-flight writer.
 */
export class SessionGate {
  constructor() { this.closed = false; this.version = 0; this.tail = Promise.resolve(); }
  token() { return this.version; }
  current(token) { return !this.closed && token === this.version; }
  invalidate() { return ++this.version; }
  close() { this.closed = true; this.invalidate(); return this.tail; }
  run(action) {
    const token = this.version;
    const pending = this.tail.then(() => {
      if (!this.current(token)) return undefined;
      return action();
    });
    this.tail = pending.catch(() => undefined);
    return pending;
  }
}
