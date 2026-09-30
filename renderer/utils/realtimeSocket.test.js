import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRealtimeSocket } from './realtimeSocket';

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances = [];

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.readyState = FakeWebSocket.CLOSED; }

  // Test helpers
  serverOpen() { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  serverFail() { this.readyState = FakeWebSocket.CLOSED; this.onerror?.(); this.onclose?.({ code: 1006 }); }
  serverClose() { this.readyState = FakeWebSocket.CLOSED; this.onclose?.({ code: 1000 }); }
  serverMessage(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
}

const latest = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1];

const setup = (overrides = {}) => {
  const statuses = [];
  const events = [];
  const closes = [];
  const socket = createRealtimeSocket({
    url: 'wss://example/realtime',
    WebSocketImpl: FakeWebSocket,
    onOpen: overrides.onOpen,
    onEvent: (e) => events.push(e),
    onStatus: (s, t) => statuses.push([s, t]),
    onClose: (info) => closes.push(info),
    backoffMs: [10, 20],
    ...overrides,
  });
  return { socket, statuses, events, closes };
};

describe('createRealtimeSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('resolves connect on open and routes parsed events', async () => {
    const { socket, events } = setup();
    const p = socket.connect('sk-test');
    latest().serverOpen();
    await expect(p).resolves.toBe(true);
    latest().serverMessage({ type: 'hello' });
    latest().onmessage({ data: 'not json' });
    expect(events).toEqual([{ type: 'hello' }]);
    expect(latest().protocols[1]).toBe('openai-insecure-api-key.sk-test');
  });

  it('rejects the initial connect when the socket fails before opening', async () => {
    const { socket } = setup();
    const p = socket.connect('sk-test');
    latest().serverFail();
    await expect(p).rejects.toThrow('Connection error');
    expect(socket.isActive()).toBe(false);
  });

  it('keeps reconnecting after an unexpected close, even if a reconnect attempt fails', async () => {
    const { socket, statuses } = setup();
    const p = socket.connect('sk-test');
    latest().serverOpen();
    await p;

    latest().serverClose();
    expect(statuses.at(-1)).toEqual(['connecting', 'Reconnecting...']);

    await vi.advanceTimersByTimeAsync(10);
    expect(FakeWebSocket.instances).toHaveLength(2);
    latest().serverFail();

    await vi.advanceTimersByTimeAsync(20);
    expect(FakeWebSocket.instances).toHaveLength(3);
    latest().serverOpen();
    expect(socket.isOpen()).toBe(true);
  });

  it('buffers audio while reconnecting and flushes it after the next open', async () => {
    const onOpen = vi.fn(() => socket.send({ type: 'session.update' }));
    const { socket } = setup({ onOpen });
    const p = socket.connect('sk-test');
    latest().serverOpen();
    await p;

    latest().serverClose();
    expect(socket.sendBuffered({ type: 'append', n: 1 })).toBe(false);
    expect(socket.sendBuffered({ type: 'append', n: 2 })).toBe(false);

    await vi.advanceTimersByTimeAsync(10);
    latest().serverOpen();
    // Session config first, then the buffered audio in order
    expect(latest().sent.map((m) => m.n ?? m.type)).toEqual(['session.update', 1, 2]);
  });

  it('bounds the reconnect buffer by dropping the oldest messages', async () => {
    const { socket } = setup({ maxBufferedMessages: 2 });
    const p = socket.connect('sk-test');
    latest().serverOpen();
    await p;
    latest().serverClose();
    [1, 2, 3].forEach((n) => socket.sendBuffered({ n }));
    await vi.advanceTimersByTimeAsync(10);
    latest().serverOpen();
    expect(latest().sent.map((m) => m.n)).toEqual([2, 3]);
  });

  it('stops reconnecting and drops buffered audio after disconnect', async () => {
    const { socket, closes } = setup();
    const p = socket.connect('sk-test');
    latest().serverOpen();
    await p;
    latest().serverClose();
    socket.disconnect();
    expect(socket.sendBuffered({ n: 1 })).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(closes[0]).toMatchObject({ intentional: false });
  });

  it('rotate() keeps audio flowing to the old socket until the new one is open', async () => {
    const retiredSends = [];
    const onRetire = vi.fn((sendToOld) => retiredSends.push(sendToOld({ type: 'input_audio_buffer.commit' })));
    const onRetireEnd = vi.fn();
    const { socket, events } = setup({ onRetire, onRetireEnd, retireGraceMs: 50 });
    const p = socket.connect('sk-test');
    const first = latest();
    first.serverOpen();
    await p;

    socket.rotate();
    const second = latest();
    expect(second).not.toBe(first);
    // Still connecting: audio goes to the old socket, nothing is buffered or lost
    socket.sendBuffered({ n: 1 });
    expect(first.sent.map((m) => m.n)).toEqual([1]);

    second.serverOpen();
    await vi.advanceTimersByTimeAsync(0);
    socket.sendBuffered({ n: 2 });
    expect(second.sent.map((m) => m.n)).toEqual([2]);
    // Old socket was asked to commit what it had, and still delivers its results
    expect(first.sent.at(-1)).toEqual({ type: 'input_audio_buffer.commit' });
    expect(retiredSends).toEqual([true]);
    first.serverMessage({ type: 'late.result' });
    expect(events.at(-1)).toEqual({ type: 'late.result' });

    await vi.advanceTimersByTimeAsync(50);
    expect(onRetireEnd).toHaveBeenCalledTimes(1);
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
    expect(socket.isOpen()).toBe(true);
  });

  it('rotate() falls back to a normal reconnect if both sockets fail', async () => {
    const { socket } = setup();
    const p = socket.connect('sk-test');
    const first = latest();
    first.serverOpen();
    await p;

    socket.rotate();
    first.serverClose(); // old one dies while the replacement is connecting
    socket.sendBuffered({ n: 1 }); // buffered, not dropped
    latest().serverFail();
    await vi.advanceTimersByTimeAsync(10);
    latest().serverOpen();
    expect(socket.isOpen()).toBe(true);
    expect(latest().sent.map((m) => m.n)).toEqual([1]);
  });
});

describe('createRealtimeSocket: stale attempts', () => {
  beforeEach(() => { FakeWebSocket.instances = []; vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

  it('a connect attempt cancelled by Stop cannot deactivate the next Start', async () => {
    const { socket } = setup({ connectTimeoutMs: 8000 });
    const first = socket.connect('sk-test'); // slow network: never opens
    first.catch(() => {});
    socket.disconnect();

    const second = socket.connect('sk-test');
    latest().serverOpen();
    await expect(second).resolves.toBe(true);

    await vi.advanceTimersByTimeAsync(8000); // the first attempt's timeout fires now
    expect(socket.isActive()).toBe(true);
    expect(socket.isOpen()).toBe(true);
    expect(socket.send({ type: 'ping' })).toBe(true);
  });
});
