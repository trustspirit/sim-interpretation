/**
 * LLM-based sentence completion check using GPT-4o-mini.
 * Used as a secondary filter when rule-based heuristics say "complete".
 * Fail-open: returns true on any error/timeout so translation proceeds.
 */

const SENTENCE_CHECK_TIMEOUT_MS = 2000;

export async function checkSentenceCompletion(text, apiKey) {
  if (!apiKey || !text?.trim()) {
    return true; // fail-open
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SENTENCE_CHECK_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Reply with exactly one character: Y if the text is a grammatically complete, translatable sentence. N if it is incomplete or cut off. No other output.',
          },
          {
            role: 'user',
            content: text,
          },
        ],
        max_tokens: 1,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      clearTimeout(timeoutId);
      console.warn('[LLM Check] API error:', response.status);
      return true; // fail-open
    }

    const data = await response.json();
    clearTimeout(timeoutId);

    const firstChar = data.choices?.[0]?.message?.content?.trim()?.[0]?.toUpperCase();
    const isComplete = firstChar !== 'N';

    console.log(`[LLM Check] "${text.substring(0, 40)}..." → ${answer} (complete: ${isComplete})`);
    return isComplete;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.warn('[LLM Check] Timeout after', SENTENCE_CHECK_TIMEOUT_MS, 'ms');
    } else {
      console.warn('[LLM Check] Error:', err.message);
    }
    return true; // fail-open
  }
}
