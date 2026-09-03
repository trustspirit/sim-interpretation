/**
 * Encrypted at-rest storage for the OpenAI API key using Electron safeStorage.
 * Dependencies are injected so the logic can be unit tested without Electron.
 */
export function createApiKeyStore({ filePath, env, safeStorage, fs }) {
  const getStored = () => {
    try {
      const encrypted = fs.readFileSync(filePath);
      return safeStorage.decryptString(encrypted);
    } catch (err) {
      if (err?.code !== 'ENOENT') console.warn('[apiKeyStore] read failed:', err?.message);
      return '';
    }
  };

  const set = (value) => {
    const key = (value || '').trim();
    if (!key) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return;
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('OS encryption is not available; refusing to store the API key in plain text');
    }
    fs.writeFileSync(filePath, safeStorage.encryptString(key));
  };

  const getEnv = () => (env.OPENAI_API_KEY || '').trim();
  const getEffective = () => getStored() || getEnv();
  const info = () => ({ storedKey: getStored(), hasEnvKey: !!getEnv() });

  return { getStored, set, getEffective, info };
}
