import { computeAll, computeTaxes } from './index';
import { emptyReturn, newDependent, newDiv, newSchC, newW2, newR1099, sampleReturn, normalizeReturn } from './defaults';
import { preferentialTax, taxableSocialSecurity } from './federal';
import { BRACKETS } from './params2026';
import { bracketTax } from './util';

const wageEarner = (wages: number, status: 'single' | 'mfj' | 'hoh' = 'single') => {
  const r = emptyReturn();
  r.client.filingStatus = status;
  r.client.taxpayer.dob = '1985-01-01';
  r.client.spouse.dob = '1986-01-01';
  r.w2s = [{ ...newW2('T'), wages, ssWages: wages, medicareWages: wages }];
  return r;
};

describe('federal brackets and standard deduction (Rev. Proc. 2025-32)', () => {
  it('single $80,000 wage earner', () => {
    const { federal } = computeTaxes(wageEarner(80000));
    expect(federal.agi).toBe(80000);
    expect(federal.standardDeduction).toBe(16100);
    expect(federal.taxableIncome).toBe(63900);
    expect(federal.regularTax).toBeCloseTo(8770, 2);
  });

  it('MFJ $150,000 with two children gets $2,200 CTC each', () => {
    const r = wageEarner(150000, 'mfj');
    r.dependents = [
      { ...newDependent(), dob: '2015-06-01' },
      { ...newDependent(), dob: '2018-06-01' },
    ];
    const { federal } = computeTaxes(r);
    expect(federal.taxableIncome).toBe(117800);
    expect(federal.regularTax).toBeCloseTo(15340, 2);
    expect(federal.ctcOdc).toBe(4400);
    expect(federal.totalTax).toBeCloseTo(10940, 2);
  });

  it('bracket math matches the published MFJ top of 24% bracket', () => {
    expect(bracketTax(403550, BRACKETS.mfj)).toBeCloseTo(2480 + 9120 + 0.22 * 110600 + 0.24 * 192150, 2);
  });
});

describe('social security and the OBBBA senior deduction', () => {
  it('taxes 85% of benefits and applies the phased $6,000 senior deduction', () => {
    const r = emptyReturn();
    r.client.taxpayer.dob = '1956-04-01';
    r.r1099s = [{ ...newR1099(), ira: false, grossDistribution: 50000, taxableAmount: 50000 }];
    r.socialSecurity.T.benefits = 30000;
    const { federal } = computeTaxes(r);
    expect(federal.ssTaxable).toBeCloseTo(25500, 2);
    expect(federal.agi).toBeCloseTo(75500, 2);
    expect(federal.standardDeduction).toBe(18150);
    expect(federal.sch1A.senior).toBeCloseTo(5970, 2);
    expect(federal.taxableIncome).toBeCloseTo(51380, 2);
    expect(federal.regularTax).toBeCloseTo(6015.6, 1);
  });

  it('worksheet returns zero below the base amount', () => {
    expect(taxableSocialSecurity('single', 20000, 10000)).toBe(0);
  });
});

describe('capital gains', () => {
  it('qualified dividends fit inside the 0% bracket', () => {
    const r = wageEarner(40000);
    r.div1099s = [{ ...newDiv(), ordinary: 20000, qualified: 20000 }];
    const { federal } = computeTaxes(r);
    expect(federal.taxableIncome).toBe(43900);
    expect(federal.regularTax).toBeCloseTo(2620, 2);
  });

  it('preferential tax never exceeds ordinary tax', () => {
    const ord = (x: number) => bracketTax(x, BRACKETS.single);
    expect(preferentialTax(1_000_000, 500_000, 'single', ord)).toBeLessThan(ord(1_000_000));
  });

  it('limits net capital losses to $3,000 and carries the rest', () => {
    const r = wageEarner(60000);
    r.capitalTransactions = [{ id: 'a', description: 'x', term: 'short', proceeds: 0, basis: 10000, adjustment: 0 }];
    const { federal } = computeTaxes(r);
    expect(federal.capitalGainLine7).toBe(-3000);
    expect(federal.capitalLossCarryover.shortTerm).toBe(7000);
  });
});

describe('self-employment', () => {
  it('computes SE tax, half-SE deduction and the QBI income limitation', () => {
    const r = emptyReturn();
    r.client.taxpayer.dob = '1980-01-01';
    r.scheduleCs = [{ ...newSchC(), grossReceipts: 100000 }];
    const { federal } = computeTaxes(r);
    expect(federal.seTax).toBeCloseTo(14129.55, 2);
    expect(federal.agi).toBeCloseTo(92935.225, 2);
    expect(federal.qbiDeduction).toBeCloseTo(0.2 * (92935.225 - 16100), 2);
  });
});

describe('refundable credits', () => {
  it('head of household with one child gets the maximum EITC and partial ACTC', () => {
    const r = wageEarner(13020, 'hoh');
    r.dependents = [{ ...newDependent(), dob: '2020-01-01' }];
    const { federal } = computeTaxes(r);
    expect(federal.taxableIncome).toBe(0);
    expect(federal.eitc).toBeCloseTo(4427, 0);
    expect(federal.actc).toBeCloseTo(0.15 * (13020 - 2500), 2);
  });
});

describe('OBBBA deductions', () => {
  it('SALT cap phases down 30% above $505,000 MAGI', () => {
    const r = wageEarner(600000, 'mfj');
    r.itemized.realEstateTax = 30000;
    r.itemized.additionalStateIncomeTax = 40000;
    const { federal } = computeTaxes(r);
    expect(federal.schA.saltCap).toBeCloseTo(40400 - 0.3 * 95000, 2);
  });

  it('overtime deduction is capped at $12,500 for single filers', () => {
    const r = wageEarner(90000);
    r.w2s[0].qualifiedOvertime = 15000;
    const { federal } = computeTaxes(r);
    expect(federal.sch1A.overtime).toBe(12500);
  });

  it('child care credit uses the new 50%/35%/20% schedule', () => {
    const r = wageEarner(100000);
    r.client.filingStatus = 'hoh';
    r.dependents = [{ ...newDependent(), dob: '2020-01-01' }];
    r.credits.childCareExpenses = 3000;
    const { federal } = computeTaxes(r);
    expect(federal.childCareRate).toBeCloseTo(0.22, 5);
    expect(federal.childCareCredit).toBeCloseTo(660, 2);
  });
});

describe('California 540', () => {
  it('single $80,000 wage earner', () => {
    const { california } = computeTaxes(wageEarner(80000));
    expect(california.caAgi).toBe(80000);
    expect(california.taxableIncome).toBe(74100);
    expect(california.tax).toBeCloseTo(3223.12, 2);
    expect(california.totalTax).toBeCloseTo(3223.12 - 158, 2);
  });

  it('subtracts taxable social security and adds back HSA', () => {
    const r = wageEarner(50000);
    r.client.taxpayer.hdhpCoverage = 'self';
    r.adjustments.hsaT = 4000;
    r.socialSecurity.T.benefits = 20000;
    const { federal, california } = computeTaxes(r);
    expect(california.caAgi).toBeCloseTo(federal.agi - federal.ssTaxable + 4000, 2);
  });
});

describe('sample client and recommendations', () => {
  it('produces a complete return without NaN values', () => {
    const res = computeAll(sampleReturn());
    const values = [...res.federal.forms, ...res.california.forms]
      .flatMap((f) => f.sections.flatMap((s) => s.lines.map((l) => l.amount ?? 0)));
    expect(values.every(Number.isFinite)).toBe(true);
    expect(res.federal.totalTax).toBeGreaterThan(0);
    expect(res.california.totalTax).toBeGreaterThan(0);
    expect(res.recommendations.length).toBeGreaterThan(3);
    expect(res.marginal.federal).toBeGreaterThan(0.2);
  });

  it('normalizes partial saved data', () => {
    const r = normalizeReturn({ client: { filingStatus: 'mfj' } });
    expect(r.client.filingStatus).toBe('mfj');
    expect(r.payments.fedEstimates).toHaveLength(4);
  });
});
