import { useEffect, useState } from 'react';

/**
 * Text for a screen-reader live region. The region itself must exist before its text changes or
 * many readers stay silent, so this returns '' on the first render and the phrase a moment later;
 * after that every new phrase is announced as it changes. Pass '' for "say nothing".
 */
export function useAnnounce(phrase, delayMs = 60) {
  const [spoken, setSpoken] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSpoken(phrase || ''), delayMs);
    return () => clearTimeout(id);
  }, [phrase, delayMs]);
  return spoken;
}
