/** Shown as a chip after GA, and sent automatically in Automatic mode. */
export const GA_BEST_MATCH_PROMPT =
  'what is the variant which matches the observed clinical significance the most? are there any other variants which need to be considered along with it?';

export function gaRankingReady(status) {
  const s = String(status || '').toLowerCase();
  return s === 'completed' || s === 'ready';
}
