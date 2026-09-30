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
 *   next open, so a dropped connection doesn't drop the words spoken meanwhile.
 * - rotate() refreshes the session without a gap: the replacement socket is
 *   opened while audio keeps flowing to the current one, then audio switches
 *   over and the old socket stays open for a grace period so speech it already
 *   received is still transcribed (events arrive with `{ retired: true }`).
 */
export function createRealtimeSocket({
  url,
  onOpen,
  onEvent,
  onStatus,
  onClose,
  onRetire,
  onRetireEnd,
  WebSocketImpl = globalThis.WebSocket,
  connectTimeoutMs = 8000,
  maxBufferedMessages = 300,
  retireGraceMs = 6000,
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
  let rotating = false;
  let connectSeq = 0; // bumped by connect()/disconnect() so a stale attempt can't act on a newer session
  const retired = new Map(); // socket -> grace timer

  const isOpenSocket = (socket) => socket !== null && socket.readyState === WebSocketImpl.OPEN;
  const isOpen = () => isOpenSocket(ws);

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

  const endRetired = (socket) => {
    if (!retired.has(socket)) return;
    clearTimeoutFn(retired.get(socket));
    retired.delete(socket);
    detach(socket);
    onRetireEnd?.();
  };

  const endAllRetired = () => {
    for (const socket of [...retired.keys()]) endRetired(socket);
  };

  // Keep the old socket around only to receive results for audio it already has
  const retire = (socket) => {
    socket.onerror = null;
    socket.onclose = () => endRetired(socket);
    socket.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }
      onEvent?.(event, { retired: true });
    };
    const sendToOld = (data) => {
      if (!isOpenSocket(socket)) return false;
      socket.send(JSON.stringify(data));
      return true;
    };
    retired.set(socket, setTimeoutFn(() => endRetired(socket), retireGraceMs));
    onRetire?.(sendToOld);
  };

  const scheduleReconnect = () => {
    if (!active || reconnectTimer !== null || rotating) return;
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

  /**
   * Open a socket. With `replace`, the current socket keeps carrying audio
   * until the new one is ready, and is then retired instead of closed.
   */
  const open = ({ replace = false } = {}) => new Promise((resolve, reject) => {
    if (ws && !replace) {
      const old = ws;
      ws = null;
      detach(old);
    }

    let settled = false;
    const socket = new WebSocketImpl(url, ['realtime', `openai-insecure-api-key.${apiKey}`]);
    if (!replace) ws = socket;

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
      if (!active) {
        detach(socket);
        reject(new Error('Disconnected'));
        return;
      }
      const previous = ws;
      ws = socket;
      if (replace && previous && previous !== socket) retire(previous);
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
      onEvent?.(event, { retired: false });
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
      const seq = ++connectSeq;
      apiKey = key;
      active = true;
      reconnectAttempt = 0;
      clearReconnect();
      return open().catch((err) => {
        // The initial attempt is retried by the caller, not here. A stale
        // attempt (disconnect() or a newer connect() happened meanwhile)
        // leaves the current session alone.
        if (seq === connectSeq) active = false;
        throw err;
      });
    },

    disconnect() {
      connectSeq += 1;
      active = false;
      apiKey = null;
      buffered = [];
      rotating = false;
      clearReconnect();
      endAllRetired();
      if (ws) {
        const socket = ws;
        ws = null;
        detach(socket);
        onClose?.({ intentional: true });
      }
    },

    /** Refresh the session without interrupting the audio stream. */
    rotate() {
      if (!active || !isOpen() || rotating) return;
      rotating = true;
      open({ replace: true })
        .catch(() => {
          // Replacement failed: if the current socket died meanwhile, reconnect normally
          if (!isOpen()) {
            rotating = false;
            scheduleReconnect();
          }
        })
        .finally(() => { rotating = false; });
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
    isRotating: () => rotating,
    sessionAgeMs: () => (openedAt ? Date.now() - openedAt : 0),
  };
}
