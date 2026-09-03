/**
 * Apply a language change to one side of the pair. Picking the language that
 * the other side already uses swaps them, so A and B are never identical.
 */
export function resolveLanguagePair(current, side, code) {
  const other = side === 'langA' ? 'langB' : 'langA';
  if (current[other] === code) {
    return { [side]: code, [other]: current[side] };
  }
  return { ...current, [side]: code };
}
