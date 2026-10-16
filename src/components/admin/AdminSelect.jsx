import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Drop-in replacement for the native <select> used across the admin cards. Same call shape as before:
 * `<AdminSelect value onChange={(e) => set(e.target.value)} disabled aria-label>` with <option> children.
 * `onChange` receives `{ target: { value } }`, so existing handlers keep working unchanged. Renders the shared
 * pill Select (menu motion, sliding highlight, typeahead, selected mark). An option with value "" acts as a
 * placeholder row, exactly like the native element did.
 */
function readOptions(children) {
  const out = [];
  React.Children.forEach(children, (c) => {
    if (!React.isValidElement(c) || c.type !== 'option') return;
    const label = c.props.children;
    out.push({
      value: String(c.props.value ?? (typeof label === 'string' ? label : '')),
      label,
      disabled: Boolean(c.props.disabled),
    });
  });
  return out;
}

export default function AdminSelect({
  value,
  onChange,
  children,
  disabled,
  className,
  size = 'default',
  'aria-label': ariaLabel,
  ...rest
}) {
  const options = readOptions(children);
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <Select
      value={value == null ? '' : String(value)}
      items={items}
      disabled={disabled}
      onValueChange={(v) => onChange?.({ target: { value: v == null ? '' : String(v) } })}
    >
      <SelectTrigger aria-label={ariaLabel} size={size} className={className} {...rest}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value || '__empty'} value={o.value} disabled={o.disabled}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
