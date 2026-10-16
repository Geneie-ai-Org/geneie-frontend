import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * State holders for the report viewer. Both are keyed by `resetKey` (the conversation): when it
 * changes the old document is dropped and any request still in flight is ignored. Each document
 * also remembers the `key` (a signature of the picks) it was built from, so the caller can tell
 * when it is out of date. Nothing here ever fetches by itself: `load` is called by a user action.
 */
const IDLE_DOC = { forKey: undefined, state: 'idle', html: null, error: null, key: null };
const IDLE_PDF = { forKey: undefined, state: 'idle', url: null, blob: null, filename: null, error: null, key: null };

export function useReportDoc(resetKey) {
  const [s, setS] = useState(IDLE_DOC);
  const req = useRef(0);
  const ctl = useRef(null);
  const keyRef = useRef(resetKey);
  keyRef.current = resetKey;

  useEffect(() => () => { req.current += 1; ctl.current?.abort(); }, [resetKey]);

  const load = useCallback(async (fetcher, key) => {
    ctl.current?.abort();
    const controller = new AbortController();
    ctl.current = controller;
    const id = ++req.current;
    const forKey = keyRef.current;
    setS({ forKey, state: 'fetching', html: null, error: null, key });
    try {
      const html = await fetcher(controller.signal);
      if (id !== req.current) return;
      setS({ forKey, state: 'ready', html, error: null, key });
    } catch (err) {
      if (id !== req.current || err?.name === 'AbortError') return;
      setS({ forKey, state: 'error', html: null, error: err?.message || 'Could not build the preview', key });
    }
  }, []);

  const view = s.forKey === resetKey ? s : IDLE_DOC;
  return { ...view, load };
}

export function useReportPdf(resetKey) {
  const [s, setS] = useState(IDLE_PDF);
  const urlRef = useRef(null);
  const req = useRef(0);
  const ctl = useRef(null);
  const keyRef = useRef(resetKey);
  keyRef.current = resetKey;

  const revoke = () => {
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  };
  // New conversation or unmount: drop the blob URL and ignore whatever is still loading.
  useEffect(() => () => { req.current += 1; ctl.current?.abort(); revoke(); }, [resetKey]);

  /** Store bytes we already have (a generation the user ran, or a fetched PDF). */
  const set = useCallback((blob, filename, key) => {
    revoke();
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    setS({ forKey: keyRef.current, state: 'ready', url, blob, filename, error: null, key });
  }, []);

  /** Fetch bytes for viewing (never downloads). */
  const load = useCallback(async (fetcher, key) => {
    ctl.current?.abort();
    const controller = new AbortController();
    ctl.current = controller;
    const id = ++req.current;
    const forKey = keyRef.current;
    revoke();
    setS({ forKey, state: 'fetching', url: null, blob: null, filename: null, error: null, key });
    try {
      const { blob, filename } = await fetcher(controller.signal);
      if (id !== req.current) return;
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      setS({ forKey, state: 'ready', url, blob, filename, error: null, key });
    } catch (err) {
      if (id !== req.current || err?.name === 'AbortError') return;
      setS({ forKey, state: 'error', url: null, blob: null, filename: null, error: err?.message || 'Could not load the PDF', key });
    }
  }, []);

  const view = s.forKey === resetKey ? s : IDLE_PDF;
  return { ...view, set, load };
}
