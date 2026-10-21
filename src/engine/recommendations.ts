// Planning recommendations driven by the client's entries and projected results.

import * as P from './params2026';
import * as C from './paramsCA2026';
import type { TaxResults } from './index';
import type { TaxReturnInput } from './types';
import { ageAtYearEnd, includeOwner, is65, pos, round, sum } from './util';

export type Priority = 'high' | 'medium' | 'low' | 'info';

export interface Recommendation {
  id: string;
  category: 'Payments' | 'Retirement' | 'Deductions' | 'Investments' | 'Credits' | 'Business' | 'California' | 'Law change';
  priority: Priority;
  title: string;
  detail: string;
  /** Projected combined federal + CA tax reduction, when it can be simulated. */
  estimatedSavings?: number;
}

type Simulate = (input: TaxReturnInput) => TaxResults;

/** Federal liability net of refundable credits, plus CA total tax. */
export const netLiability = (r: TaxResults): number =>
  r.federal.totalTax - r.federal.eitc - r.federal.actc - r.federal.aotcRefundable + r.california.totalTax;

const $ = (n: number) => '$' + round(n).toLocaleString('en-US');
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;

export function buildRecommendations(
  input: TaxReturnInput, base: TaxResults, marginal: { federal: number; california: number }, simulate: Simulate,
): Recommendation[] {
  const recs: Recommendation[] = [];
  const f = base.federal;
  const ca = base.california;
  const status = input.client.filingStatus;
  const joint = status === 'mfj';
  const baseLiability = netLiability(base);
  const whatIf = (mutate: (d: TaxReturnInput) => void): number => {
    const d = structuredClone(input);
    mutate(d);
    return baseLiability - netLiability(simulate(d));
  };
  const add = (r: Recommendation) => {
    if (r.estimatedSavings !== undefined) r.estimatedSavings = round(r.estimatedSavings);
    recs.push(r);
  };
  const people = (joint ? ['T', 'S'] : ['T']) as Array<'T' | 'S'>;
  const personName = (w: 'T' | 'S') => {
    const p = w === 'T' ? input.client.taxpayer : input.client.spouse;
    return p.firstName || (w === 'T' ? 'Taxpayer' : 'Spouse');
  };

  // ------------------------------------------------------------- Payments
  const fedShort = pos(f.safeHarborRequired - f.paidTowardSafeHarbor);
  if (fedShort > 0 && f.totalTax - f.totalWithholding >= 1000) {
    add({
      id: 'fed-safe-harbor', category: 'Payments', priority: f.estimatedTaxPenalty > 100 || fedShort > 5000 ? 'high' : 'medium',
      title: `Pay ${$(fedShort)} more federal tax to reach the safe harbor`,
      detail: `Required annual payment is ${$(f.safeHarborRequired)} (lesser of 90% of 2026 tax or ${input.client.priorYear.federalAgi > 150000 ? '110%' : '100%'} of 2025 tax); withholding and estimates total ${$(f.paidTowardSafeHarbor)}. ` +
        `Increasing W-4 withholding before December 31 is treated as paid evenly through the year and can eliminate penalties for earlier quarters; a 4th-quarter estimate is due January 15, 2027. Projected Form 2210 penalty if nothing changes: ${$(f.estimatedTaxPenalty)}.`,
      estimatedSavings: f.estimatedTaxPenalty,
    });
  } else if (f.owed - f.estimatedTaxPenalty >= 1000) {
    add({
      id: 'fed-balance', category: 'Payments', priority: 'medium',
      title: `Plan for a ${$(f.owed)} federal balance due April 15, 2027`,
      detail: 'Safe harbor is met, so no underpayment penalty is projected, but the balance is due with the return. Consider setting funds aside now.',
    });
  }
  const caShort = pos(ca.safeHarborRequired - ca.withholding - ca.estimatedPayments);
  if (caShort > 0 && ca.estimatedTaxPenalty > 0) {
    add({
      id: 'ca-safe-harbor', category: 'Payments', priority: ca.estimatedTaxPenalty > 100 || caShort > 5000 ? 'high' : 'medium',
      title: `Pay ${$(caShort)} more California tax to avoid the FTB 5805 penalty`,
      detail: `California installments are 30% / 40% / 0% / 30% of the required annual payment (${$(ca.safeHarborRequired)}). ` +
        `${ca.caAgi >= 1000000 ? 'With CA AGI of $1M or more, the prior-year safe harbor is not available. ' : ''}Projected penalty: ${$(ca.estimatedTaxPenalty)}. Additional CA withholding through year-end also counts as paid evenly.`,
      estimatedSavings: ca.estimatedTaxPenalty,
    });
  }
  const totalRefund = f.refund + ca.refund;
  if (totalRefund > 3000 && f.owed === 0) {
    add({
      id: 'overwithheld', category: 'Payments', priority: 'low',
      title: `Projected refunds of ${$(totalRefund)} — consider reducing withholding`,
      detail: 'A large refund is an interest-free loan to the government. Update the 2027 Form W-4 / DE 4 (or reduce remaining 2026 estimates) once the projection is confirmed.',
    });
  }

  // CA Q4 estimate paid in December is deductible on the 2026 Schedule A.
  const caJanPayment = input.payments.caEstimates[3];
  if (f.itemizes && f.schA.saltPaid < f.schA.saltCap && (caJanPayment > 0 || ca.owed > 0)) {
    const amount = Math.min(caJanPayment || ca.owed, f.schA.saltCap - f.schA.saltPaid);
    const savings = whatIf((d) => {
      d.payments.caEstimates[3] = pos(d.payments.caEstimates[3] - amount);
      d.itemized.additionalStateIncomeTax += amount;
    });
    if (amount > 100) {
      add({
        id: 'ca-q4-december', category: 'Deductions', priority: 'medium',
        title: `Pay ${$(amount)} of California tax by December 31 instead of January`,
        detail: `You itemize and have ${$(f.schA.saltCap - f.schA.saltPaid)} of room under the 2026 SALT cap (${$(f.schA.saltCap)}). State tax paid in December 2026 is deductible on the 2026 federal return; the January 15 payment is not.`,
        estimatedSavings: savings,
      });
    }
  }

  // ------------------------------------------------------------- Retirement
  for (const w of people) {
    const p = f.persons[w];
    const w2 = input.w2s.filter((x) => x.owner === w && includeOwner(input, x.owner));
    if (!w2.length || p.wages <= 0) continue;
    const age = p.age ?? 40;
    const catchUp = age >= 60 && age <= 63 ? P.RETIREMENT.catchUp60to63 : age >= 50 ? P.RETIREMENT.catchUp50 : 0;
    const limit = P.RETIREMENT.deferralLimit + catchUp;
    const deferred = p.electiveDeferrals + p.rothDeferrals;
    const room = Math.min(pos(limit - deferred), pos(p.wages - deferred) * 0.9);
    if (room >= 1000 && w2.some((x) => x.retirementPlan)) {
      const savings = whatIf((d) => {
        const target = d.w2s.find((x) => x.id === w2[0].id)!;
        target.wages -= room;
        target.electiveDeferrals += room;
        if (target.stateWages) target.stateWages -= room;
      });
      add({
        id: `401k-${w}`, category: 'Retirement', priority: savings > 1500 ? 'high' : 'medium',
        title: `${personName(w)}: ${$(room)} of unused 401(k)/403(b) deferral room`,
        detail: `2026 limit is ${$(limit)}${catchUp ? ` including a ${$(catchUp)} catch-up${age >= 60 && age <= 63 ? ' (SECURE 2.0 ages 60–63)' : ''}` : ''}; deferrals so far total ${$(deferred)}. ` +
          'Increase payroll deferrals for the remaining 2026 pay periods. Beginning 2026, catch-up contributions for employees whose prior-year FICA wages exceeded $150,000 must be made as Roth (no current deduction).',
        estimatedSavings: savings,
      });
    }
  }

  for (const w of people) {
    const p = f.persons[w];
    const age = p.age ?? 40;
    const limit = P.RETIREMENT.iraLimit + (age >= 50 ? P.RETIREMENT.iraCatchUp : 0);
    const roth = w === 'T' ? input.adjustments.rothIraT : input.adjustments.rothIraS;
    const room = pos(limit - p.iraContribution - roth);
    const compensation = pos(f.persons.T.earnedIncome) + (joint ? pos(f.persons.S.earnedIncome) : 0);
    if (room < 500 || compensation <= 0) continue;
    const savings = whatIf((d) => {
      if (w === 'T') d.adjustments.traditionalIraT += room; else d.adjustments.traditionalIraS += room;
    });
    const rothRange = P.RETIREMENT.rothPhaseout[status];
    if (savings > 50) {
      add({
        id: `ira-${w}`, category: 'Retirement', priority: 'medium',
        title: `${personName(w)}: deductible traditional IRA contribution of up to ${$(room)}`,
        detail: `Contributions for 2026 can be made until April 15, 2027. ${p.coveredByPlan ? 'Deductibility is limited by the active-participant phase-out; the savings shown reflect it.' : ''}`.trim(),
        estimatedSavings: savings,
      });
    } else if (f.agi > rothRange[0]) {
      add({
        id: `backdoor-${w}`, category: 'Retirement', priority: 'low',
        title: `${personName(w)}: consider a backdoor Roth IRA (${$(room)})`,
        detail: `Income is above the deductible-IRA and/or Roth phase-out range (${$(rothRange[0])}–${$(rothRange[1])}). A nondeductible IRA contribution followed by a Roth conversion avoids the limit; watch the pro-rata rule if pre-tax IRA balances exist (Form 8606).`,
      });
    }
  }

  for (const w of people) {
    const p = f.persons[w];
    const who = w === 'T' ? input.client.taxpayer : input.client.spouse;
    if (who.hdhpCoverage === 'none' || p.hsaLimit <= 0) continue;
    const personal = w === 'T' ? input.adjustments.hsaT : input.adjustments.hsaS;
    const room = pos(p.hsaLimit - p.hsaEmployer - personal);
    if (room < 250) continue;
    const savings = whatIf((d) => { if (w === 'T') d.adjustments.hsaT += room; else d.adjustments.hsaS += room; });
    add({
      id: `hsa-${w}`, category: 'Retirement', priority: 'medium',
      title: `${personName(w)}: ${$(room)} of HSA contribution room`,
      detail: `2026 HSA limit is ${$(p.hsaLimit)} (${who.hdhpCoverage} coverage${(p.age ?? 0) >= 55 ? ', incl. $1,000 catch-up' : ''}). Contributions are due by April 15, 2027. California does not allow the HSA deduction, so the benefit is federal only (payroll contributions also avoid FICA).`,
      estimatedSavings: savings,
    });
  }

  // Roth conversion in low brackets.
  const hasIra = input.r1099s.some((r) => r.ira) || people.some((w) => (f.persons[w].age ?? 0) >= 55);
  const brackets = P.BRACKETS[status];
  if (hasIra && f.marginalOrdinaryRate <= 0.12 && f.taxableIncome > 0) {
    const top12 = brackets[1][0];
    const room = pos(top12 - f.taxableIncome);
    if (room > 2000) {
      add({
        id: 'roth-conversion', category: 'Retirement', priority: 'medium',
        title: `Roth conversion opportunity: about ${$(room)} fills the 12% bracket`,
        detail: `Taxable income of ${$(f.taxableIncome)} leaves room before the 22% bracket (${$(top12)}). Converting pre-tax IRA dollars now locks in a low rate. Model the effect on Social Security taxation${f.sch1A.senior > 0 ? ', the $6,000 senior deduction phase-out' : ''}, Medicare IRMAA (two-year lookback) and California tax (${pct(marginal.california)} marginal).`,
      });
    }
  }

  // RMDs and QCDs.
  for (const w of people) {
    const who = w === 'T' ? input.client.taxpayer : input.client.spouse;
    const age = ageAtYearEnd(who.dob);
    if (age === null) continue;
    const birthYear = Number(who.dob.slice(0, 4));
    const rmdAge = birthYear >= 1960 ? 75 : 73;
    const iraDist = sum(input.r1099s.filter((r) => r.owner === w && r.ira).map((r) => r.grossDistribution));
    if (age >= rmdAge && iraDist === 0) {
      add({
        id: `rmd-${w}`, category: 'Retirement', priority: 'high',
        title: `${personName(w)}: no IRA distribution entered — confirm the 2026 RMD`,
        detail: `At age ${age}, required minimum distributions apply. A missed RMD carries a 25% excise tax (10% if corrected timely). Enter the 1099-R if the distribution has been or will be taken.`,
      });
    }
    if (age >= 71 && iraDist > 0 && input.itemized.charityCash > 0) {
      const qcd = Math.min(input.itemized.charityCash, sum(input.r1099s.filter((r) => r.owner === w && r.ira).map((r) => pos(r.taxableAmount - r.qcd))), 111000);
      if (qcd > 0) {
        const savings = whatIf((d) => {
          let left = qcd;
          for (const r of d.r1099s.filter((x) => x.owner === w && x.ira)) {
            const use = Math.min(left, pos(r.taxableAmount - r.qcd));
            r.qcd += use;
            left -= use;
          }
          d.itemized.charityCash -= qcd;
        });
        if (savings > 0) {
          add({
            id: `qcd-${w}`, category: 'Deductions', priority: 'medium',
            title: `${personName(w)}: give ${$(qcd)} to charity directly from the IRA (QCD)`,
            detail: 'A qualified charitable distribution counts toward the RMD and is excluded from AGI, which can lower Social Security taxation, the senior-deduction phase-out, NIIT exposure, Medicare IRMAA and California tax. It must go directly from the IRA custodian to the charity by December 31.',
            estimatedSavings: savings,
          });
        }
      }
    }
  }

  // ------------------------------------------------------------- Deductions
  const std = f.standardDeduction;
  if (!f.itemizes && f.itemizedBeforeLimit > 0.75 * std) {
    add({
      id: 'bunching', category: 'Deductions', priority: 'medium',
      title: `Itemized deductions (${$(f.itemizedBeforeLimit)}) are close to the standard deduction (${$(std)})`,
      detail: 'Consider "bunching": concentrate two years of charitable gifts (e.g., via a donor-advised fund) and elective property-tax or medical payments into one year to itemize, then take the standard deduction the next year. Note the new 0.5%-of-AGI floor on itemized charitable gifts starting in 2026.',
    });
  }
  if (!f.itemizes) {
    const cap = P.NONITEMIZER_CHARITY[status];
    if (input.itemized.charityCash < cap) {
      add({
        id: 'nonitemizer-charity', category: 'Deductions', priority: 'low',
        title: `New for 2026: up to ${$(cap)} deduction for cash gifts without itemizing`,
        detail: `OBBBA lets non-itemizers deduct cash contributions to public charities (not donor-advised funds). Currently ${$(input.itemized.charityCash)} entered.`,
      });
    }
  }
  if (f.itemizes && f.schA.saltPaid > f.schA.saltCap && f.agi > P.SALT.phasedownStart * (status === 'mfs' ? 0.5 : 1)) {
    const top = (status === 'mfs' ? P.SALT.phasedownStartMfs : P.SALT.phasedownStart);
    add({
      id: 'salt-phasedown', category: 'Deductions', priority: 'medium',
      title: `SALT cap reduced to ${$(f.schA.saltCap)} by the MAGI phase-down`,
      detail: `MAGI over ${$(top)} reduces the $40,400 cap by 30% of the excess (floor $10,000). In this range each $1,000 of income reduction restores $300 of SALT deduction — retirement deferrals, timing of bonuses or capital gains, and QCDs are especially valuable.`,
    });
  }
  if (f.itemizedLimitation > 0) {
    add({
      id: '2-37-limit', category: 'Deductions', priority: 'info',
      title: `Itemized deductions reduced ${$(f.itemizedLimitation)} by the new 2/37 limitation`,
      detail: 'Beginning 2026, itemized deductions are worth at most 35 cents per dollar for taxpayers in the 37% bracket. Charitable gifts made before 2026 avoided this; going forward, appreciated stock gifts (avoiding capital gains) remain the most efficient way to give.',
    });
  }
  if (f.itemizes && input.itemized.mortgageBalance > P.MORTGAGE_DEBT_LIMIT) {
    add({
      id: 'mortgage-limit', category: 'Deductions', priority: 'info',
      title: 'Mortgage interest limited to $750,000 of acquisition debt',
      detail: `Federal interest is prorated (${$(f.schA.mortgageInterestAllowed)} allowed). California allows interest on up to $1,000,000 of acquisition debt.`,
    });
  }

  // OBBBA Schedule 1-A items.
  const ssTipsReported = sum(input.w2s.map((w) => w.ssTips));
  const qualTips = sum(input.w2s.map((w) => w.qualifiedTips)) + input.schedule1A.additionalTips;
  if (ssTipsReported > 0 && qualTips === 0) {
    add({
      id: 'tips', category: 'Deductions', priority: 'high',
      title: 'Tips reported on W-2 box 7 but no qualified tips entered',
      detail: `Up to $25,000 of qualified tips in a customarily tipped occupation are deductible on Schedule 1-A (2025–2028). Enter the amount from W-2 box 14b or employer records. ${$(ssTipsReported)} of social security tips is reported.`,
      estimatedSavings: whatIf((d) => { d.schedule1A.additionalTips += Math.min(ssTipsReported, 25000); }),
    });
  }
  if (status === 'mfs' && (qualTips > 0 || sum(input.w2s.map((w) => w.qualifiedOvertime)) > 0 || is65(input.client.taxpayer.dob))) {
    add({
      id: 'mfs-1a', category: 'Deductions', priority: 'medium',
      title: 'Filing separately forfeits the tips, overtime and senior deductions',
      detail: 'Schedule 1-A deductions require a joint return for married taxpayers. Compare a joint return before filing separately.',
    });
  }
  if (f.sch1A.overtime > 0 && f.sch1A.magi > (joint ? 300000 : 150000)) {
    add({
      id: 'overtime-phaseout', category: 'Deductions', priority: 'low',
      title: 'Overtime deduction is phasing out',
      detail: `MAGI of ${$(f.sch1A.magi)} is over the ${joint ? '$300,000' : '$150,000'} threshold; each $1,000 of income above it removes $100 of the tips/overtime deductions. Pre-tax retirement and HSA contributions reduce MAGI.`,
    });
  }
  const seniors = people.filter((w) => f.persons[w].is65).length;
  if (seniors > 0 && status !== 'mfs') {
    const lo = joint ? P.SCHEDULE_1A.seniorPhaseoutJoint : P.SCHEDULE_1A.seniorPhaseout;
    const hi = lo + P.SCHEDULE_1A.seniorAmount / P.SCHEDULE_1A.seniorPhaseoutRate;
    if (f.sch1A.magi > lo && f.sch1A.magi < hi) {
      add({
        id: 'senior-phaseout', category: 'Deductions', priority: 'medium',
        title: `Senior deduction is phasing out (${$(f.sch1A.senior)} of ${$(seniors * 6000)} allowed)`,
        detail: `Each $1,000 of MAGI above ${$(lo)} costs $60 of deduction per senior (fully gone at ${$(hi)}). Effective marginal rates are higher here; QCDs, Roth (rather than traditional) withdrawals and capital-loss harvesting help.`,
      });
    } else if (f.sch1A.senior > 0) {
      add({
        id: 'senior', category: 'Deductions', priority: 'info',
        title: `Senior deduction of ${$(f.sch1A.senior)} applied (2025–2028)`,
        detail: 'OBBBA adds $6,000 per taxpayer age 65+ with a valid SSN, on top of the standard or itemized deduction. California does not conform.',
      });
    }
  }
  if (input.schedule1A.carLoanInterest > 0 && f.sch1A.carLoan === 0 && input.schedule1A.vehicleQualifies) {
    add({
      id: 'car-loan', category: 'Deductions', priority: 'info',
      title: 'Car loan interest deduction fully phased out',
      detail: `MAGI exceeds ${joint ? '$250,000' : '$150,000'}, eliminating the deduction.`,
    });
  }

  // ------------------------------------------------------------- Investments
  const [b0] = P.CAPGAIN_BREAKS[status];
  if (f.taxableIncome < b0 && f.taxableIncome > 0) {
    add({
      id: 'zero-gain', category: 'Investments', priority: 'medium',
      title: `Harvest up to ${$(b0 - f.taxableIncome)} of long-term gains at the 0% federal rate`,
      detail: `Taxable income is below the ${$(b0)} top of the 0% capital-gain bracket. Selling appreciated long-term holdings and repurchasing resets basis federally tax-free (California taxes gains as ordinary income at ${pct(marginal.california)}).`,
    });
  }
  if (f.shortTermNet + f.longTermNet > 5000) {
    add({
      id: 'loss-harvest', category: 'Investments', priority: 'medium',
      title: `Net capital gains of ${$(f.shortTermNet + f.longTermNet)} — review for tax-loss harvesting`,
      detail: `Realizing losses before December 31 offsets gains${f.shortTermNet > 0 ? ' (short-term gains taxed at ordinary rates are the best to offset)' : ''}, plus up to $3,000 of ordinary income. Avoid wash sales (30 days).`,
      estimatedSavings: whatIf((d) => {
        d.capitalTransactions.push({ id: 'sim', description: 'sim', term: f.shortTermNet > 0 ? 'short' : 'long', proceeds: 0, basis: Math.min(5000, f.shortTermNet + f.longTermNet), adjustment: 0 });
      }),
    });
  }
  if (f.capitalLossCarryover.shortTerm + f.capitalLossCarryover.longTerm > 0) {
    add({
      id: 'loss-carryover', category: 'Investments', priority: 'low',
      title: `${$(f.capitalLossCarryover.shortTerm + f.capitalLossCarryover.longTerm)} capital loss carries to 2027`,
      detail: 'Losses beyond $3,000 carry forward indefinitely. Consider realizing gains this year (e.g., rebalancing or diversifying concentrated positions) to use the carryover.',
    });
  }
  const niitThreshold = P.NIIT.threshold[status];
  if (f.niit > 0) {
    add({
      id: 'niit', category: 'Investments', priority: 'medium',
      title: `Net investment income tax of ${$(f.niit)}`,
      detail: `MAGI exceeds ${$(niitThreshold)}. Municipal bonds, tax-managed funds, harvesting losses, and material participation in pass-through businesses reduce exposure.`,
    });
  } else if (f.agi > niitThreshold - 25000 && f.netInvestmentIncome > 0) {
    add({
      id: 'niit-near', category: 'Investments', priority: 'low',
      title: `Within ${$(niitThreshold - f.agi)} of the 3.8% NIIT threshold`,
      detail: 'Additional income or gains this year would trigger the net investment income tax on investment income above the threshold.',
    });
  }
  if (f.earlyDistributionTax > 0) {
    add({
      id: 'early-dist', category: 'Retirement', priority: 'high',
      title: `${$(f.earlyDistributionTax)} early-distribution penalty (Form 5329)`,
      detail: 'Check exceptions: separation from service at 55+ (plans), substantially equal payments, unreimbursed medical > 7.5% AGI, higher education or first-time home ($10,000, IRAs), birth/adoption ($5,000), emergency expense ($1,000), terminal illness, disaster recovery, or domestic-abuse distributions. A rollover within 60 days reverses the distribution.',
    });
  }
  const retirementIncome = f.iraTaxable + f.pensionTaxable;
  const retirementWithheld = sum(input.r1099s.map((r) => r.fedWithholding));
  if (retirementIncome > 20000 && retirementWithheld < 0.05 * retirementIncome && f.owed > 0) {
    add({
      id: 'pension-withholding', category: 'Payments', priority: 'low',
      title: 'Little withholding on pension/IRA income',
      detail: 'Use Form W-4P / W-4R to have tax withheld from distributions; a year-end IRA distribution with heavy withholding is treated as paid evenly through the year for penalty purposes.',
    });
  }

  // ------------------------------------------------------------- Credits & family
  const kids = input.dependents.map((d) => ({ d, age: ageAtYearEnd(d.dob) ?? 99 }));
  const born2025to2028 = kids.filter(({ d }) => d.dob >= '2025-01-01' && d.dob <= '2028-12-31' && d.hasSsn);
  if (kids.some(({ age }) => age < 18)) {
    add({
      id: 'trump-account', category: 'Credits', priority: born2025to2028.length ? 'high' : 'low',
      title: born2025to2028.length ? `Claim the $1,000 Trump Account pilot contribution for ${born2025to2028.map(({ d }) => d.firstName || 'child').join(', ')}` : 'Trump Accounts are available for children under 18',
      detail: 'OBBBA "Trump Accounts" (IRC §530A) accept up to $5,000/year of family contributions starting July 4, 2026, plus up to $2,500 tax-free from an employer. Children born 2025–2028 who are U.S. citizens with an SSN receive a one-time $1,000 Treasury deposit when the election (Form 4547) is filed.',
    });
  }
  if (f.childCareQualifyingPersons > 0) {
    const fsa = sum(input.w2s.map((w) => w.dependentCareBenefits));
    if (fsa < P.CHILD_CARE.fsaExclusion && input.credits.childCareExpenses > fsa) {
      add({
        id: 'dcfsa', category: 'Credits', priority: 'medium',
        title: 'Dependent care FSA limit is now $7,500',
        detail: `At a ${pct(f.childCareRate)} Form 2441 credit rate versus a combined marginal rate of about ${pct(marginal.federal + marginal.california + 0.0765)} (incl. FICA), pre-tax dependent-care FSA dollars ${f.childCareRate < marginal.federal + 0.0765 ? 'are likely worth more than the credit' : 'may be worth less than the credit at this income'}; elect at open enrollment for 2027. Note California only excludes $5,000.`,
      });
    }
  }
  if (f.saversCredit === 0 && f.agi <= P.SAVERS_CREDIT.tiers[status][2] && f.agi > 0 && !input.client.taxpayer.canBeClaimed) {
    add({
      id: 'savers', category: 'Credits', priority: 'medium',
      title: "Eligible for the saver's credit with a retirement contribution",
      detail: `AGI of ${$(f.agi)} qualifies for a 10–50% credit on up to $2,000 per person of IRA or workplace-plan contributions (Form 8880).`,
      estimatedSavings: whatIf((d) => { d.adjustments.rothIraT += 2000; }),
    });
  }
  const single = status === 'single';
  if (single && kids.some(({ d }) => d.monthsLived > 6)) {
    const savings = whatIf((d) => { d.client.filingStatus = 'hoh'; });
    if (savings > 0) {
      add({
        id: 'hoh', category: 'Credits', priority: 'high',
        title: 'Head of household status may apply',
        detail: 'An unmarried taxpayer who paid more than half the cost of keeping up a home for a qualifying person who lived there more than half the year can file as head of household (larger standard deduction and wider brackets).',
        estimatedSavings: savings,
      });
    }
  }
  if (f.eitc > 0) {
    add({
      id: 'eitc', category: 'Credits', priority: 'info',
      title: `Earned income credit of ${$(f.eitc)} projected`,
      detail: `Keep investment income at or below ${$(P.EITC.investmentIncomeLimit)}. Also check California's CalEITC and Young Child Tax Credit (FTB 3514), which this projection does not compute.`,
    });
  }
  if (input.credits.students.length && f.educationNonrefundable + f.aotcRefundable === 0 && f.agi > P.EDUCATION.phaseout[status][1]) {
    add({
      id: 'education-phaseout', category: 'Credits', priority: 'low',
      title: 'Education credits are fully phased out at this income',
      detail: 'Consider having a student who is not claimed as a dependent claim the AOTC, or use 529 plan distributions for qualified expenses.',
    });
  }

  // ------------------------------------------------------------- Business
  for (const w of people) {
    const p = f.persons[w];
    if (p.seNetProfit <= 5000) continue;
    const sep = w === 'T' ? input.adjustments.sepSimpleT : input.adjustments.sepSimpleS;
    if (sep > 0) continue;
    const room = Math.min(0.2 * (p.seNetProfit - p.seTax / 2), 72000);
    const savings = whatIf((d) => { if (w === 'T') d.adjustments.sepSimpleT += room; else d.adjustments.sepSimpleS += room; });
    add({
      id: `sep-${w}`, category: 'Business', priority: 'medium',
      title: `${personName(w)}: SEP-IRA or solo 401(k) contribution of about ${$(room)}`,
      detail: 'Self-employed retirement contributions reduce income tax (not SE tax). A SEP can be opened and funded until the extended due date; a solo 401(k) also allows an employee deferral if the W-2 deferral limit is not used.',
      estimatedSavings: savings,
    });
  }
  const qbiThreshold = P.QBI.threshold[status];
  const tiBeforeQbi = f.taxableIncome + f.qbiDeduction;
  if (f.qbiTotal > 0 && tiBeforeQbi > qbiThreshold && tiBeforeQbi < qbiThreshold + P.QBI.phaseInRange[status] + 50000) {
    add({
      id: 'qbi-threshold', category: 'Business', priority: 'medium',
      title: 'QBI deduction is limited by the income threshold',
      detail: `Taxable income before QBI (${$(tiBeforeQbi)}) is above ${$(qbiThreshold)}; the W-2 wage/UBIA limit and SSTB phase-out apply over the next ${$(P.QBI.phaseInRange[status])}. Reducing taxable income (retirement plan contributions, timing) can restore the deduction; for S-corp owners, reasonable compensation affects the wage limit.`,
    });
  }
  const passThrough = input.k1s.filter((k) => (k.type === '1065' || k.type === '1120S') && k.ordinaryIncome > 25000);
  if (passThrough.length && f.itemizes && f.schA.saltPaid > f.schA.saltCap && sum(input.k1s.map((k) => k.caPtetCredit)) === 0) {
    const income = sum(passThrough.map((k) => k.ordinaryIncome));
    add({
      id: 'ptet', category: 'California', priority: 'high',
      title: 'Evaluate the California pass-through entity elective tax (PTET)',
      detail: `K-1 income of ${$(income)} from ${passThrough.map((k) => k.entityName || 'entity').join(', ')}. The 9.3% CA PTET is deducted at the entity level (outside the SALT cap) and passed back as a CA credit — roughly ${$(income * 0.093 * f.marginalOrdinaryRate)} of federal savings. California extended PTET through 2030; the 2026 election required a June 15, 2026 prepayment, so confirm whether the entity made it and plan for 2027.`,
      estimatedSavings: income * 0.093 * f.marginalOrdinaryRate,
    });
  }

  // ------------------------------------------------------------- AMT
  if (f.amt > 0) {
    add({
      id: 'amt', category: 'Investments', priority: 'medium',
      title: `Alternative minimum tax of ${$(f.amt)}`,
      detail: `${input.amt.isoBargainElement > 0 ? 'ISO exercises create an AMT preference; consider spreading exercises across years or a same-year disqualifying sale. ' : ''}OBBBA keeps the higher AMT exemption but lowers the phase-out thresholds to $500,000/$1,000,000 and doubles the phase-out rate to 50% for 2026, so more high earners are exposed. AMT paid on deferral items may create a minimum tax credit (Form 8801).`,
    });
  }

  // ------------------------------------------------------------- California
  if (!input.client.caRenter && input.itemized.mortgageInterest === 0 && input.itemized.realEstateTax === 0 && input.client.caResident) {
    const limit = joint || status === 'hoh' ? C.CA_RENTERS_CREDIT.joint : C.CA_RENTERS_CREDIT.single;
    if (ca.caAgi <= limit.agiLimit) {
      add({
        id: 'renters', category: 'California', priority: 'low',
        title: "Check eligibility for California's renter's credit",
        detail: `No home ownership is entered and CA AGI (${$(ca.caAgi)}) is under ${$(limit.agiLimit)}. Renting a CA principal residence for at least half the year qualifies for a ${$(limit.amount)} nonrefundable credit — mark "CA renter" on Client Information.`,
      });
    }
  }
  if (ca.mhst > 0) {
    add({
      id: 'mhst', category: 'California', priority: 'medium',
      title: `California 1% Behavioral Health Services Tax: ${$(ca.mhst)}`,
      detail: 'Taxable income over $1,000,000 is taxed at a combined 13.3%. Spreading large gains or bonuses across tax years, installment sales, or charitable remainder trusts can keep income below the threshold.',
    });
  }
  const caDiff = sum(input.w2s.map((w) => w.qualifiedOvertime + w.qualifiedTips));
  if (caDiff > 0 || f.sch1A.senior > 0) {
    add({
      id: 'ca-nonconformity', category: 'California', priority: 'info',
      title: 'California does not conform to the federal tips/overtime/senior deductions',
      detail: `The ${$(f.sch1A.total)} of Schedule 1-A deductions reduce federal tax only; plan California withholding and estimates accordingly.`,
    });
  }
  if (f.hsaDeduction > 0) {
    add({
      id: 'ca-hsa', category: 'California', priority: 'info',
      title: 'HSA contributions and earnings are taxable in California',
      detail: 'California adds back HSA deductions and taxes HSA interest, dividends and gains annually. Consider holding HSA investments with low turnover.',
    });
  }

  // ------------------------------------------------------------- Law change notes
  add({
    id: 'energy-expired', category: 'Law change', priority: 'info',
    title: 'Clean vehicle and home energy credits are no longer available for 2026',
    detail: 'OBBBA ended the new/used/commercial clean vehicle credits for vehicles acquired after September 30, 2025, and the energy efficient home improvement (25C) and residential clean energy (25D) credits for property placed in service after December 31, 2025.',
  });

  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2, info: 3 };
  return recs.sort((a, b) => order[a.priority] - order[b.priority] || (b.estimatedSavings ?? 0) - (a.estimatedSavings ?? 0));
}

