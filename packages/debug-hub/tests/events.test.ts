import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../src/events.js';

describe('EventBus', () => {
  it('should emit and receive events', () => {
    const bus = new EventBus();
    let received: string | null = null;

    bus.on('log', (data) => { received = data.message; });
    bus.emit('log', { message: 'hello' });

    assert.equal(received, 'hello');
  });

  it('should support multiple listeners', () => {
    const bus = new EventBus();
    let count = 0;

    bus.on('log', () => { count++; });
    bus.on('log', () => { count++; });
    bus.emit('log', {});

    assert.equal(count, 2);
  });

  it('should support unsubscribe', () => {
    const bus = new EventBus();
    let count = 0;

    const unsub = bus.on('log', () => { count++; });
    bus.emit('log', {});
    unsub();
    bus.emit('log', {});

    assert.equal(count, 1);
  });
});
