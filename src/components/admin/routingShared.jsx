import { useState } from 'react';
import { parseCanaryUsers } from '@/services/infraApi';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { StatusChip, areaCls, selectCls, DANGER_BTN } from './adminUi';
import { Field } from './infraShared';

/* Pieces the Data plane and Exomiser fast-path cards have in common. Neither writes anything:
 * they call back so each card builds its own confirm request. */

export function depth(q) {
  if (!q) return '–';
  return `${q.visible ?? 0} waiting / ${q.in_flight ?? 0} running`;
}

/** A named switch: current state as a word, the one-line effect, and an outline button. */
export function ToggleRow({ label, help, on, blocked, danger, onToggle }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-[hsl(var(--wb-line))] py-2.5 first:border-t-0">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-foreground">
          {label}
          <StatusChip tone={on ? (danger ? 'warning' : 'success') : 'muted'}>{on ? 'On' : 'Off'}</StatusChip>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{help}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={Boolean(blocked)}
        onClick={onToggle}
        className={cn(
          'shrink-0 max-md:h-10',
          danger && !on && DANGER_BTN,
        )}
      >
        Turn {on ? 'off' : 'on'}…
      </Button>
    </div>
  );
}

/** Accounts (email or id, one per line) that get a chosen path regardless of the main setting. */
export function CanaryEditor({ users, backend, options, blocked, intro, dangerValue, onSaveUsers, onSavePath }) {
  const [text, setText] = useState(null);
  const [pick, setPick] = useState(null);
  const draft = text ?? users.join('\n');
  const list = parseCanaryUsers(draft);
  const chosen = pick ?? backend;
  const disabled = Boolean(blocked);
  const same = JSON.stringify(list) === JSON.stringify(users);
  return (
    <div className="border-t border-[hsl(var(--wb-line))] pt-3">
      <h3 className="mb-1 text-[13px] font-medium text-foreground">Canary accounts</h3>
      <p className="mb-2 text-xs text-muted-foreground">{intro}</p>
      <div className="flex flex-wrap items-start gap-3">
        <Field label="Accounts" hint="email or user id, one per line" className="min-w-[240px] flex-1">
          <textarea
            value={draft}
            rows={3}
            disabled={disabled}
            onChange={(e) => setText(e.target.value)}
            className={cn(areaCls, 'font-mono text-xs')}
          />
        </Field>
        <Field label="Path for these accounts">
          <select value={chosen} disabled={disabled} onChange={(e) => setPick(e.target.value)} className={cn(selectCls, 'max-md:h-10')}>
            {options.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
        <div className="flex flex-col gap-1.5 pt-[18px]">
          <Button variant="outline" size="sm" disabled={disabled || same} onClick={() => onSaveUsers(users, list)}>Save accounts…</Button>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled || chosen === backend}
            onClick={() => onSavePath(backend, chosen)}
            className={cn(chosen === dangerValue && DANGER_BTN)}
          >
            Save path…
          </Button>
        </div>
      </div>
    </div>
  );
}
