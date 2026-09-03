import { describe, it, expect } from 'vitest';
import { createOrderedEmitter } from './orderedEmitter';

describe('createOrderedEmitter', () => {
  it('emits results in reservation order even when they resolve out of order', () => {
    const out = [];
    const q = createOrderedEmitter((v) => out.push(v));
    const first = q.reserve();
    const second = q.reserve();
    q.resolve(second, 'B');
    expect(out).toEqual([]);
    q.resolve(first, 'A');
    expect(out).toEqual(['A', 'B']);
  });

  it('skips a slot resolved with null and continues with the next', () => {
    const out = [];
    const q = createOrderedEmitter((v) => out.push(v));
    const first = q.reserve();
    const second = q.reserve();
    q.resolve(second, 'B');
    q.resolve(first, null);
    expect(out).toEqual(['B']);
  });

  it('drops results for slots reserved before reset', () => {
    const out = [];
    const q = createOrderedEmitter((v) => out.push(v));
    const stale = q.reserve();
    q.reset();
    const fresh = q.reserve();
    q.resolve(stale, 'old');
    q.resolve(fresh, 'new');
    expect(out).toEqual(['new']);
  });

  it('reports how many slots are still pending', () => {
    const q = createOrderedEmitter(() => {});
    const a = q.reserve();
    q.reserve();
    expect(q.pending()).toBe(2);
    q.resolve(a, 'x');
    expect(q.pending()).toBe(1);
  });
});
