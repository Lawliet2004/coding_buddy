// Shared bug-task tokenization for router ranking and memory updates.
// Both `taskRouter.js` and `memoryStore.js` need to agree on whether a task is
// bug-like. This module centralizes the canonical word set and tokenizer so the
// two flows never diverge.

export const BUG_TASK_WORDS = new Set([
  'bug',
  'fix',
  'broken',
  'failing',
  'failure',
  'regression',
  'crash',
  'wrong',
  'issue',
  'defect'
]);

// Tokenize task text. Lowercases, splits camelCase (when there is no
// whitespace), and emits suffix variants (fixing -> fix, plurals stripped) so
// ranking and memory agree on bug-likeness.
export function tokenizeTaskText(value) {
  let text = String(value);
  if (!/\s/.test(text)) {
    text = text.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .flatMap((token) => {
      const variants = [token];
      if (token.endsWith('ing') && token.length > 5) variants.push(token.slice(0, -3));
      if (token.endsWith('s') && token.length > 3) variants.push(token.slice(0, -1));
      return variants;
    });
}

export function isBugTaskToken(token) {
  return BUG_TASK_WORDS.has(token);
}

export function isBugLikeTaskText(value) {
  return tokenizeTaskText(value).some(isBugTaskToken);
}
