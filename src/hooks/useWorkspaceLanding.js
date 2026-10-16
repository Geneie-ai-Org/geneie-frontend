import { useCallback, useEffect, useRef, useState } from 'react';

const NOTE_MS = { opened: 6500, here: 4500, flag: 9000 };

/**
 * Landing cues for the workbench: when work arrives for a tab, say so quietly.
 *
 * `land(tabId, text, mode)`:
 *  - `opened`: the panel was closed and has just opened on that tab. A short note under the tab strip.
 *  - `here`:   the user is already looking at that tab. Same short note, nothing to flag.
 *  - `flag`:   the panel is open on another tab. The user is NOT moved: the arriving tab gets a dot,
 *              a "View" note stays a little longer, and the thread shows a pill until the tab is seen.
 * A flagged tab is cleared as soon as it is the active tab of an open panel.
 */
export function useWorkspaceLanding({ resetKey, panelOpen, activeTab }) {
  const [pending, setPending] = useState({}); // tabId -> { id, text }
  const [note, setNote] = useState(null); // { id, tabId, text, actionable }
  const counter = useRef(0);

  useEffect(() => {
    setPending({});
    setNote(null);
  }, [resetKey]);

  const land = useCallback((tabId, text, mode = 'flag') => {
    const id = ++counter.current;
    if (mode === 'flag') setPending((p) => ({ ...p, [tabId]: { id, text } }));
    setNote({ id, tabId, text, actionable: mode === 'flag' });
  }, []);

  // Seen: the tab is in front of the user.
  useEffect(() => {
    if (!panelOpen || !activeTab) return;
    setPending((p) => {
      if (!p[activeTab]) return p;
      const next = { ...p };
      delete next[activeTab];
      return next;
    });
    setNote((n) => (n && n.actionable && n.tabId === activeTab ? null : n));
  }, [panelOpen, activeTab]);

  // The note fades by itself.
  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(
      () => setNote((n) => (n && n.id === note.id ? null : n)),
      note.actionable ? NOTE_MS.flag : NOTE_MS.opened
    );
    return () => clearTimeout(t);
  }, [note]);

  const dismissNote = useCallback(() => setNote(null), []);

  return { pending, note, land, dismissNote };
}
