import { cardStyle, cellStyle, fmtRelative, fmtTime, fmtValue, mutedText } from './infraShared';
import { explainAlarm } from './infraAlarmHelp';

/* Read-only sections of the Infra tab: alarms, ECS services, DLQs, audit log. */

function Unavail({ reason }) {
  return (
    <p className="text-xs" style={{ color: 'var(--warning)' }}>
      Status unavailable{reason ? ` — ${reason}` : ''}.
    </p>
  );
}

function Empty({ colSpan, text }) {
  return (
    <tr><td colSpan={colSpan} className="px-3 py-4 text-xs" style={mutedText}>{text}</td></tr>
  );
}

function Th({ children }) {
  return <th className="px-3 py-2 font-medium border-b" style={cellStyle}>{children}</th>;
}

function Td({ children, strong, mono }) {
  return (
    <td
      className={`px-3 py-2 border-b ${mono ? 'font-mono break-all' : ''}`}
      style={{ ...cellStyle, color: strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}
    >
      {children}
    </td>
  );
}

export function AlarmStrip({ alarms, error }) {
  if (error || !Array.isArray(alarms)) {
    return (
      <div className="rounded-xl border px-4 py-3" style={cardStyle}>
        <Unavail reason={error || 'alarms not loaded'} />
      </div>
    );
  }
  if (alarms.length === 0) {
    return (
      <div className="rounded-xl border px-4 py-3 text-xs" style={{ ...cardStyle, color: 'var(--success)' }}>
        No alarms
      </div>
    );
  }
  return (
    <div className="rounded-xl border px-4 py-3" style={{ ...cardStyle, borderColor: 'var(--error)' }}>
      <div className="text-xs font-semibold mb-1" style={{ color: 'var(--error)' }}>
        {alarms.length} alarm{alarms.length === 1 ? '' : 's'} firing
      </div>
      <ul className="text-xs space-y-1">
        {alarms.map((a) => {
          const help = explainAlarm(a.name, a.description);
          return (
            <li key={a.name}>
              <div style={{ color: 'var(--text-primary)' }}>{help.text || a.name}</div>
              <div className="text-2xs" style={mutedText}>
                {help.look && <span>Look at: <span style={{ color: 'var(--text-secondary)' }}>{help.look}</span> · </span>}
                since {fmtTime(a.since)} ({fmtRelative(a.since)}) · <code>{a.name}</code>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function EcsTable({ ecs, error }) {
  if (error || !Array.isArray(ecs)) return <Unavail reason={error || 'ECS not loaded'} />;
  return (
    <div className="rounded-xl border overflow-x-auto" style={cardStyle}>
      <table className="w-full text-left text-xs" style={{ minWidth: '560px' }}>
        <thead>
          <tr className="text-2xs" style={mutedText}>
            <Th>Service</Th><Th>Running / desired</Th><Th>Pending</Th><Th>Rollout</Th><Th>Min / max</Th>
          </tr>
        </thead>
        <tbody>
          {ecs.length === 0 && <Empty colSpan={5} text="No services reported." />}
          {ecs.map((s) => (
            <tr key={s.service}>
              <Td strong>{s.service}</Td>
              <Td>
                <span style={{ color: s.running < s.desired ? 'var(--warning)' : undefined }}>{s.running} / {s.desired}</span>
              </Td>
              <Td>{s.pending ?? '—'}</Td>
              <Td>
                <span style={{ color: s.rollout && s.rollout !== 'COMPLETED' ? 'var(--warning)' : undefined }}>{s.rollout || '—'}</span>
              </Td>
              <Td>{s.min ?? '—'} / {s.max ?? '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DlqSection({ dlqs, deadLetters, dlqError, deadLettersError }) {
  return (
    <div className="space-y-3">
      {dlqError || !Array.isArray(dlqs) ? (
        <Unavail reason={dlqError || 'DLQs not loaded'} />
      ) : (
        <div className="flex flex-wrap gap-3">
          {dlqs.length === 0 && <p className="text-xs" style={mutedText}>No DLQs reported.</p>}
          {dlqs.map((d) => {
            const depth = (Number(d.visible) || 0) + (Number(d.in_flight) || 0);
            return (
              <div key={d.name} className="rounded-xl border px-4 py-2 tabular-nums" style={{ ...cardStyle, borderColor: depth ? 'var(--error)' : cardStyle.borderColor }}>
                <div className="text-2xs" style={mutedText}>{d.name}</div>
                <div className="text-sm font-semibold" style={{ color: depth ? 'var(--error)' : 'var(--text-primary)' }}>
                  {d.visible} <span className="text-2xs font-normal" style={mutedText}>visible · {d.in_flight} in flight</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {deadLettersError || !Array.isArray(deadLetters) ? (
        <Unavail reason={deadLettersError || 'dead letters not loaded'} />
      ) : (
        <div className="rounded-xl border overflow-x-auto" style={cardStyle}>
          <table className="w-full text-left text-xs" style={{ minWidth: '640px' }}>
            <thead>
              <tr className="text-2xs" style={mutedText}>
                <Th>At</Th><Th>Kind</Th><Th>Conversation</Th><Th>Outcome</Th><Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {deadLetters.length === 0 && <Empty colSpan={5} text="No recent dead letters." />}
              {deadLetters.map((d, i) => (
                <tr key={`${d.at}-${d.conversation_id}-${i}`}>
                  <Td>{fmtTime(d.at)}</Td>
                  <Td>{d.kind}</Td>
                  <Td mono>{d.conversation_id || '—'}</Td>
                  <Td>{d.outcome || '—'}</Td>
                  <Td>{d.reason || '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AuditTable({ audit, error }) {
  if (error) return <Unavail reason={error} />;
  return (
    <div className="rounded-xl border overflow-x-auto" style={cardStyle}>
      <table className="w-full text-left text-xs" style={{ minWidth: '820px' }}>
        <thead>
          <tr className="text-2xs" style={mutedText}>
            <Th>At</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Before → after</Th><Th>Reason</Th><Th>Expires</Th>
          </tr>
        </thead>
        <tbody>
          {audit === null && <Empty colSpan={7} text="Loading…" />}
          {audit !== null && audit.length === 0 && <Empty colSpan={7} text="No admin actions recorded." />}
          {(audit || []).map((a, i) => (
            <tr key={`${a.at}-${a.action}-${i}`} className="align-top">
              <Td>{fmtTime(a.at)}</Td>
              <Td>{a.actor || '—'}</Td>
              <Td strong>{a.action}</Td>
              <Td mono>{fmtValue(a.target)}</Td>
              <Td mono>{fmtValue(a.before)} → {fmtValue(a.after)}</Td>
              <Td>{a.reason || '—'}</Td>
              <Td>{a.expires_at ? fmtTime(a.expires_at) : '—'}</Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
