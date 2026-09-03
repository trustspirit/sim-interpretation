/**
 * Emits values strictly in the order their slots were reserved, regardless of
 * the order in which they resolve. Resolving a slot with null/undefined skips it.
 */
export function createOrderedEmitter(emit) {
  let generation = 0;
  let nextReserve = 0;
  let nextEmit = 0;
  const results = new Map();

  const drain = () => {
    while (results.has(nextEmit)) {
      const value = results.get(nextEmit);
      results.delete(nextEmit);
      nextEmit += 1;
      if (value !== null && value !== undefined) emit(value);
    }
  };

  return {
    reserve() {
      return { generation, index: nextReserve++ };
    },
    resolve(slot, value) {
      if (!slot || slot.generation !== generation) return;
      results.set(slot.index, value ?? null);
      drain();
    },
    reset() {
      generation += 1;
      nextReserve = 0;
      nextEmit = 0;
      results.clear();
    },
    pending() {
      return nextReserve - nextEmit - results.size;
    },
  };
}
