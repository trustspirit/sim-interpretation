/**
 * Re-aligns a byte stream into int16-sized pieces. Streamed PCM16 bodies can
 * split in the middle of a sample; the odd byte is carried to the next push.
 */
export function createPcmChunker() {
  let carry = null;

  return {
    push(bytes) {
      let data = bytes;
      if (carry !== null) {
        data = new Uint8Array(bytes.length + 1);
        data[0] = carry;
        data.set(bytes, 1);
        carry = null;
      }
      const evenLength = data.length - (data.length % 2);
      if (evenLength < data.length) carry = data[data.length - 1];
      if (evenLength < 2) return null;
      return data.slice(0, evenLength);
    },
  };
}
