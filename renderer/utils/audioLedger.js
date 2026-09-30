/**
 * Keeps sent audio until the server has transcribed it, so a dropped
 * connection loses nothing: whatever wasn't transcribed yet is replayed on
 * the next session.
 *
 * Audio is grouped into segments, one per commit. The open segment collects
 * new chunks; `committed(itemId)` closes it (server commit events arrive in
 * order); `confirmed(itemId)` forgets a segment once its transcript arrived.
 */
const MIN_REPLAY_COMMIT_CHUNKS = 2;

export function createAudioLedger({ maxChunks = 600 } = {}) {
  // { chunks: string[], committed: boolean, itemId: string|null }
  let segments = [];
  let open = { chunks: [], committed: false, itemId: null };
  let total = 0;

  const trim = () => {
    while (total > maxChunks && segments.length) {
      total -= segments.shift().chunks.length;
    }
    if (total > maxChunks) {
      const excess = total - maxChunks;
      open.chunks.splice(0, excess);
      total -= excess;
    }
  };

  return {
    record(chunk) {
      open.chunks.push(chunk);
      total += 1;
      trim();
    },

    /** A server commit event. Replayed segments are matched first, in order. */
    committed(itemId) {
      const replayed = segments.find((s) => s.committed && s.itemId === null);
      if (replayed) {
        replayed.itemId = itemId ?? '';
        return;
      }
      if (!open.chunks.length) return;
      segments.push({ ...open, committed: true, itemId: itemId ?? '' });
      open = { chunks: [], committed: false, itemId: null };
    },

    confirmed(itemId) {
      const index = segments.findIndex((s) => s.itemId === itemId);
      if (index < 0) return;
      total -= segments[index].chunks.length;
      segments.splice(index, 1);
    },

    /**
     * Everything not yet transcribed, oldest first. The ledger then expects the
     * caller to resend it: committed segments await new commit events, and the
     * open segment stays open.
     */
    takeForReplay() {
      // A commit shorter than this is rejected by the server ("buffer too small")
      // and would never get a commit event to match
      const dropped = segments.filter((s) => s.chunks.length < MIN_REPLAY_COMMIT_CHUNKS);
      dropped.forEach((s) => { total -= s.chunks.length; });
      segments = segments.filter((s) => s.chunks.length >= MIN_REPLAY_COMMIT_CHUNKS);
      const pending = segments.map((s) => ({ chunks: s.chunks, commit: true }));
      if (open.chunks.length) pending.push({ chunks: open.chunks, commit: false });
      segments = segments.map((s) => ({ ...s, itemId: null }));
      return pending;
    },

    reset() {
      segments = [];
      open = { chunks: [], committed: false, itemId: null };
      total = 0;
    },

    size: () => total,
  };
}
