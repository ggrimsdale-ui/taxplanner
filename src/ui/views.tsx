import type { FullResults } from '../engine';
import { ESTIMATES } from '../engine/params2026';
import { CA_ESTIMATES } from '../engine/paramsCA2026';
import type { RenderedForm, TaxReturnInput } from '../engine/types';

const money = (n: number | undefined) => {
  if (n === undefined) return '';
  const r = Math.round(n);
  if (r === 0) return '0';
  return r < 0 ? `(${Math.abs(r).toLocaleString('en-US')})` : r.toLocaleString('en-US');
};
const dollars = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function FormPaper({ form }: { form: RenderedForm }) {
  return (
    <article className="paper" id={`form-${form.id}`}>
      <header className="paper-head">
        <div className="paper-name">{form.name}</div>
        <div className="paper-title">{form.title}</div>
        <div className="paper-year">2026</div>
      </header>
      {form.sections.map((s, i) => (
        <section key={i} className="paper-section">
          {s.title ? <h4>{s.title}</h4> : null}
          <table className="lines">
            <tbody>
              {s.lines.map((l, j) => (
                <tr key={j} className={l.total ? 'total' : ''}>
                  <td className="ln">{l.line}</td>
                  <td className="desc">{l.label}</td>
                  <td className={l.text !== undefined ? 'amt text' : 'amt'}>{l.text ?? money(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {form.notes?.map((n, i) => <p key={i} className="paper-note">{n}</p>)}
    </article>
  );
}

export function FormsView({ forms, heading }: { forms: RenderedForm[]; heading: string }) {
  return (
    <div className="forms-view">
      <div className="forms-toolbar no-print">
        <h2>{heading}</h2>
        <nav className="form-jump">
          {forms.map((f) => <a key={f.id} href={`#form-${f.id}`}>{f.name}</a>)}
        </nav>
        <button onClick={() => window.print()}>Print forms</button>
      </div>
      {forms.map((f) => <FormPaper key={f.id} form={f} />)}
    </div>
  );
}

export function SummaryView({ res, input, onOpen }: { res: FullResults; input: TaxReturnInput; onOpen: (view: string) => void }) {
  const f = res.federal;
  const c = res.california;
  const rows: Array<[string, number, number | null]> = [
    ['Total income', f.totalIncome, null],
    ['Adjusted gross income', f.agi, c.caAgi],
    [f.itemizes ? 'Itemized deductions' : 'Standard deduction', f.deduction + f.nonItemizerCharity, c.deduction],
    ['QBI + Schedule 1-A deductions', f.qbiDeduction + f.sch1A.total, null],
    ['Taxable income', f.taxableIncome, c.taxableIncome],
    ['Income tax (incl. AMT)', f.taxBeforeCredits, c.tax + c.amt],
    ['Credits', f.totalNonrefundable, c.exemptionCredits + c.totalCredits],
    ['Other taxes (SE, NIIT, Medicare, penalties)', f.otherTaxes, c.mhst + c.earlyDistributionTax],
    ['Total tax', f.totalTax, c.totalTax],
    ['Withholding', f.totalWithholding, c.withholding],
    ['Estimated & other payments', f.estimatedPayments + f.extensionPayment + f.excessSsWithheld, c.estimatedPayments + c.extensionPayment],
    ['Refundable credits', f.eitc + f.actc + f.aotcRefundable + f.otherRefundable, 0],
    ['Total payments', f.totalPayments, c.totalPayments],
    ['Underpayment penalty (projected)', f.estimatedTaxPenalty, c.estimatedTaxPenalty],
  ];
  const savings = res.recommendations.reduce((a, r) => a + (r.estimatedSavings ?? 0), 0);
  const name = `${input.client.taxpayer.firstName} ${input.client.taxpayer.lastName}`.trim();
  return (
    <div className="summary">
      <h2>2026 Projection Summary{name ? ` — ${name}` : ''}</h2>
      <div className="cards">
        <Result label="Federal" refund={f.refund} owed={f.owed} />
        <Result label="California" refund={c.refund} owed={c.owed} />
        <div className="card">
          <div className="card-label">Combined total tax</div>
          <div className="card-value">{dollars(f.totalTax + c.totalTax)}</div>
          <div className="card-sub">Effective {pct(f.totalIncome > 0 ? (f.totalTax + c.totalTax) / f.totalIncome : 0)} of total income</div>
        </div>
        <div className="card">
          <div className="card-label">Marginal rate (next $1,000)</div>
          <div className="card-value">{pct(res.marginal.federal + res.marginal.california)}</div>
          <div className="card-sub">Federal {pct(res.marginal.federal)} · CA {pct(res.marginal.california)}</div>
        </div>
      </div>
      <table className="summary-table">
        <thead><tr><th></th><th>Federal 1040</th><th>California 540</th></tr></thead>
        <tbody>
          {rows.map(([label, a, b]) => (
            <tr key={label} className={/^Total|Taxable|Adjusted/.test(label) ? 'strong' : ''}>
              <td>{label}</td><td className="amt">{money(a)}</td><td className="amt">{b === null ? '' : money(b)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="summary-recs">
        <div className="summary-recs-head">
          <h3>Top recommendations</h3>
          {savings > 0 ? <span className="savings-pill">Up to {dollars(savings)} identified</span> : null}
          <button className="link" onClick={() => onOpen('recs')}>See all {res.recommendations.length} →</button>
        </div>
        {res.recommendations.filter((r) => r.priority !== 'info').slice(0, 4).map((r) => <RecCard key={r.id} r={r} />)}
      </div>
    </div>
  );
}

function Result({ label, refund, owed }: { label: string; refund: number; owed: number }) {
  const isRefund = refund > 0 || owed === 0;
  return (
    <div className={`card ${isRefund ? 'good' : 'bad'}`}>
      <div className="card-label">{label} {isRefund ? 'refund' : 'balance due'}</div>
      <div className="card-value">{dollars(isRefund ? refund : owed)}</div>
      <div className="card-sub">{isRefund ? 'Projected overpayment' : 'Due April 15, 2027'}</div>
    </div>
  );
}

function RecCard({ r }: { r: FullResults['recommendations'][number] }) {
  return (
    <div className={`rec rec-${r.priority}`}>
      <div className="rec-head">
        <span className={`tag tag-${r.priority}`}>{r.priority}</span>
        <span className="rec-cat">{r.category}</span>
        <span className="rec-title">{r.title}</span>
        {r.estimatedSavings && r.estimatedSavings > 0 ? <span className="savings-pill">≈ {dollars(r.estimatedSavings)} saved</span> : null}
      </div>
      <p>{r.detail}</p>
    </div>
  );
}

export function RecommendationsView({ res }: { res: FullResults }) {
  const groups = ['high', 'medium', 'low', 'info'] as const;
  const titles = { high: 'Act now', medium: 'Worth considering', low: 'Lower impact', info: 'For your information' };
  return (
    <div className="recs-view">
      <h2>Tax Recommendations</h2>
      <p className="muted">Generated from the entries and client information on this return. Savings are simulated by re-running the full federal and California computation with the change applied (combined net tax), and are estimates.</p>
      {groups.map((g) => {
        const list = res.recommendations.filter((r) => r.priority === g);
        if (!list.length) return null;
        return (
          <section key={g}>
            <h3>{titles[g]}</h3>
            {list.map((r) => <RecCard key={r.id} r={r} />)}
          </section>
        );
      })}
      <button className="no-print" onClick={() => window.print()}>Print recommendations</button>
    </div>
  );
}

export function DiagnosticsView({ res }: { res: FullResults }) {
  const diags = [...res.federal.diagnostics, ...res.california.diagnostics];
  return (
    <div className="diag-view">
      <h2>Diagnostics</h2>
      <section>
        <h3>Return review</h3>
        {diags.length ? <ul>{diags.map((d, i) => <li key={i} className="warn">{d}</li>)}</ul> : <p className="muted">No issues found in the current entries.</p>}
      </section>
      <section>
        <h3>Projected / estimated figures — federal</h3>
        <ul>{ESTIMATES.map((d, i) => <li key={i}>{d}</li>)}</ul>
      </section>
      <section>
        <h3>Projected / estimated figures — California</h3>
        <ul>{CA_ESTIMATES.map((d, i) => <li key={i}>{d}</li>)}</ul>
      </section>
      <section>
        <h3>Scope</h3>
        <ul>
          <li>Federal brackets, standard deduction, capital-gain breakpoints, AMT, CTC, EITC, QBI and most limits come from Rev. Proc. 2025-32 and the One Big Beautiful Bill Act (P.L. 119-21).</li>
          <li>Not modeled: premium tax credit (Form 8962), household employment tax, kiddie tax, Form 1116 limitation, §1250/28% rate gain, at-risk and basis limitations, excess business loss, NOLs, depreciation calculations, and 540NR part-year returns.</li>
          <li>This is a planning projection, not a filed return. Review all results before relying on them.</li>
        </ul>
      </section>
    </div>
  );
}
