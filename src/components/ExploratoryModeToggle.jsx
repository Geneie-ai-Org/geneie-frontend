import { useEffect, useState } from 'react';

/**
 * Floating toggle for Strands exploratory (agentic) mode.
 * Self-contained: stores the flag in localStorage under 'geneie_exploratory_mode'
 * ('on' | absent), which useChatMessaging reads when building the chat request.
 * Intentionally minimal + isolated so it's easy to remove after the teammate trial.
 */
const KEY = 'geneie_exploratory_mode';

export default function ExploratoryModeToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(window.localStorage?.getItem(KEY) === 'on');
  }, []);

  const toggle = () => {
    const next = !on;
    setOn(next);
    if (next) window.localStorage.setItem(KEY, 'on');
    else window.localStorage.removeItem(KEY);
  };

  return (
    <button
      onClick={toggle}
      title="Toggle exploratory (agentic) mode. Off = standard reproducible pipeline."
      style={{
        position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 14px', borderRadius: 999,
        border: '1px solid rgba(0,0,0,0.12)',
        background: on ? '#2b6cb0' : '#f4f4f6',
        color: on ? '#fff' : '#5c5c66',
        font: '600 12px -apple-system, system-ui, sans-serif',
        cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 999,
        background: on ? '#8fce9b' : '#b8b8c0',
      }} />
      {on ? 'Exploratory mode: ON' : 'Exploratory mode: off'}
    </button>
  );
}
