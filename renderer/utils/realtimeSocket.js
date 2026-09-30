const DEFAULT_BACKOFF_MS = [1000, 2000, 4000, 8000];
const MAX_BACKOFF_MS = 10000;

/**
 * WebSocket lifecycle shared by both engines.
 *
 * - connect() resolves on the first open and rejects if that first attempt fails;
 *   the caller (connection manager) owns retries for the initial connect.
 * - After a successful open, any unexpected close reconnects with backoff until
 *   disconnect() is called. A failed reconnect never leaves the session dead.
 * - Audio sent while reconnecting is buffered (bounded) and flushed after the
 *   next open, so a session refresh doesn't drop the words spoken meanwhile.
 * - rotate() closes the socket on purpose and reconnects immediately; engines
 *   use it to refresh a session before the server's hard age limit.
 */
export function createRealtimeSocket({
  url,
  onOpen,
  onEvent,
  onStatus,
  onClose,
  WebSocketImpl = globalThis.WebSocket,
  connectTimeoutMs = 8000,
  maxBufferedMessages = 60,
  backoffMs = DEFAULT_BACKOFF_MS,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = (id) => clearTimeout(id),
}) {
  let ws = null;
  let apiKey = null;
  let active = false; // true between connect() and disconnect()
  let reconnectTimer = null;
  let reconnectAttempt = 0;
  let openedAt = 0;
  let buffered = [];

  const isOpen = () => ws !== null && ws.readyState === WebSocketImpl.OPEN;

  const detach = (socket) => {
    socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
    try { socket.close(); } catch { /* already closed */ }
  };

  const clearReconnect = () => {
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const flushBuffered = () => {
    const pending = buffered;
    buffered = [];
    for (const message of pending) ws.send(message);
  };

  const scheduleReconnect = () => {
    if (!active || reconnectTimer !== null) return;
    const delay = backoffMs[reconnectAttempt] ?? MAX_BACKOFF_MS;
    reconnectAttempt += 1;
    onStatus?.('connecting', 'Reconnecting...');
    reconnectTimer = setTimeoutFn(() => {
      reconnectTimer = null;
      if (!active) return;
      // eslint-disable-next-line no-use-before-define
      open().catch(() => scheduleReconnect());
    }, delay);
  };

  const open = () => new Promise((resolve, reject) => {
    if (ws) {
      const old = ws;
      ws = null;
      detach(old);
    }

    let settled = false;
    const socket = new WebSocketImpl(url, ['realtime', `openai-insecure-api-key.${apiKey}`]);
    ws = socket;

    const fail = (reason) => {
      if (settled) return;
      settled = true;
      clearTimeoutFn(timeoutId);
      if (ws === socket) ws = null;
      detach(socket);
      reject(new Error(reason));
    };

    const timeoutId = setTimeoutFn(() => fail('Connection timeout'), connectTimeoutMs);

    socket.onopen = () => {
      if (settled) return;
      settled = true;
      clearTimeoutFn(timeoutId);
      openedAt = Date.now();
      reconnectAttempt = 0;
      onOpen?.();
      flushBuffered();
      resolve(true);
    };

    socket.onmessage = (e) => {
      let event;
      try {
        event = JSON.parse(e.data);
      } catch {
        return;
      }
      onEvent?.(event);
    };

    socket.onerror = () => fail('Connection error');

    socket.onclose = (e) => {
      if (!settled) {
        fail('Connection closed before opening');
        return;
      }
      if (ws === socket) ws = null;
      onClose?.({ intentional: !active, code: e?.code, reason: e?.reason });
      scheduleReconnect();
    };
  });

  return {
    connect(key) {
      if (!key) return Promise.reject(new Error('API Key not found'));
      apiKey = key;
      active = true;
      reconnectAttempt = 0;
      clearReconnect();
      return open().catch((err) => {
        // The initial attempt is retried by the caller, not here
        active = false;
        throw err;
      });
    },

    disconnect() {
      active = false;
      apiKey = null;
      buffered = [];
      clearReconnect();
      if (ws) {
        const socket = ws;
        ws = null;
        detach(socket);
        onClose?.({ intentional: true });
      }
    },

    /** Close the current socket and reconnect right away (session refresh). */
    rotate() {
      if (!active || !ws) return;
      const socket = ws;
      ws = null;
      detach(socket);
      onClose?.({ intentional: false, rotated: true });
      clearReconnect();
      reconnectAttempt = 0;
      open().catch(() => scheduleReconnect());
    },

    send(data) {
      if (!isOpen()) return false;
      ws.send(JSON.stringify(data));
      return true;
    },

    /** Like send(), but buffers while a reconnect is pending. */
    sendBuffered(data) {
      if (isOpen()) {
        ws.send(JSON.stringify(data));
        return true;
      }
      if (!active) return false;
      buffered.push(JSON.stringify(data));
      if (buffered.length > maxBufferedMessages) buffered.shift();
      return false;
    },

    isOpen,
    isActive: () => active,
    sessionAgeMs: () => (openedAt ? Date.now() - openedAt : 0),
  };
}
