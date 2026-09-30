/**
 * Translation models, best first. Each entry carries the request parameters it
 * accepts: reasoning models reject `temperature` and take `reasoning_effort`
 * and `max_completion_tokens` instead.
 *
 * If a model is unavailable to this API key or rejects a parameter, the next
 * entry is used for the rest of the app session, so a new model never takes
 * translation down.
 */
export const TRANSLATION_MODELS = [
  // Lightweight tier for high-volume, latency-sensitive work; no reasoning needed
  { model: 'gpt-6-luna', params: { reasoning_effort: 'none', max_completion_tokens: 600 } },
  { model: 'gpt-6-luna', params: { reasoning_effort: 'low', max_completion_tokens: 1200 } },
  { model: 'gpt-5.4-mini', params: { reasoning_effort: 'none', max_completion_tokens: 600 } },
  // Non-reasoning fallback, supports temperature
  { model: 'gpt-4.1-mini', params: { temperature: 0.2, max_tokens: 600 } },
];

const MODEL_REJECTION_PARAMS = new Set([
  'model', 'reasoning_effort', 'temperature', 'max_tokens', 'max_completion_tokens', 'response_format',
]);
const MODEL_REJECTION_CODES = new Set([
  'model_not_found', 'unsupported_parameter', 'unsupported_value', 'invalid_model',
]);

/**
 * True when an API error means "this model/parameter combination can't be used",
 * as opposed to a transient failure or a problem with the text itself.
 */
export function isModelRejection(status, error) {
  if (status === 404) return true;
  if (status !== 400 && status !== 403) return false;
  if (!error) return false;
  if (MODEL_REJECTION_CODES.has(error.code)) return true;
  if (MODEL_REJECTION_PARAMS.has(error.param)) return true;
  return /model|not supported|unsupported|does not exist|do not have access/i.test(error.message || '');
}

export function createModelSelector(models = TRANSLATION_MODELS) {
  let index = 0;
  return {
    current: () => models[Math.min(index, models.length - 1)],
    /** Move past `entry` if it's still the active one. Returns false when none are left. */
    reject(entry) {
      if (models[index] !== entry) return index < models.length;
      if (index >= models.length - 1) return false;
      index += 1;
      return true;
    },
  };
}
