import { useEffect, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Path = Array<string | number>;

export function getIn(obj: any, path: Path): any {
  return path.reduce((o, k) => (o == null ? o : o[k]), obj);
}

export function setIn<T>(obj: T, path: Path, value: unknown): T {
  if (!path.length) return value as T;
  const [k, ...rest] = path;
  const src: any = obj ?? (typeof k === 'number' ? [] : {});
  const copy: any = Array.isArray(src) ? [...src] : { ...src };
  copy[k] = setIn(src[k], rest, value);
  return copy;
}

export type FieldType = 'money' | 'text' | 'date' | 'bool' | 'select' | 'number' | 'ssn';

export interface FieldDef {
  /** Path relative to the screen's base object. */
  key: string;
  label: string;
  box?: string;
  type?: FieldType;
  options?: Array<[string, string]>;
  help?: string;
  /** Span both columns of the grid. */
  wide?: boolean;
}

export interface SectionDef {
  title?: string;
  fields: FieldDef[];
}

const parseMoney = (s: string): number => {
  const neg = /^\s*\(.*\)\s*$/.test(s) || /^\s*-/.test(s);
  const n = Number(s.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
};
const showMoney = (n: number): string => (n ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '');

export function MoneyInput({ value, onChange, id }: { value: number; onChange: (n: number) => void; id?: string }) {
  const [text, setText] = useState(showMoney(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(showMoney(value)); }, [value, focused]);
  return (
    <input
      id={id}
      className="money"
      inputMode="decimal"
      value={text}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onBlur={() => { setFocused(false); setText(showMoney(value)); }}
      onChange={(e) => { setText(e.target.value); onChange(parseMoney(e.target.value)); }}
    />
  );
}

let fid = 0;

export function Field({ def, value, onChange }: { def: FieldDef; value: any; onChange: (v: any) => void }) {
  const [id] = useState(() => `f${fid++}`);
  const type = def.type ?? 'money';
  let control;
  switch (type) {
    case 'money':
      control = <MoneyInput id={id} value={Number(value) || 0} onChange={onChange} />;
      break;
    case 'number':
      control = <input id={id} className="num" type="number" value={value ?? 0} onChange={(e) => onChange(Number(e.target.value) || 0)} />;
      break;
    case 'bool':
      control = <input id={id} type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
      break;
    case 'select':
      control = (
        <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          {def.options!.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      );
      break;
    case 'date':
      control = <input id={id} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
      break;
    case 'ssn':
      control = <input id={id} value={value ?? ''} placeholder="XXX-XX-XXXX" maxLength={11} autoComplete="off" onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      control = <input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <div className={`field field-${type}${def.wide ? ' wide' : ''}`} title={def.help}>
      <span className="box">{def.box ?? ''}</span>
      <label htmlFor={id}>{def.label}{def.help ? <span className="help">?</span> : null}</label>
      <span className="control">{control}</span>
    </div>
  );
}

export function FieldGrid({ sections, base, onChange }: {
  sections: SectionDef[];
  base: any;
  onChange: (path: Path, value: any) => void;
}) {
  return (
    <>
      {sections.map((s, i) => (
        <fieldset key={i} className="section">
          {s.title ? <legend>{s.title}</legend> : null}
          <div className="grid">
            {s.fields.map((f) => {
              const path = f.key.split('.').map((p) => (/^\d+$/.test(p) ? Number(p) : p));
              return <Field key={f.key} def={f} value={getIn(base, path)} onChange={(v) => onChange(path, v)} />;
            })}
          </div>
        </fieldset>
      ))}
    </>
  );
}
