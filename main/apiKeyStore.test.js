import { describe, it, expect } from 'vitest';
import { createApiKeyStore } from './apiKeyStore.js';

function fakeDeps({ encryptionAvailable = true, envKey = '' } = {}) {
  const files = new Map();
  return {
    files,
    deps: {
      filePath: '/tmp/api-key.enc',
      env: { OPENAI_API_KEY: envKey },
      safeStorage: {
        isEncryptionAvailable: () => encryptionAvailable,
        encryptString: (s) => Buffer.from(`enc:${s}`),
        decryptString: (b) => b.toString().replace(/^enc:/, ''),
      },
      fs: {
        readFileSync: (p) => { if (!files.has(p)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } return files.get(p); },
        writeFileSync: (p, data) => files.set(p, Buffer.from(data)),
        unlinkSync: (p) => files.delete(p),
        existsSync: (p) => files.has(p),
      },
    },
  };
}

describe('createApiKeyStore', () => {
  it('stores the key encrypted and reads it back', () => {
    const { deps, files } = fakeDeps();
    const store = createApiKeyStore(deps);
    store.set('sk-test');
    expect(files.get('/tmp/api-key.enc').toString()).toBe('enc:sk-test');
    expect(store.getStored()).toBe('sk-test');
  });

  it('prefers the stored key over the environment key', () => {
    const { deps } = fakeDeps({ envKey: 'sk-env' });
    const store = createApiKeyStore(deps);
    expect(store.getEffective()).toBe('sk-env');
    store.set('sk-stored');
    expect(store.getEffective()).toBe('sk-stored');
    expect(store.info()).toEqual({ storedKey: 'sk-stored', hasEnvKey: true });
  });

  it('deletes the file when set to empty', () => {
    const { deps, files } = fakeDeps();
    const store = createApiKeyStore(deps);
    store.set('sk-test');
    store.set('');
    expect(files.size).toBe(0);
    expect(store.getStored()).toBe('');
  });

  it('refuses to persist when OS encryption is unavailable', () => {
    const { deps, files } = fakeDeps({ encryptionAvailable: false });
    const store = createApiKeyStore(deps);
    expect(() => store.set('sk-test')).toThrow(/encryption/i);
    expect(files.size).toBe(0);
  });
});
