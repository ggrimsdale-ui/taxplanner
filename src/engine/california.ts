// 2026 California Form 540 simulation (full-year resident).

import * as C from './paramsCA2026';
import { UNDERPAYMENT_RATE } from './params2026';
import type { FederalResult } from './federal';
import { taxableDistribution } from './federal';
import type { FormLine, RenderedForm, TaxReturnInput } from './types';
import { bracketTax, daysBetween, includeOwner, is65, marginalBracketRate, pos, round, sum } from './util';

export interface CaResult {
  federalAgi: number;
  subtractions: number;
  additions: number;
  subtractionItems: Array<[string, number]>;
  additionItems: Array<[string, number]>;
  caAgi: number;
  standardDeduction: number;
  itemizedBeforeLimit: number;
  itemizedLimitation: number;
  itemized: number;
  itemizes: boolean;
  deduction: number;
  taxableIncome: number;
  tax: number;
  exemptionCredits: number;
  taxAfterExemptions: number;
  childCareCredit: number;
  rentersCredit: number;
  ptetCredit: number;
  otherCredits: number;
  totalCredits: number;
  taxAfterCredits: number;
  amt: number;
  mhst: number;
  earlyDistributionTax: number;
  totalTax: number;
  withholding: number;
  estimatedPayments: number;
  extensionPayment: number;
  totalPayments: number;
  refund: number;
  owed: number;
  estimatedTaxPenalty: number;
  safeHarborRequired: number;
  marginalRate: number;
  effectiveRate: number;
  diagnostics: string[];
  forms: RenderedForm[];
}

export function computeCalifornia(input: TaxReturnInput, fed: FederalResult): CaResult {
  const status = input.client.filingStatus;
  const joint = status === 'mfj';
  const diagnostics: string[] = [];
  if (!input.client.caResident) {
    diagnostics.push('Client is not marked as a full-year California resident; Form 540 is shown for illustration only (540NR is not modeled).');
  }
  const own = <T extends { owner: 'T' | 'S' | 'J' }>(xs: T[]) => xs.filter((x) => includeOwner(input, x.owner));
  const w2s = own(input.w2s);
  const ints = own(input.int1099s);
  const k1s = own(input.k1s);
  const r1099s = own(input.r1099s);

  // ------------------------------------------------------------- Schedule CA
  const subtractionItems: Array<[string, number]> = [
    ['Taxable social security benefits', fed.ssTaxable],
    ['U.S. obligation interest (1099-INT box 3)', sum(ints.map((i) => i.usBondInterest))],
    ['State income tax refund', input.otherIncome.taxableRefunds],
    ['Unemployment compensation', input.otherIncome.unemployment],
  ];
  const k1Adj = sum(k1s.map((k) => k.caAdjustment));
  if (k1Adj < 0) subtractionItems.push(['K-1 California adjustments', -k1Adj]);

  const depCareBenefits = sum(w2s.map((w) => w.dependentCareBenefits));
  const fedExcluded = depCareBenefits - fed.taxableDependentCare;
  const caExcluded = Math.min(fedExcluded, status === 'mfs' ? 2500 : 5000);
  const additionItems: Array<[string, number]> = [
    ['Non-California municipal bond interest', sum(ints.map((i) => i.taxExemptNonCa))],
    ['HSA deduction (CA does not conform)', fed.hsaDeduction],
    ['Employer HSA contributions (W-2 box 12 W)', sum(w2s.map((w) => w.hsaEmployer))],
    ['Educator expenses (CA does not conform)', fed.educator],
    ['Dependent care benefits over $5,000 (CA does not conform to $7,500)', pos(fedExcluded - caExcluded)],
  ];
  if (k1Adj > 0) additionItems.push(['K-1 California adjustments', k1Adj]);

  const subtractions = sum(subtractionItems.map(([, v]) => v));
  const additions = sum(additionItems.map(([, v]) => v));
  const caAgi = fed.agi - subtractions + additions;

  const stateWageDiff = sum(w2s.map((w) => (w.stateWages ? w.stateWages - w.wages : 0)));
  if (Math.abs(stateWageDiff) > 1 && Math.abs(stateWageDiff - sum(w2s.map((w) => w.hsaEmployer))) > 1) {
    diagnostics.push(`W-2 box 16 (CA wages) differs from box 1 by $${round(stateWageDiff).toLocaleString()}; review for CA wage adjustments not modeled.`);
  }

  // -------------------------------------------------------------- Deductions
  const it = input.itemized;
  const t = input.client.taxpayer;
  const s = input.client.spouse;
  let std = C.CA_STANDARD_DEDUCTION[status];
  if (t.canBeClaimed) std = Math.min(std, Math.max(1350, pos(fed.persons.T.earnedIncome) + 450));

  const medical = pos(it.medical - 0.075 * caAgi);
  const taxes = it.realEstateTax + it.personalPropertyTax;
  const mortgageRatio = it.mortgageBalance > 1000000 ? 1000000 / it.mortgageBalance : 1;
  const mortgage = (it.mortgageInterest + it.mortgagePoints) * mortgageRatio;
  const investmentInterest = fed.schA.investmentInterest;
  const charity = Math.min(it.charityCash + sum(k1s.map((k) => k.charitable)), 0.5 * caAgi) + Math.min(it.charityNoncash, 0.3 * caAgi);
  const gambling = Math.min(it.gamblingLosses, input.otherIncome.gamblingWinnings);
  const misc = pos(it.caMiscellaneous - 0.02 * caAgi);
  const limitable = taxes + mortgage + charity + misc + it.otherItemized;
  const itemizedBeforeLimit = medical + investmentInterest + it.casualtyLoss + gambling + limitable;
  const threshold = C.CA_ITEMIZED_LIMIT.threshold[status];
  const itemizedLimitation = caAgi > threshold
    ? Math.min(C.CA_ITEMIZED_LIMIT.rate * (caAgi - threshold), C.CA_ITEMIZED_LIMIT.maxReduction * limitable)
    : 0;
  const itemized = itemizedBeforeLimit - itemizedLimitation;
  const itemizes = itemized > std;
  const deduction = itemizes ? itemized : std;
  const taxableIncome = pos(caAgi - deduction);

  // --------------------------------------------------------------------- Tax
  const tax = bracketTax(taxableIncome, C.CA_BRACKETS[status]);

  const personalCount = t.canBeClaimed ? 0 : (status === 'mfj' || status === 'qss' ? 2 : 1);
  const blindCount = (t.blind ? 1 : 0) + (joint && s.blind ? 1 : 0);
  const seniorCount = (is65(t.dob) ? 1 : 0) + (joint && is65(s.dob) ? 1 : 0);
  const depCount = input.dependents.length;
  const steps = Math.ceil(pos(caAgi - C.CA_EXEMPTION.phaseoutStart[status]) / C.CA_EXEMPTION.step[status]);
  const reduction = steps * C.CA_EXEMPTION.reductionPerStep;
  const personalCredits = pos((personalCount + blindCount + seniorCount) * (C.CA_EXEMPTION.personal - reduction));
  const dependentCredits = pos(depCount * (C.CA_EXEMPTION.dependent - reduction));
  const exemptionCredits = Math.min(tax, personalCredits + dependentCredits);
  const taxAfterExemptions = pos(tax - exemptionCredits);

  // ---------------------------------------------------------------- Credits
  let remaining = taxAfterExemptions;
  const take = (x: number) => { const v = Math.min(pos(x), remaining); remaining -= v; return v; };

  let childCarePotential = 0;
  const caTier = C.CA_CHILD_CARE.tiers.find(([ceiling]) => fed.agi <= ceiling);
  if (caTier && fed.childCareQualifyingPersons > 0 && status !== 'mfs') {
    const cap = fed.childCareQualifyingPersons >= 2 ? C.CA_CHILD_CARE.expenseTwoPlus : C.CA_CHILD_CARE.expenseOne;
    const lowerEarned = joint ? Math.min(fed.persons.T.earnedIncome, fed.persons.S.earnedIncome) : fed.persons.T.earnedIncome;
    const eligible = Math.min(input.credits.childCareExpenses, pos(cap - caExcluded), pos(lowerEarned));
    // CA did not adopt the OBBBA 50% rate; it uses the pre-2021 federal 35%/20% schedule.
    const fedPct = Math.max(0.2, 0.35 - Math.ceil(pos(fed.agi - 15000) / 2000) * 0.01);
    childCarePotential = eligible * fedPct * caTier[1];
  }
  const childCareCredit = take(childCarePotential);

  const renterRule = joint || status === 'hoh' || status === 'qss' ? C.CA_RENTERS_CREDIT.joint : C.CA_RENTERS_CREDIT.single;
  const rentersCredit = input.client.caRenter && caAgi <= renterRule.agiLimit && !t.canBeClaimed ? take(renterRule.amount) : 0;

  const ptetAvailable = sum(k1s.map((k) => k.caPtetCredit));
  const ptetCredit = take(ptetAvailable);
  if (ptetAvailable > ptetCredit + 1) {
    diagnostics.push(`$${round(ptetAvailable - ptetCredit).toLocaleString()} of CA PTE elective tax credit exceeds 2026 tax and carries forward (up to 5 years).`);
  }
  const otherCredits = take(input.credits.caOtherCredits);
  const totalCredits = childCareCredit + rentersCredit + ptetCredit + otherCredits;
  const taxAfterCredits = pos(taxAfterExemptions - totalCredits);

  // Schedule P (simplified)
  const amti = taxableIncome + (itemizes ? taxes + misc : std) + input.amt.isoBargainElement + input.amt.otherAdjustments;
  const amtExemption = pos(C.CA_AMT.exemption[status] - C.CA_AMT.phaseoutRate * pos(amti - C.CA_AMT.phaseoutStart[status]));
  const tmt = C.CA_AMT.rate * pos(amti - amtExemption);
  const amt = pos(tmt - taxAfterExemptions);

  const mhst = C.CA_MHST.rate * pos(taxableIncome - C.CA_MHST.threshold);
  const earlyDistributionTax = sum(r1099s.map((r) => /1/.test(r.distributionCode)
    ? pos(taxableDistribution(r) - r.penaltyExceptionAmount) * C.CA_EARLY_DISTRIBUTION_RATE : 0));
  const totalTax = taxAfterCredits + amt + mhst + earlyDistributionTax;

  // ---------------------------------------------------------------- Payments
  const pay = input.payments;
  const withholding = sum(w2s.map((w) => w.stateWithholding)) + sum(r1099s.map((r) => r.stateWithholding)) + pay.caOtherWithholding;
  const estimatedPayments = sum(pay.caEstimates) + pay.caPriorOverpayment;
  const extensionPayment = pay.caExtension;
  const totalPayments = withholding + estimatedPayments + extensionPayment;

  // Form 5805 (simplified)
  const prior = input.client.priorYear;
  let safeHarborRequired = 0.9 * totalTax;
  if (prior.caTotalTax > 0 && caAgi < 1000000) {
    safeHarborRequired = Math.min(safeHarborRequired, (prior.caAgi > (status === 'mfs' ? 75000 : 150000) ? 1.1 : 1) * prior.caTotalTax);
  }
  let estimatedTaxPenalty = 0;
  const penaltyFloor = status === 'mfs' ? 250 : 500;
  if (totalTax - withholding >= penaltyFloor && withholding + estimatedPayments < safeHarborRequired) {
    let cumReq = 0;
    let cumPaid = 0;
    for (let q = 0; q < 4; q++) {
      cumReq += safeHarborRequired * C.CA_ESTIMATE_PCT[q];
      cumPaid += withholding / 4 + pay.caEstimates[q] + (q === 0 ? pay.caPriorOverpayment : 0);
      const short = pos(cumReq - cumPaid);
      const end = q < 3 ? C.CA_ESTIMATE_DUE_DATES[q + 1] : '2027-04-15';
      estimatedTaxPenalty += short * UNDERPAYMENT_RATE * daysBetween(C.CA_ESTIMATE_DUE_DATES[q], end) / 365;
    }
  }

  const balance = totalPayments - totalTax;
  const refund = pos(balance);
  const owed = pos(-balance) + estimatedTaxPenalty;

  const res: CaResult = {
    federalAgi: fed.agi, subtractions, additions, subtractionItems, additionItems, caAgi,
    standardDeduction: std, itemizedBeforeLimit, itemizedLimitation, itemized, itemizes, deduction,
    taxableIncome, tax, exemptionCredits, taxAfterExemptions, childCareCredit, rentersCredit, ptetCredit,
    otherCredits, totalCredits, taxAfterCredits, amt, mhst, earlyDistributionTax, totalTax, withholding,
    estimatedPayments, extensionPayment, totalPayments, refund, owed, estimatedTaxPenalty, safeHarborRequired,
    marginalRate: marginalBracketRate(taxableIncome, C.CA_BRACKETS[status]) + (taxableIncome > C.CA_MHST.threshold ? C.CA_MHST.rate : 0),
    effectiveRate: caAgi > 0 ? totalTax / caAgi : 0,
    diagnostics, forms: [],
  };
  res.forms = renderCaForms(res, input);
  return res;
}

const L = (line: string, label: string, amount?: number, total = false): FormLine => ({
  line, label, amount: amount === undefined ? undefined : round(amount), total,
});

function renderCaForms(r: CaResult, input: TaxReturnInput): RenderedForm[] {
  const c = input.client;
  return [
    {
      id: 'ca540', name: 'CA Form 540', title: 'California Resident Income Tax Return — 2026 (projected)',
      sections: [
        {
          title: 'Taxable income',
          lines: [
            { line: '', label: 'Name', text: `${c.taxpayer.firstName} ${c.taxpayer.lastName}`.trim() || '—' },
            L('13', 'Federal AGI from Form 1040, line 11', r.federalAgi),
            L('14', 'California adjustments — subtractions (Schedule CA, Part I, column B)', r.subtractions),
            L('15', 'Subtract line 14 from line 13', r.federalAgi - r.subtractions),
            L('16', 'California adjustments — additions (Schedule CA, Part I, column C)', r.additions),
            L('17', 'California adjusted gross income', r.caAgi, true),
            L('18', r.itemizes ? 'Itemized deductions (Schedule CA, Part II)' : 'Standard deduction', r.deduction),
            L('19', 'Taxable income', r.taxableIncome, true),
          ],
        },
        {
          title: 'Tax',
          lines: [
            L('31', 'Tax (rate schedule)', r.tax),
            L('32', 'Exemption credits', r.exemptionCredits),
            L('33', 'Subtract line 32 from line 31', r.taxAfterExemptions),
            L('35', 'Add lines 33 and 34', r.taxAfterExemptions, true),
          ],
        },
        {
          title: 'Special credits',
          lines: [
            L('40', 'Nonrefundable child and dependent care expenses credit (FTB 3506)', r.childCareCredit),
            L('43', 'Pass-through entity elective tax credit (FTB 3804-CR)', r.ptetCredit),
            L('45', 'Other credits', r.otherCredits),
            L('46', "Nonrefundable renter's credit", r.rentersCredit),
            L('47', 'Total credits', r.totalCredits),
            L('48', 'Subtract line 47 from line 35', r.taxAfterCredits, true),
          ],
        },
        {
          title: 'Other taxes',
          lines: [
            L('61', 'Alternative minimum tax (Schedule P)', r.amt),
            L('62', 'Behavioral Health Services Tax (1% over $1,000,000)', r.mhst),
            L('63', 'Other taxes — early distributions (FTB 3805P, 2.5%)', r.earlyDistributionTax),
            L('64', 'Total tax', r.totalTax, true),
          ],
        },
        {
          title: 'Payments',
          lines: [
            L('71', 'California income tax withheld', r.withholding),
            L('72', '2026 CA estimated tax and other payments', r.estimatedPayments),
            L('73', 'Extension payment', r.extensionPayment),
            L('78', 'Total payments', r.totalPayments, true),
          ],
        },
        {
          title: 'Overpaid tax / Tax due',
          lines: [
            L('97', 'Overpaid tax', r.refund),
            L('115', 'Refund', r.refund, true),
            L('111', 'Amount you owe', r.owed, true),
            L('113', 'Underpayment of estimated tax (FTB 5805, projected)', r.estimatedTaxPenalty),
          ],
        },
      ],
    },
    {
      id: 'schCA', name: 'Schedule CA (540)', title: 'California Adjustments — Residents',
      sections: [
        { title: 'Part I — Subtractions (column B)', lines: [...r.subtractionItems.filter(([, v]) => v).map(([k, v]) => L('B', k, v)), L('', 'Total subtractions', r.subtractions, true)] },
        { title: 'Part I — Additions (column C)', lines: [...r.additionItems.filter(([, v]) => v).map(([k, v]) => L('C', k, v)), L('', 'Total additions', r.additions, true)] },
        {
          title: 'Part II — Adjustments to Federal Itemized Deductions',
          lines: [
            L('', 'CA itemized before limitation (no SALT cap; no state income tax; $1M mortgage limit)', r.itemizedBeforeLimit),
            L('29', 'Itemized deduction limitation (6% of AGI over threshold)', -r.itemizedLimitation),
            L('30', 'California itemized deductions', r.itemized, true),
            L('', 'California standard deduction', r.standardDeduction),
          ],
        },
      ],
      notes: ['California does not conform to the OBBBA tips, overtime, car loan interest or senior deductions; they are never in federal AGI, so no Schedule CA entry is needed, but they do not reduce California taxable income.'],
    },
  ];
}
