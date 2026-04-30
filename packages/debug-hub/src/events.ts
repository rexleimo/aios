type Listener = (data: any) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  emit(event: string, data: any): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try { listener(data); } catch { /* swallow listener errors */ }
    }
  }
}
