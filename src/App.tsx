import { useEffect, useMemo, useRef, useState } from 'react';
import { computeAll } from './engine';
import { emptyReturn, newId, normalizeReturn, sampleReturn } from './engine/defaults';
import type { TaxReturnInput } from './engine/types';
import { FieldGrid, getIn, setIn, type Path } from './ui/fields';
import { GROUPS, SCREENS, type ScreenDef } from './ui/screens';
import { DiagnosticsView, FormsView, RecommendationsView, SummaryView } from './ui/views';

interface StoredClient { name: string; updated: string; data: TaxReturnInput }
type Clients = Record<string, StoredClient>;

const STORE_KEY = 'taxplanner2026.clients';
const CURRENT_KEY = 'taxplanner2026.current';

function loadClients(): Clients {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Clients;
      for (const id of Object.keys(parsed)) parsed[id].data = normalizeReturn(parsed[id].data);
      if (Object.keys(parsed).length) return parsed;
    }
  } catch { /* storage unavailable */ }
  return { [newId()]: { name: 'Sample — Rivera', updated: new Date().toISOString(), data: sampleReturn() } };
}

const clientName = (d: TaxReturnInput) =>
  [d.client.taxpayer.lastName, d.client.taxpayer.firstName].filter(Boolean).join(', ') || 'New client';

const OUTPUTS: Array<[string, string]> = [
  ['summary', 'Summary'],
  ['f1040', 'Form 1040 & Schedules'],
  ['ca540', 'California 540'],
  ['recs', 'Recommendations'],
  ['diag', 'Diagnostics'],
];

export default function App() {
  const [clients, setClients] = useState<Clients>(loadClients);
  const [currentId, setCurrentId] = useState<string>(() => {
    try {
      const id = localStorage.getItem(CURRENT_KEY);
      if (id) return id;
    } catch { /* ignore */ }
    return '';
  });
  const id = clients[currentId] ? currentId : Object.keys(clients)[0];
  const input = clients[id].data;
  const [view, setView] = useState<string>('client');
  const [unit, setUnit] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(clients));
      localStorage.setItem(CURRENT_KEY, id);
    } catch { /* ignore */ }
  }, [clients, id]);

  const res = useMemo(() => computeAll(input), [input]);

  const update = (next: TaxReturnInput) =>
    setClients((cs) => ({ ...cs, [id]: { name: clientName(next), updated: new Date().toISOString(), data: next } }));

  const addClient = (data: TaxReturnInput) => {
    const nid = newId();
    setClients((cs) => ({ ...cs, [nid]: { name: clientName(data), updated: new Date().toISOString(), data } }));
    setCurrentId(nid);
    setView('client');
    setUnit(0);
  };

  const deleteClient = () => {
    if (!confirm(`Delete client "${clients[id].name}"? This cannot be undone.`)) return;
    setClients((cs) => {
      const next = { ...cs };
      delete next[id];
      if (!Object.keys(next).length) next[newId()] = { name: 'New client', updated: new Date().toISOString(), data: emptyReturn() };
      return next;
    });
    setCurrentId('');
  };

  const exportClient = () => {
    const blob = new Blob([JSON.stringify(input, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${clientName(input).replace(/[^a-z0-9]+/gi, '_')}_2026.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importClient = async (file: File) => {
    try {
      addClient(normalizeReturn(JSON.parse(await file.text())));
    } catch {
      alert('That file is not a valid TaxPlanner client file.');
    }
  };

  const screen = SCREENS.find((s) => s.id === view);
  const f = res.federal;
  const c = res.california;

  return (
    <div className="app">
      <header className="topbar no-print">
        <div className="brand">TaxPlanner <span>2026</span></div>
        <select className="client-select" value={id} onChange={(e) => { setCurrentId(e.target.value); setUnit(0); }}>
          {Object.entries(clients).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([cid, cl]) => <option key={cid} value={cid}>{cl.name}</option>)}
        </select>
        <div className="toolbar">
          <button onClick={() => addClient(emptyReturn())}>New</button>
          <button onClick={() => addClient(sampleReturn())}>Sample</button>
          <button onClick={() => fileRef.current?.click()}>Import</button>
          <button onClick={exportClient}>Export</button>
          <button onClick={deleteClient}>Delete</button>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => { const fl = e.target.files?.[0]; if (fl) importClient(fl); e.target.value = ''; }} />
        </div>
        <div className="monitor" title="Refund monitor">
          <Monitor label="Federal" refund={f.refund} owed={f.owed} />
          <Monitor label="CA" refund={c.refund} owed={c.owed} />
          <div className="mon"><span>AGI</span><b>${Math.round(f.agi).toLocaleString()}</b></div>
        </div>
      </header>

      <div className="body">
        <aside className="sidebar no-print">
          {GROUPS.map((g) => (
            <div key={g} className="nav-group">
              <div className="nav-head">{g}</div>
              {SCREENS.filter((s) => s.group === g).map((s) => {
                const count = s.list ? (getIn(input, s.base.split('.')) as unknown[]).length : 0;
                return (
                  <button key={s.id} className={`nav-item ${view === s.id ? 'active' : ''}`} onClick={() => { setView(s.id); setUnit(0); }}>
                    <span className="nav-num">{s.number}</span>
                    <span className="nav-title">{s.title}</span>
                    {count ? <span className="nav-count">{count}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="nav-group">
            <div className="nav-head">Output</div>
            {OUTPUTS.map(([oid, label]) => (
              <button key={oid} className={`nav-item out ${view === oid ? 'active' : ''}`} onClick={() => setView(oid)}>
                <span className="nav-title">{label}</span>
                {oid === 'recs' ? <span className="nav-count">{res.recommendations.filter((r) => r.priority !== 'info').length}</span> : null}
                {oid === 'diag' && f.diagnostics.length + c.diagnostics.length ? <span className="nav-count warn">{f.diagnostics.length + c.diagnostics.length}</span> : null}
              </button>
            ))}
          </div>
        </aside>

        <main className="main">
          {screen ? (
            <ScreenView key={`${id}-${screen.id}`} screen={screen} input={input} update={update} unit={unit} setUnit={setUnit} />
          ) : view === 'summary' ? (
            <SummaryView res={res} input={input} onOpen={setView} />
          ) : view === 'f1040' ? (
            <FormsView forms={f.forms} heading="Federal Form 1040 and supporting schedules" />
          ) : view === 'ca540' ? (
            <FormsView forms={c.forms} heading="California Form 540 and Schedule CA" />
          ) : view === 'recs' ? (
            <RecommendationsView res={res} />
          ) : (
            <DiagnosticsView res={res} />
          )}
        </main>
      </div>
    </div>
  );
}

function Monitor({ label, refund, owed }: { label: string; refund: number; owed: number }) {
  const due = owed > 0;
  return (
    <div className={`mon ${due ? 'due' : 'refund'}`}>
      <span>{label} {due ? 'owe' : 'refund'}</span>
      <b>${Math.round(due ? owed : refund).toLocaleString()}</b>
    </div>
  );
}

function ScreenView({ screen, input, update, unit, setUnit }: {
  screen: ScreenDef; input: TaxReturnInput; update: (d: TaxReturnInput) => void; unit: number; setUnit: (n: number) => void;
}) {
  const basePath: Path = screen.base ? screen.base.split('.') : [];
  const baseVal = basePath.length ? getIn(input, basePath) : input;
  const sections = typeof screen.sections === 'function' ? screen.sections(input) : screen.sections;

  if (screen.list) {
    const items = baseVal as Array<{ id: string }>;
    const idx = Math.min(unit, Math.max(0, items.length - 1));
    const item = items[idx];
    const setItems = (next: unknown[]) => update(setIn(input, basePath, next));
    return (
      <div className="screen">
        <ScreenHeader screen={screen} />
        <div className="units">
          {items.map((it, i) => (
            <button key={it.id} className={`unit ${i === idx ? 'active' : ''}`} onClick={() => setUnit(i)}>
              {i + 1}. {screen.list!.label(it, i)}
            </button>
          ))}
          <button className="unit add" onClick={() => { setItems([...items, screen.list!.create()]); setUnit(items.length); }}>+ Add {screen.list.noun}</button>
        </div>
        {item ? (
          <>
            <div className="unit-actions">
              <button onClick={() => { setItems([...items.slice(0, idx + 1), { ...structuredClone(item), id: newId() }, ...items.slice(idx + 1)]); setUnit(idx + 1); }}>Copy</button>
              <button onClick={() => { setItems(items.filter((_, i) => i !== idx)); setUnit(Math.max(0, idx - 1)); }}>Delete</button>
            </div>
            <FieldGrid sections={sections} base={item} onChange={(p, v) => update(setIn(input, [...basePath, idx, ...p], v))} />
          </>
        ) : (
          <p className="empty">No {screen.list.noun} entered. Click “+ Add {screen.list.noun}” to start.</p>
        )}
      </div>
    );
  }
  return (
    <div className="screen">
      <ScreenHeader screen={screen} />
      <FieldGrid sections={sections} base={baseVal} onChange={(p, v) => update(setIn(input, [...basePath, ...p], v))} />
    </div>
  );
}

function ScreenHeader({ screen }: { screen: ScreenDef }) {
  return (
    <div className="screen-head">
      <span className="screen-num">Screen {screen.number}</span>
      <h2>{screen.title}</h2>
      {screen.intro ? <p className="muted">{screen.intro}</p> : null}
    </div>
  );
}
