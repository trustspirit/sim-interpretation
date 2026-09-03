import { describe, it, expect } from 'vitest';
import { createPcmChunker } from './pcmChunker';

describe('createPcmChunker', () => {
  it('returns only int16-aligned bytes and carries the odd byte forward', () => {
    const chunker = createPcmChunker();
    const first = chunker.push(new Uint8Array([1, 2, 3]));
    expect(Array.from(first)).toEqual([1, 2]);
    const second = chunker.push(new Uint8Array([4, 5, 6]));
    expect(Array.from(second)).toEqual([3, 4, 5, 6]);
  });

  it('returns null when fewer than two bytes are available', () => {
    const chunker = createPcmChunker();
    expect(chunker.push(new Uint8Array([9]))).toBeNull();
    expect(Array.from(chunker.push(new Uint8Array([8])))).toEqual([9, 8]);
  });
});
