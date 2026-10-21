// 2026 federal Form 1040 computation with supporting schedules.

import * as P from './params2026';
import type { FilingStatus, FormLine, RenderedForm, TaxReturnInput } from './types';
import {
  ageAtYearEnd, bracketTax, clamp, daysBetween, includeOwner, is65, isJoint,
  marginalBracketRate, phaseFraction, pos, round, sum,
} from './util';

export interface PersonTotals {
  wages: number;
  medicareWages: number;
  ssWages: number;
  ssTaxWithheld: number;
  seNetProfit: number;
  seNetEarnings: number;
  seTax: number;
  earnedIncome: number;
  electiveDeferrals: number;
  rothDeferrals: number;
  coveredByPlan: boolean;
  age: number | null;
  is65: boolean;
  hsaEmployer: number;
  hsaLimit: number;
  iraContribution: number;
  iraDeduction: number;
  retirementDistributions: number;
}

export interface FederalResult {
  status: FilingStatus;
  persons: { T: PersonTotals; S: PersonTotals };
  // Income
  wages: number;
  taxableDependentCare: number;
  taxableInterest: number;
  taxExemptInterest: number;
  ordinaryDividends: number;
  qualifiedDividends: number;
  iraGross: number;
  iraTaxable: number;
  pensionGross: number;
  pensionTaxable: number;
  ssBenefits: number;
  ssTaxable: number;
  shortTermNet: number;
  longTermNet: number;
  capitalGainLine7: number;
  capitalLossCarryover: { shortTerm: number; longTerm: number };
  netCapitalGain: number;
  scheduleCNet: number;
  scheduleENet: number;
  rentalNet: number;
  k1Nonpassive: number;
  passiveNet: number;
  passiveSuspended: number;
  ordinaryGain4797: number;
  sch1Additional: number;
  totalIncome: number;
  // Adjustments
  educator: number;
  hsaDeduction: number;
  seTaxDeduction: number;
  sepSimple: number;
  seHealth: number;
  earlyWithdrawalPenalty: number;
  iraDeduction: number;
  studentLoan: number;
  totalAdjustments: number;
  agi: number;
  // Deductions
  standardDeduction: number;
  itemizedBeforeLimit: number;
  itemizedLimitation: number;
  itemizedAllowed: number;
  itemizes: boolean;
  deduction: number;
  nonItemizerCharity: number;
  schA: {
    medical: number; saltPaid: number; saltCap: number; saltAllowed: number;
    stateIncomeTax: number; realEstate: number; personalProperty: number;
    interest: number; mortgageInterestAllowed: number; investmentInterest: number;
    charity: number; charityFloor: number; casualty: number; other: number;
  };
  qbiDeduction: number;
  qbiTotal: number;
  sch1A: { tips: number; overtime: number; carLoan: number; senior: number; total: number; magi: number };
  taxableIncome: number;
  // Tax
  regularTax: number;
  usedCapitalGainWorksheet: boolean;
  amt: number;
  amti: number;
  amtExemption: number;
  // Credits
  foreignTaxCredit: number;
  childCareCredit: number;
  childCareRate: number;
  educationNonrefundable: number;
  aotcRefundable: number;
  saversCredit: number;
  otherNonrefundable: number;
  ctcOdc: number;
  ctcPotential: number;
  actc: number;
  qualifyingChildren: number;
  otherDependents: number;
  childCareQualifyingPersons: number;
  eitc: number;
  // Other taxes
  seTax: number;
  earlyDistributionTax: number;
  addlMedicare: number;
  niit: number;
  netInvestmentIncome: number;
  otherTaxes: number;
  // Totals
  taxBeforeCredits: number;
  totalNonrefundable: number;
  totalTax: number;
  withholdingW2: number;
  withholding1099: number;
  withholdingOther: number;
  totalWithholding: number;
  estimatedPayments: number;
  excessSsWithheld: number;
  extensionPayment: number;
  otherRefundable: number;
  totalPayments: number;
  refund: number;
  owed: number;
  estimatedTaxPenalty: number;
  safeHarborRequired: number;
  paidTowardSafeHarbor: number;
  marginalOrdinaryRate: number;
  effectiveRate: number;
  diagnostics: string[];
  forms: RenderedForm[];
}

const sumBy = <T>(xs: T[], f: (x: T) => number) => sum(xs.map(f));

export function computeFederal(input: TaxReturnInput): FederalResult {
  const status = input.client.filingStatus;
  const joint = isJoint(status);
  const diagnostics: string[] = [];
  const own = <T extends { owner: 'T' | 'S' | 'J' }>(xs: T[]) => xs.filter((x) => includeOwner(input, x.owner));
  const ofPerson = <T extends { owner: 'T' | 'S' | 'J' }>(xs: T[], who: 'T' | 'S') =>
    xs.filter((x) => x.owner === who || (x.owner === 'J' && who === 'T'));

  if (!joint && [...input.w2s, ...input.r1099s, ...input.scheduleCs].some((x) => x.owner === 'S')) {
    diagnostics.push('Spouse-owned items are excluded because the filing status is not Married Filing Jointly.');
  }

  const w2s = own(input.w2s);
  const k1s = own(input.k1s);
  const r1099s = own(input.r1099s);
  const ints = own(input.int1099s);
  const divs = own(input.div1099s);
  const schCs = own(input.scheduleCs);
  const rentals = own(input.rentals);

  const t = input.client.taxpayer;
  const s = input.client.spouse;

  // ---------------------------------------------------------------- Schedule C
  const schCNet = (c: (typeof schCs)[number]) =>
    c.grossReceipts - c.returns - c.cogs + c.otherIncome -
    (c.advertising + c.carTruck + c.depreciation + c.insurance + c.legalProfessional + c.office +
      c.rentLease + c.supplies + c.travel + c.meals * 0.5 + c.utilities + c.wagesPaid + c.otherExpenses) -
    c.homeOffice;
  const scheduleCNet = sumBy(schCs, schCNet);

  // ------------------------------------------------------------ Schedule SE
  const person = (who: 'T' | 'S'): PersonTotals => {
    const p = who === 'T' ? t : s;
    const pw2 = w2s.filter((w) => w.owner === who);
    const seProfit = sumBy(schCs.filter((c) => c.owner === who), schCNet) +
      sumBy(ofPerson(k1s, who).filter((k) => k.type === '1065'), (k) => k.seEarnings);
    const ssWages = sumBy(pw2, (w) => w.ssWages + w.ssTips);
    let ne = pos(seProfit) * P.SE_TAX.netEarningsFactor;
    if (ne < P.SE_TAX.minimum) ne = 0;
    const ssPortion = Math.min(ne, pos(P.SE_TAX.ssWageBase - ssWages)) * P.SE_TAX.ssRate;
    const seTax = ssPortion + ne * P.SE_TAX.medicareRate;
    const age = ageAtYearEnd(p.dob);
    const hsaBase = p.hdhpCoverage === 'family' ? P.HSA.family : p.hdhpCoverage === 'self' ? P.HSA.self : 0;
    const hsaLimit = hsaBase ? hsaBase + ((age ?? 0) >= 55 ? P.HSA.catchUp55 : 0) : 0;
    return {
      wages: sumBy(pw2, (w) => w.wages),
      medicareWages: sumBy(pw2, (w) => w.medicareWages),
      ssWages,
      ssTaxWithheld: sumBy(pw2, (w) => w.ssTax),
      seNetProfit: seProfit,
      seNetEarnings: ne,
      seTax,
      earnedIncome: sumBy(pw2, (w) => w.wages) + (ne > 0 ? seProfit - seTax / 2 : Math.min(0, seProfit)),
      electiveDeferrals: sumBy(pw2, (w) => w.electiveDeferrals),
      rothDeferrals: sumBy(pw2, (w) => w.rothDeferrals),
      coveredByPlan: pw2.some((w) => w.retirementPlan),
      age,
      is65: is65(p.dob),
      hsaEmployer: sumBy(pw2, (w) => w.hsaEmployer),
      hsaLimit,
      iraContribution: who === 'T' ? input.adjustments.traditionalIraT : input.adjustments.traditionalIraS,
      iraDeduction: 0,
      retirementDistributions: sumBy(r1099s.filter((r) => r.owner === who), (r) => taxableDistribution(r)),
    };
  };
  const persons = { T: person('T'), S: joint ? person('S') : emptyPerson() };
  if (!joint && status === 'mfs') persons.S.is65 = is65(s.dob);
  const seTax = persons.T.seTax + persons.S.seTax;

  // ---------------------------------------------------------- Form 1040 income
  const wages = sumBy(w2s, (w) => w.wages);
  const depCareBenefits = sumBy(w2s, (w) => w.dependentCareBenefits);
  const fsaLimit = status === 'mfs' ? P.CHILD_CARE.fsaExclusionMfs : P.CHILD_CARE.fsaExclusion;
  const lowerEarned = joint ? Math.min(persons.T.earnedIncome, persons.S.earnedIncome) : persons.T.earnedIncome;
  const depCareExcluded = Math.min(depCareBenefits, fsaLimit, pos(lowerEarned),
    depCareBenefits > 0 ? Math.max(input.credits.childCareExpenses, 0) : 0);
  const taxableDependentCare = pos(depCareBenefits - depCareExcluded);

  const taxableInterest = sumBy(ints, (i) => i.interest) + sumBy(k1s, (k) => k.interest);
  const taxExemptInterest = sumBy(ints, (i) => i.taxExempt) + sumBy(divs, (d) => d.exemptInterestDividends);
  const ordinaryDividends = sumBy(divs, (d) => d.ordinary) + sumBy(k1s, (k) => k.ordinaryDividends);
  const qualifiedDividends = sumBy(divs, (d) => d.qualified) + sumBy(k1s, (k) => k.qualifiedDividends);

  const iras = r1099s.filter((r) => r.ira);
  const pensions = r1099s.filter((r) => !r.ira);
  const iraGross = sumBy(iras, (r) => r.grossDistribution);
  const iraTaxable = sumBy(iras, taxableDistribution);
  const pensionGross = sumBy(pensions, (r) => r.grossDistribution);
  const pensionTaxable = sumBy(pensions, taxableDistribution);
  const qcdTotal = sumBy(iras, (r) => r.qcd);

  // Schedule D
  const txGain = (term: 'short' | 'long') =>
    sumBy(input.capitalTransactions.filter((c) => c.term === term), (c) => c.proceeds - c.basis + c.adjustment);
  const sec1231 = sumBy(k1s, (k) => k.section1231);
  const shortTermNet = txGain('short') + sumBy(k1s, (k) => k.shortTermGain) - pos(input.capitalCarryovers.shortTerm);
  const longTermNet = txGain('long') + sumBy(k1s, (k) => k.longTermGain) +
    sumBy(divs, (d) => d.capGainDistributions) + pos(sec1231) - pos(input.capitalCarryovers.longTerm);
  const netCap = shortTermNet + longTermNet;
  const lossLimit = P.CAPITAL_LOSS_LIMIT[status];
  const capitalGainLine7 = netCap >= 0 ? netCap : Math.max(netCap, -lossLimit);
  const capitalLossCarryover = carryover(shortTermNet, longTermNet, lossLimit);
  const netCapitalGain = pos(Math.min(longTermNet, netCap));
  const ordinaryGain4797 = input.otherIncome.form4797Gain + Math.min(0, sec1231);

  // Schedule E (rentals + K-1) with a simplified Form 8582 passive limitation
  const rentalNetOf = (r: (typeof rentals)[number]) =>
    r.rents - (r.mortgageInterest + r.taxes + r.insurance + r.repairs + r.depreciation + r.otherExpenses);
  const rentalNet = sumBy(rentals, rentalNetOf);
  const k1Business = (k: (typeof k1s)[number]) => k.ordinaryIncome + k.rentalRealEstate + k.otherRental - k.section179;
  const k1Nonpassive = sumBy(k1s.filter((k) => !k.passive), (k) => k1Business(k) + k.guaranteedPayments) +
    sumBy(k1s, (k) => k.royalties);
  const passiveK1 = sumBy(k1s.filter((k) => k.passive), (k) => k1Business(k) + k.guaranteedPayments);
  const passiveNet = rentalNet + passiveK1;

  // Income before Schedule E for the $25,000 special allowance phase-out.
  const preliminary =
    wages + taxableDependentCare + taxableInterest + ordinaryDividends + iraTaxable + pensionTaxable +
    capitalGainLine7 + scheduleCNet + k1Nonpassive + ordinaryGain4797;
  let allowedPassive = passiveNet;
  let passiveSuspended = 0;
  if (passiveNet < 0) {
    const activeLosses = -Math.min(0, sumBy(rentals.filter((r) => r.activeParticipation), rentalNetOf));
    const maxAllowance = status === 'mfs' ? 0 : 25000;
    const allowance = Math.min(activeLosses, pos(maxAllowance - pos(preliminary - 100000) * 0.5));
    allowedPassive = Math.max(passiveNet, -allowance);
    passiveSuspended = allowedPassive - passiveNet;
    if (passiveSuspended > 0) diagnostics.push(`Passive losses of $${round(passiveSuspended).toLocaleString()} are suspended (Form 8582) and carry forward.`);
  }
  const scheduleENet = k1Nonpassive + allowedPassive;

  const oi = input.otherIncome;
  const k1OtherIncome = sumBy(k1s, (k) => k.otherIncome);
  const otherLine8 = oi.gamblingWinnings + oi.cancellationOfDebt + oi.juryDuty + oi.otherIncome + k1OtherIncome;
  const sch1Additional = oi.taxableRefunds + oi.alimonyReceived + scheduleCNet + ordinaryGain4797 +
    scheduleENet + oi.unemployment + otherLine8;

  const ssBenefitsT = input.socialSecurity.T.benefits;
  const ssBenefitsS = joint ? input.socialSecurity.S.benefits : 0;
  const ssBenefits = ssBenefitsT + ssBenefitsS;

  const incomeExSs = wages + taxableDependentCare + taxableInterest + ordinaryDividends + iraTaxable +
    pensionTaxable + capitalGainLine7 + sch1Additional;

  // ------------------------------------------------------- Schedule 1, Part II
  const adj = input.adjustments;
  const educator = Math.min(adj.educatorT, P.EDUCATOR_EXPENSE) + (joint ? Math.min(adj.educatorS, P.EDUCATOR_EXPENSE) : 0);
  const hsaFor = (who: 'T' | 'S', contrib: number) => {
    const p = persons[who];
    const room = pos(p.hsaLimit - p.hsaEmployer);
    if (contrib > room) diagnostics.push(`${who === 'T' ? 'Taxpayer' : 'Spouse'} HSA contributions exceed the 2026 limit; excess of $${round(contrib - room).toLocaleString()} is not deducted (6% excise may apply).`);
    return Math.min(contrib, room);
  };
  const hsaDeduction = hsaFor('T', adj.hsaT) + (joint ? hsaFor('S', adj.hsaS) : 0);
  const seTaxDeduction = seTax / 2;
  const sepSimple = adj.sepSimpleT + (joint ? adj.sepSimpleS : 0);
  const seProfitTotal = pos(persons.T.seNetProfit) + pos(persons.S.seNetProfit);
  const seHealth = Math.min(adj.seHealthInsurance, pos(seProfitTotal - seTaxDeduction - sepSimple));
  const earlyWithdrawalPenalty = sumBy(ints, (i) => i.earlyWithdrawalPenalty);
  const adjBeforeIra = educator + hsaDeduction + seTaxDeduction + sepSimple + seHealth +
    earlyWithdrawalPenalty + adj.alimonyPaid + adj.movingMilitary + adj.otherAdjustments;

  // Taxable social security before the IRA deduction (Pub. 590-A worksheet 1).
  const ssTaxableFor = (otherIncome: number) =>
    taxableSocialSecurity(status, ssBenefits, otherIncome + taxExemptInterest);
  const ssTaxablePrelim = ssTaxableFor(incomeExSs - adjBeforeIra);

  // IRA deduction
  const magiIra = incomeExSs + ssTaxablePrelim - adjBeforeIra;
  const iraDed = (who: 'T' | 'S'): number => {
    const p = persons[who];
    if (p.iraContribution <= 0) return 0;
    const limit = P.RETIREMENT.iraLimit + ((p.age ?? 0) >= 50 ? P.RETIREMENT.iraCatchUp : 0);
    const compensation = joint ? pos(persons.T.earnedIncome) + pos(persons.S.earnedIncome) : pos(p.earnedIncome);
    const allowed = Math.min(p.iraContribution, limit, compensation);
    const otherCovered = joint && persons[who === 'T' ? 'S' : 'T'].coveredByPlan;
    let range: [number, number] | null = null;
    if (p.coveredByPlan) range = P.RETIREMENT.iraPhaseoutCovered[status];
    else if (otherCovered) range = P.RETIREMENT.iraPhaseoutSpouseCovered;
    if (!range) return allowed;
    if (magiIra >= range[1]) return 0;
    if (magiIra <= range[0]) return allowed;
    let reduced = Math.ceil((limit * (range[1] - magiIra) / (range[1] - range[0])) / 10) * 10;
    if (reduced < 200) reduced = 200;
    return Math.min(allowed, reduced);
  };
  persons.T.iraDeduction = iraDed('T');
  persons.S.iraDeduction = joint ? iraDed('S') : 0;
  const iraDeduction = persons.T.iraDeduction + persons.S.iraDeduction;

  const ssTaxable = ssTaxableFor(incomeExSs - adjBeforeIra - iraDeduction);
  const totalIncome = incomeExSs + ssTaxable;

  // Student loan interest
  const magiSli = totalIncome - adjBeforeIra - iraDeduction;
  let studentLoan = 0;
  if (status !== 'mfs' && !t.canBeClaimed) {
    studentLoan = Math.min(adj.studentLoanInterest, P.STUDENT_LOAN.max) *
      phaseFraction(magiSli, P.STUDENT_LOAN.phaseout[status]);
  }
  const totalAdjustments = adjBeforeIra + iraDeduction + studentLoan;
  const agi = totalIncome - totalAdjustments;

  // ---------------------------------------------------------------- Deductions
  const boxes = (t.blind ? 1 : 0) + (persons.T.is65 ? 1 : 0) +
    (status === 'mfj' || status === 'mfs' ? (s.blind ? 1 : 0) + (is65(s.dob) ? 1 : 0) : 0);
  const married = status === 'mfj' || status === 'mfs' || status === 'qss';
  let baseStd = P.STANDARD_DEDUCTION[status];
  if (t.canBeClaimed) {
    baseStd = Math.min(baseStd, Math.max(P.DEPENDENT_STD_MIN, pos(persons.T.earnedIncome) + P.DEPENDENT_STD_EARNED_PLUS));
  }
  const standardDeduction = baseStd + boxes * (married ? P.ADDITIONAL_STD_MARRIED : P.ADDITIONAL_STD_UNMARRIED);

  const it = input.itemized;
  const medical = pos(it.medical - P.MEDICAL_FLOOR * agi);
  const caEstimatesPaidIn2026 = input.payments.caEstimates[0] + input.payments.caEstimates[1] + input.payments.caEstimates[2];
  const stateIncomeTax = sumBy(w2s, (w) => w.stateWithholding + w.caSdi) + sumBy(r1099s, (r) => r.stateWithholding) +
    caEstimatesPaidIn2026 + input.payments.caOtherWithholding + it.additionalStateIncomeTax;
  const incomeOrSales = it.useSalesTax ? it.salesTax : stateIncomeTax;
  const saltPaid = incomeOrSales + it.realEstateTax + it.personalPropertyTax;
  const mfs = status === 'mfs';
  const saltCap = Math.max(mfs ? P.SALT.floorMfs : P.SALT.floor,
    (mfs ? P.SALT.capMfs : P.SALT.cap) - P.SALT.phasedownRate * pos(agi - (mfs ? P.SALT.phasedownStartMfs : P.SALT.phasedownStart)));
  const saltAllowed = Math.min(saltPaid, saltCap);
  const mortgageRatio = it.mortgageBalance > P.MORTGAGE_DEBT_LIMIT ? P.MORTGAGE_DEBT_LIMIT / it.mortgageBalance : 1;
  const mortgageInterestAllowed = (it.mortgageInterest + it.mortgagePoints) * mortgageRatio;
  const pmiFraction = clamp(1 - Math.ceil(pos(agi - (mfs ? 50000 : 100000)) / (mfs ? 500 : 1000)) * 0.1, 0, 1);
  const pmi = it.mortgageInsurance * pmiFraction;
  const netInvIncomeForInterest = pos(taxableInterest + ordinaryDividends - qualifiedDividends + pos(shortTermNet) + sumBy(k1s, (k) => k.royalties));
  const investmentInterest = Math.min(it.investmentInterest, netInvIncomeForInterest);
  const interest = mortgageInterestAllowed + pmi + investmentInterest;
  const charityGross = Math.min(it.charityCash + sumBy(k1s, (k) => k.charitable), 0.6 * agi) + Math.min(it.charityNoncash, 0.3 * agi);
  const charityFloor = Math.min(charityGross, P.CHARITY_FLOOR_RATE * agi);
  const charity = pos(charityGross - charityFloor);
  const gamblingLossAllowed = Math.min(it.gamblingLosses * P.GAMBLING_LOSS_RATE, oi.gamblingWinnings);
  const otherItemized = it.otherItemized + gamblingLossAllowed;
  const itemizedBeforeLimit = medical + saltAllowed + interest + charity + it.casualtyLoss + otherItemized;

  // ------------------------------------------------------------- Schedule 1-A
  const magi1A = agi;
  const validSsn = t.validSsn && (!joint || s.validSsn);
  const can1A = status !== 'mfs';
  const tipsReported = sumBy(w2s, (w) => w.qualifiedTips) + input.schedule1A.additionalTips;
  const overtimeReported = sumBy(w2s, (w) => w.qualifiedOvertime) + input.schedule1A.additionalOvertime;
  const tipOtThreshold = joint ? P.SCHEDULE_1A.tipsOvertimePhaseoutJoint : P.SCHEDULE_1A.tipsOvertimePhaseout;
  const tipOtReduction = Math.floor(pos(magi1A - tipOtThreshold) / 1000) * P.SCHEDULE_1A.tipsOvertimeReductionPer1000;
  const tips = can1A && validSsn ? pos(Math.min(tipsReported, P.SCHEDULE_1A.tipsMax) - tipOtReduction) : 0;
  const overtime = can1A && validSsn
    ? pos(Math.min(overtimeReported, joint ? P.SCHEDULE_1A.overtimeMaxJoint : P.SCHEDULE_1A.overtimeMax) - tipOtReduction)
    : 0;
  const carThreshold = joint ? P.SCHEDULE_1A.carLoanPhaseoutJoint : P.SCHEDULE_1A.carLoanPhaseout;
  const carLoan = input.schedule1A.vehicleQualifies
    ? pos(Math.min(input.schedule1A.carLoanInterest, P.SCHEDULE_1A.carLoanMax) -
      Math.ceil(pos(magi1A - carThreshold) / 1000) * P.SCHEDULE_1A.carLoanReductionPer1000)
    : 0;
  if (input.schedule1A.carLoanInterest > 0 && !input.schedule1A.vehicleQualifies) {
    diagnostics.push('Car loan interest entered but the vehicle is not marked as qualifying (new, U.S.-assembled, personal use, loan after 2024).');
  }
  const seniorThreshold = joint ? P.SCHEDULE_1A.seniorPhaseoutJoint : P.SCHEDULE_1A.seniorPhaseout;
  const seniorEach = pos(P.SCHEDULE_1A.seniorAmount - P.SCHEDULE_1A.seniorPhaseoutRate * pos(magi1A - seniorThreshold));
  const seniorCount = can1A ? (persons.T.is65 && t.validSsn ? 1 : 0) + (joint && persons.S.is65 && s.validSsn ? 1 : 0) : 0;
  const senior = seniorCount * seniorEach;
  if (status === 'mfs' && (tipsReported > 0 || overtimeReported > 0 || persons.T.is65)) {
    diagnostics.push('Married Filing Separately filers cannot claim the tips, overtime or senior deductions (Schedule 1-A).');
  }
  const sch1ATotal = tips + overtime + carLoan + senior;

  // -------------------------------------------------- Taxable income iteration
  // The 2/37 itemized limitation and QBI both depend on taxable income.
  const top37 = P.BRACKETS[status][P.BRACKETS[status].length - 2][0];
  const choose = (itemizedAmt: number) => {
    const itemizes = it.forceItemize || itemizedAmt > standardDeduction;
    const deduction = itemizes ? itemizedAmt : standardDeduction;
    const nonItemizerCharity = itemizes ? 0 : Math.min(it.charityCash, P.NONITEMIZER_CHARITY[status]);
    return { itemizes, deduction, nonItemizerCharity };
  };

  const qbi = (tiBeforeQbi: number) =>
    qbiDeduction(input, status, tiBeforeQbi, netCapitalGain + qualifiedDividends, schCs.map((c) => ({
      qbi: schCNet(c) - allocateSeAdjustments(c.owner, schCNet(c)),
      w2: c.wagesPaid, ubia: 0, sstb: c.sstb, active: true,
    })), k1s.map((k) => ({
      qbi: k.qbiIncome, w2: k.qbiW2Wages, ubia: k.qbiUbia, sstb: k.sstb, active: !k.passive,
    })), sumBy(divs, (d) => d.section199a));

  function allocateSeAdjustments(owner: 'T' | 'S', net: number): number {
    const p = persons[owner];
    if (p.seNetProfit <= 0 || net <= 0) return 0;
    const share = net / p.seNetProfit;
    const ownerSep = owner === 'T' ? adj.sepSimpleT : adj.sepSimpleS;
    const ownerHealthShare = seProfitTotal > 0 ? seHealth * (pos(p.seNetProfit) / seProfitTotal) : 0;
    return share * (p.seTax / 2 + ownerSep + ownerHealthShare);
  }

  let pick = choose(itemizedBeforeLimit);
  let tiBeforeQbi = pos(agi - pick.deduction - pick.nonItemizerCharity - sch1ATotal);
  let qbiRes = qbi(tiBeforeQbi);
  let itemizedLimitation = 0;
  if (itemizedBeforeLimit > 0) {
    const tiNoLimit = pos(tiBeforeQbi - qbiRes.deduction);
    if (pick.itemizes) {
      itemizedLimitation = P.ITEMIZED_LIMIT_FRACTION * Math.min(itemizedBeforeLimit, pos(tiNoLimit + itemizedBeforeLimit - top37));
    }
    if (itemizedLimitation > 0) {
      pick = choose(itemizedBeforeLimit - itemizedLimitation);
      tiBeforeQbi = pos(agi - pick.deduction - pick.nonItemizerCharity - sch1ATotal);
      qbiRes = qbi(tiBeforeQbi);
      if (!pick.itemizes) itemizedLimitation = 0;
    }
  }
  const itemizedAllowed = itemizedBeforeLimit - itemizedLimitation;
  const { itemizes, deduction, nonItemizerCharity } = pick;
  const qbiDed = qbiRes.deduction;
  const taxableIncome = pos(tiBeforeQbi - qbiDed);

  // ----------------------------------------------------------------------- Tax
  const pref = Math.min(taxableIncome, qualifiedDividends + netCapitalGain);
  const usedCapitalGainWorksheet = pref > 0;
  const regularTax = usedCapitalGainWorksheet
    ? preferentialTax(taxableIncome, pref, status, (x) => bracketTax(x, P.BRACKETS[status]))
    : bracketTax(taxableIncome, P.BRACKETS[status]);

  // Form 6251 (simplified)
  const privateActivity = sumBy(ints, (i) => i.privateActivityBond);
  const amti = taxableIncome + (itemizes ? saltAllowed : deduction) +
    input.amt.isoBargainElement + privateActivity + input.amt.otherAdjustments;
  const amtExemption = pos(P.AMT.exemption[status] - P.AMT.phaseoutRate * pos(amti - P.AMT.phaseoutStart[status]));
  const amtBase = pos(amti - amtExemption);
  const amtThreshold = status === 'mfs' ? P.AMT.rate28Threshold / 2 : P.AMT.rate28Threshold;
  const amtOrdinary = (x: number) => x <= amtThreshold ? x * 0.26 : amtThreshold * 0.26 + (x - amtThreshold) * 0.28;
  const tmt = pref > 0 ? preferentialTax(amtBase, Math.min(amtBase, pref), status, amtOrdinary) : amtOrdinary(amtBase);
  const amt = pos(tmt - regularTax);

  const taxBeforeCredits = regularTax + amt; // line 18

  // ------------------------------------------------------------------- Credits
  let remaining = taxBeforeCredits;
  const take = (x: number) => { const v = Math.min(pos(x), remaining); remaining -= v; return v; };

  // Foreign tax credit
  const foreignTax = sumBy(divs, (d) => d.foreignTax) + input.credits.foreignTaxAdditional;
  if (foreignTax > P.FOREIGN_TAX_SIMPLIFIED_LIMIT[status]) {
    diagnostics.push('Foreign taxes exceed the Form 1116 exemption; the credit is shown without the Form 1116 limitation.');
  }
  const foreignTaxCredit = take(foreignTax);

  // Form 2441
  const deps = input.dependents;
  const depAge = (d: (typeof deps)[number]) => ageAtYearEnd(d.dob) ?? 99;
  const autoCarePersons = deps.filter((d) => depAge(d) < 13 || d.disabled).length;
  const childCareQualifyingPersons = input.credits.childCareQualifyingPersons || autoCarePersons;
  let childCareRate = 0;
  let childCarePotential = 0;
  if (childCareQualifyingPersons > 0 && status !== 'mfs') {
    const cap = childCareQualifyingPersons >= 2 ? P.CHILD_CARE.expenseTwoPlus : P.CHILD_CARE.expenseOne;
    const eligible = Math.min(input.credits.childCareExpenses, pos(cap - depCareExcluded), pos(lowerEarned));
    const step1 = Math.ceil(pos(agi - P.CHILD_CARE.firstPhaseStart) / P.CHILD_CARE.firstPhaseStep) * 0.01;
    childCareRate = Math.max(P.CHILD_CARE.midRate, P.CHILD_CARE.maxRate - step1);
    const step2 = Math.ceil(pos(agi - P.CHILD_CARE.secondPhaseStart[status]) / P.CHILD_CARE.secondPhaseStep[status]) * 0.01;
    childCareRate = Math.max(P.CHILD_CARE.minRate, childCareRate - step2);
    childCarePotential = eligible * childCareRate;
  }
  const childCareCredit = take(childCarePotential);

  // Form 8863
  let aotcTotal = 0;
  let llcExpenses = 0;
  for (const st of input.credits.students) {
    if (st.aotcEligible) {
      const e = st.qualifiedExpenses;
      aotcTotal += Math.min(e, 2000) + 0.25 * clamp(e - 2000, 0, 2000);
    } else llcExpenses += st.qualifiedExpenses;
  }
  const eduFraction = status === 'mfs' ? 0 : phaseFraction(agi, P.EDUCATION.phaseout[status]);
  const aotcAllowed = aotcTotal * eduFraction;
  const aotcRefundable = t.canBeClaimed ? 0 : aotcAllowed * P.EDUCATION.aotcRefundableRate;
  const llc = P.EDUCATION.llcRate * Math.min(llcExpenses, P.EDUCATION.llcExpenseMax) * eduFraction;
  const educationNonrefundable = take(aotcAllowed - aotcRefundable + llc);

  // Form 8880
  let saversCredit = 0;
  if (!t.canBeClaimed) {
    const [a, b, c] = P.SAVERS_CREDIT.tiers[status];
    const rate = agi <= a ? 0.5 : agi <= b ? 0.2 : agi <= c ? 0.1 : 0;
    const contrib = (who: 'T' | 'S') => {
      const p = persons[who];
      const roth = who === 'T' ? adj.rothIraT : adj.rothIraS;
      const age = p.age ?? 30;
      if (age < 18) return 0;
      return clamp(p.iraContribution + roth + p.electiveDeferrals + p.rothDeferrals - p.retirementDistributions, 0, P.SAVERS_CREDIT.contributionMax);
    };
    saversCredit = take(rate * (contrib('T') + (joint ? contrib('S') : 0)));
  }

  const otherNonrefundable = take(input.credits.otherNonrefundable);

  // Schedule 8812
  const qualifyingChildren = deps.filter((d) => depAge(d) < 17 && d.hasSsn && d.monthsLived >= 6).length;
  const otherDependents = deps.length - qualifyingChildren;
  const ctcPhase = Math.ceil(pos(agi - P.CTC.phaseoutStart[status]) / 1000) * 50;
  const taxpayerSsnOk = t.validSsn || (joint && s.validSsn);
  const ctcPotential = pos((taxpayerSsnOk ? qualifyingChildren * P.CTC.perChild : 0) + otherDependents * P.CTC.otherDependent - ctcPhase);
  const ctcOdc = take(ctcPotential);
  const earnedTotal = pos(persons.T.earnedIncome) + pos(persons.S.earnedIncome);
  const actc = taxpayerSsnOk && qualifyingChildren > 0
    ? Math.min(ctcPotential - ctcOdc, qualifyingChildren * P.CTC.refundableMax, P.CTC.refundableRate * pos(earnedTotal - P.CTC.earnedIncomeFloor))
    : 0;

  // Schedule EIC
  const eicChildren = deps.filter((d) => {
    const a = depAge(d);
    return d.hasSsn && d.monthsLived >= 6 && (a < 19 || (a < 24 && d.fullTimeStudent) || d.disabled);
  }).length;
  const investmentIncome = taxableInterest + taxExemptInterest + ordinaryDividends + pos(capitalGainLine7) + pos(rentalNet) + sumBy(k1s, (k) => pos(k.royalties));
  let eitc = 0;
  const tAge = persons.T.age ?? 40;
  const sAge = joint ? persons.S.age ?? 40 : -1;
  const ageOk = eicChildren > 0 || (tAge >= 25 && tAge <= 64) || (joint && sAge >= 25 && sAge <= 64);
  if (status !== 'mfs' && !t.canBeClaimed && ageOk && investmentIncome <= P.EITC.investmentIncomeLimit && earnedTotal > 0) {
    const row = P.EITC.table[Math.min(eicChildren, 3)];
    const phaseIn = Math.min(row.max, earnedTotal * (row.max / row.earned));
    const start = joint ? row.phaseoutStartJoint : row.phaseoutStart;
    const phaseOut = (inc: number) => pos(row.max - row.phaseoutRate * pos(inc - start));
    eitc = pos(Math.min(phaseIn, phaseOut(earnedTotal), phaseOut(Math.max(agi, earnedTotal))));
  }

  const totalNonrefundable = taxBeforeCredits - remaining;

  // --------------------------------------------------------------- Other taxes
  const earlyDistributionTax = sumBy(r1099s, (r) => {
    const code = r.distributionCode.toUpperCase();
    if (!code.includes('1') && !code.includes('S')) return 0;
    const rate = code.includes('S') ? 0.25 : P.EARLY_DISTRIBUTION_RATE;
    return pos(taxableDistribution(r) - r.penaltyExceptionAmount) * rate;
  });
  const medicareWages = persons.T.medicareWages + persons.S.medicareWages;
  const amThreshold = P.ADDL_MEDICARE.threshold[status];
  const seNe = persons.T.seNetEarnings + persons.S.seNetEarnings;
  const addlMedicare = P.ADDL_MEDICARE.rate * (pos(medicareWages - amThreshold) + pos(seNe - pos(amThreshold - medicareWages)));
  const addlMedicareWithheld = sumBy(w2s, (w) => pos(w.medicareTax - 0.0145 * w.medicareWages));

  const netInvestmentIncome = pos(taxableInterest + ordinaryDividends + pos(capitalGainLine7) + Math.min(0, capitalGainLine7) +
    allowedPassive + sumBy(k1s, (k) => k.royalties) - (itemizes ? investmentInterest : 0));
  const niit = P.NIIT.rate * Math.min(netInvestmentIncome, pos(agi - P.NIIT.threshold[status]));

  const otherTaxes = seTax + earlyDistributionTax + addlMedicare + niit;
  const totalTax = pos(taxBeforeCredits - totalNonrefundable) + otherTaxes;

  // ------------------------------------------------------------------ Payments
  const withholdingW2 = sumBy(w2s, (w) => w.fedWithholding);
  const withholding1099 = sumBy(r1099s, (r) => r.fedWithholding) + sumBy(ints, (i) => i.fedWithholding) +
    sumBy(divs, (d) => d.fedWithholding) + input.socialSecurity.T.fedWithholding + (joint ? input.socialSecurity.S.fedWithholding : 0);
  const withholdingOther = addlMedicareWithheld + input.payments.fedOtherWithholding;
  const totalWithholding = withholdingW2 + withholding1099 + withholdingOther;
  const pay = input.payments;
  const estimatedPayments = sum(pay.fedEstimates) + pay.fedPriorOverpayment;
  const excessSs = (who: 'T' | 'S') => {
    const pw2 = w2s.filter((w) => w.owner === who);
    if (pw2.length < 2) return 0;
    return pos(persons[who].ssTaxWithheld - P.EMPLOYEE_SS_RATE * P.SE_TAX.ssWageBase);
  };
  const excessSsWithheld = excessSs('T') + (joint ? excessSs('S') : 0);
  const extensionPayment = pay.fedExtension;
  const otherRefundable = input.credits.otherRefundable;
  const refundableCredits = eitc + actc + aotcRefundable + otherRefundable;
  const totalPayments = totalWithholding + estimatedPayments + refundableCredits + excessSsWithheld + extensionPayment;

  // Form 2210 (regular method, simplified)
  const tax2210 = pos(totalTax - eitc - actc - aotcRefundable - otherRefundable);
  const priorTax = input.client.priorYear.federalTotalTax;
  const priorPct = input.client.priorYear.federalAgi > (status === 'mfs' ? 75000 : 150000) ? 1.1 : 1.0;
  const safeHarborRequired = priorTax > 0 ? Math.min(0.9 * tax2210, priorPct * priorTax) : 0.9 * tax2210;
  const paidTowardSafeHarbor = totalWithholding + excessSsWithheld + estimatedPayments;
  let estimatedTaxPenalty = 0;
  if (tax2210 - totalWithholding >= 1000 && paidTowardSafeHarbor < safeHarborRequired) {
    let cumReq = 0;
    let cumPaid = 0;
    for (let q = 0; q < 4; q++) {
      cumReq += safeHarborRequired / 4;
      cumPaid += totalWithholding / 4 + pay.fedEstimates[q] + (q === 0 ? pay.fedPriorOverpayment + excessSsWithheld : 0);
      const short = pos(cumReq - cumPaid);
      const end = q < 3 ? P.ESTIMATE_DUE_DATES[q + 1] : P.RETURN_DUE_DATE;
      estimatedTaxPenalty += short * P.UNDERPAYMENT_RATE * daysBetween(P.ESTIMATE_DUE_DATES[q], end) / 365;
    }
  }

  const balance = totalPayments - totalTax;
  const refund = pos(balance);
  const owed = pos(-balance) + estimatedTaxPenalty;

  const marginalOrdinaryRate = marginalBracketRate(taxableIncome, P.BRACKETS[status]);
  const effectiveRate = totalIncome > 0 ? totalTax / totalIncome : 0;

  if (input.credits.childCareExpenses > 0 && childCareQualifyingPersons === 0) {
    diagnostics.push('Child care expenses entered but no dependent is under 13 (or disabled); Form 2441 credit not allowed.');
  }
  if (iraGross > 0 && r1099s.some((r) => r.taxableAmount === 0 && r.grossDistribution > 0 && !/[GH]/i.test(r.distributionCode) && r.rolledOver === 0)) {
    diagnostics.push('A 1099-R shows a gross distribution with $0 taxable amount; confirm box 2a or basis (Form 8606).');
  }

  const r: FederalResult = {
    status, persons, wages, taxableDependentCare, taxableInterest, taxExemptInterest, ordinaryDividends,
    qualifiedDividends, iraGross, iraTaxable, pensionGross, pensionTaxable, ssBenefits, ssTaxable,
    shortTermNet, longTermNet, capitalGainLine7, capitalLossCarryover, netCapitalGain, scheduleCNet,
    scheduleENet, rentalNet, k1Nonpassive, passiveNet, passiveSuspended, ordinaryGain4797, sch1Additional,
    totalIncome, educator, hsaDeduction, seTaxDeduction, sepSimple, seHealth, earlyWithdrawalPenalty,
    iraDeduction, studentLoan, totalAdjustments, agi, standardDeduction, itemizedBeforeLimit,
    itemizedLimitation, itemizedAllowed, itemizes, deduction, nonItemizerCharity,
    schA: {
      medical, saltPaid, saltCap, saltAllowed, stateIncomeTax: incomeOrSales, realEstate: it.realEstateTax,
      personalProperty: it.personalPropertyTax, interest, mortgageInterestAllowed: mortgageInterestAllowed + pmi,
      investmentInterest, charity, charityFloor, casualty: it.casualtyLoss, other: otherItemized,
    },
    qbiDeduction: qbiDed, qbiTotal: qbiRes.qbiTotal,
    sch1A: { tips, overtime, carLoan, senior, total: sch1ATotal, magi: magi1A },
    taxableIncome, regularTax, usedCapitalGainWorksheet, amt, amti, amtExemption,
    foreignTaxCredit, childCareCredit, childCareRate, educationNonrefundable, aotcRefundable, saversCredit,
    otherNonrefundable, ctcOdc, ctcPotential, actc, qualifyingChildren, otherDependents,
    childCareQualifyingPersons, eitc, seTax, earlyDistributionTax, addlMedicare, niit, netInvestmentIncome,
    otherTaxes, taxBeforeCredits, totalNonrefundable, totalTax, withholdingW2, withholding1099,
    withholdingOther, totalWithholding, estimatedPayments, excessSsWithheld, extensionPayment,
    otherRefundable, totalPayments, refund, owed, estimatedTaxPenalty, safeHarborRequired,
    paidTowardSafeHarbor, marginalOrdinaryRate, effectiveRate, diagnostics, forms: [],
  };
  void qcdTotal;
  r.forms = renderFederalForms(r, input);
  return r;
}

function emptyPerson(): PersonTotals {
  return {
    wages: 0, medicareWages: 0, ssWages: 0, ssTaxWithheld: 0, seNetProfit: 0, seNetEarnings: 0, seTax: 0,
    earnedIncome: 0, electiveDeferrals: 0, rothDeferrals: 0, coveredByPlan: false, age: null, is65: false,
    hsaEmployer: 0, hsaLimit: 0, iraContribution: 0, iraDeduction: 0, retirementDistributions: 0,
  };
}

export function taxableDistribution(r: { taxableAmount: number; rolledOver: number; qcd: number; distributionCode: string; grossDistribution: number }): number {
  if (/[GH]/i.test(r.distributionCode)) return 0;
  return pos(r.taxableAmount - r.rolledOver - r.qcd);
}

/** Social Security Benefits Worksheet (Form 1040 instructions, line 6). */
export function taxableSocialSecurity(status: FilingStatus, benefits: number, otherIncomeInclExempt: number): number {
  if (benefits <= 0) return 0;
  const provisional = otherIncomeInclExempt + benefits / 2;
  if (status === 'mfs') return Math.min(0.85 * benefits, 0.85 * pos(provisional));
  const b1 = P.SOCIAL_SECURITY_BASE.base1[status];
  const b2 = P.SOCIAL_SECURITY_BASE.base2[status];
  if (provisional <= b1) return 0;
  const tier1 = Math.min(provisional - b1, b2 - b1);
  const tier2 = pos(provisional - b2);
  return Math.min(0.85 * benefits, 0.85 * tier2 + Math.min(0.5 * tier1, 0.5 * benefits));
}

/** Qualified Dividends and Capital Gain Tax Worksheet. */
export function preferentialTax(ti: number, pref: number, status: FilingStatus, ordinaryTax: (x: number) => number): number {
  const [b0, b15] = P.CAPGAIN_BREAKS[status];
  const ordinary = pos(ti - pref);
  const zero = clamp(Math.min(ti, b0) - ordinary, 0, pref);
  const fifteen = clamp(Math.min(ti, b15) - ordinary - zero, 0, pref - zero);
  const twenty = pref - zero - fifteen;
  const tax = ordinaryTax(ordinary) + 0.15 * fifteen + 0.2 * twenty;
  return Math.min(tax, ordinaryTax(ti));
}

function carryover(st: number, lt: number, limit: number) {
  const net = st + lt;
  if (net >= 0) return { shortTerm: 0, longTerm: 0 };
  // Capital Loss Carryover Worksheet: deduction absorbs short-term loss first.
  let allowance = Math.min(limit, -net);
  let shortTerm = 0;
  let longTerm = 0;
  if (st < 0) {
    const stAvail = -st - pos(lt);
    const usedSt = Math.min(pos(stAvail), allowance);
    shortTerm = pos(stAvail - usedSt);
    allowance -= usedSt;
  }
  if (lt < 0) {
    const ltAvail = -lt - pos(st);
    longTerm = pos(ltAvail - allowance);
  }
  return { shortTerm, longTerm };
}

interface QbiItem { qbi: number; w2: number; ubia: number; sstb: boolean; active: boolean }

/** Form 8995 / 8995-A (simplified: no aggregation, no loss carryforwards). */
export function qbiDeduction(
  input: TaxReturnInput, status: FilingStatus, tiBeforeQbi: number, netCapGain: number,
  schC: QbiItem[], k1: QbiItem[], reitDividends: number,
): { deduction: number; qbiTotal: number } {
  void input;
  const items = [...schC, ...k1].filter((i) => i.qbi !== 0);
  const qbiTotal = sum(items.map((i) => i.qbi));
  const threshold = P.QBI.threshold[status];
  const range = P.QBI.phaseInRange[status];
  const pct = clamp((tiBeforeQbi - threshold) / range, 0, 1);
  let component = 0;
  if (qbiTotal > 0) {
    // Allocate net losses proportionally against positive businesses.
    const positives = items.filter((i) => i.qbi > 0);
    const posTotal = sum(positives.map((i) => i.qbi));
    const scale = posTotal > 0 ? qbiTotal / posTotal : 0;
    for (const i of positives) {
      const applic = i.sstb ? 1 - pct : 1;
      const q = i.qbi * scale * applic;
      const w2 = i.w2 * applic;
      const ubia = i.ubia * applic;
      const base = P.QBI.rate * q;
      const limit = Math.max(0.5 * w2, 0.25 * w2 + 0.025 * ubia);
      if (pct === 0) component += base;
      else if (pct >= 1) component += Math.min(base, limit);
      else component += base > limit ? base - (base - limit) * pct : base;
    }
  }
  component += P.QBI.rate * pos(reitDividends);
  const incomeLimit = P.QBI.rate * pos(tiBeforeQbi - netCapGain);
  let deduction = Math.min(component, incomeLimit);
  const activeQbi = sum(items.filter((i) => i.active).map((i) => i.qbi));
  if (activeQbi >= P.QBI.minimumQbi) deduction = Math.max(deduction, Math.min(P.QBI.minimumDeduction, incomeLimit));
  return { deduction: pos(deduction), qbiTotal };
}

// ------------------------------------------------------------------ Rendering

const L = (line: string, label: string, amount?: number, total = false): FormLine => ({
  line, label, amount: amount === undefined ? undefined : round(amount), total,
});

const STATUS_LABEL: Record<FilingStatus, string> = {
  single: 'Single', mfj: 'Married filing jointly', mfs: 'Married filing separately',
  hoh: 'Head of household', qss: 'Qualifying surviving spouse',
};

function renderFederalForms(r: FederalResult, input: TaxReturnInput): RenderedForm[] {
  const c = input.client;
  const name = [c.taxpayer.firstName, c.taxpayer.lastName].filter(Boolean).join(' ') +
    (r.status === 'mfj' && c.spouse.firstName ? ` & ${c.spouse.firstName} ${c.spouse.lastName}` : '');
  const forms: RenderedForm[] = [];
  const line25 = r.totalWithholding;
  const sch2Line3 = r.amt;
  const sch3Line8 = r.foreignTaxCredit + r.childCareCredit + r.educationNonrefundable + r.saversCredit + r.otherNonrefundable;
  const sch3Line15 = r.excessSsWithheld + r.extensionPayment + r.otherRefundable;

  forms.push({
    id: 'f1040', name: 'Form 1040', title: 'U.S. Individual Income Tax Return — 2026 (projected)',
    sections: [
      {
        title: 'Filing information',
        lines: [
          { line: '', label: 'Name', text: name || '—' },
          { line: '', label: 'Filing status', text: STATUS_LABEL[r.status] },
          { line: '', label: 'Dependents', text: input.dependents.map((d) => `${d.firstName} ${d.lastName}`.trim()).join(', ') || 'None' },
        ],
      },
      {
        title: 'Income',
        lines: [
          L('1a', 'Total amount from Form(s) W-2, box 1', r.wages),
          L('1e', 'Taxable dependent care benefits (Form 2441)', r.taxableDependentCare),
          L('1z', 'Add lines 1a through 1h', r.wages + r.taxableDependentCare, true),
          L('2a', 'Tax-exempt interest', r.taxExemptInterest),
          L('2b', 'Taxable interest', r.taxableInterest),
          L('3a', 'Qualified dividends', r.qualifiedDividends),
          L('3b', 'Ordinary dividends', r.ordinaryDividends),
          L('4a', 'IRA distributions', r.iraGross),
          L('4b', 'Taxable amount', r.iraTaxable),
          L('5a', 'Pensions and annuities', r.pensionGross),
          L('5b', 'Taxable amount', r.pensionTaxable),
          L('6a', 'Social security benefits', r.ssBenefits),
          L('6b', 'Taxable amount', r.ssTaxable),
          L('7', 'Capital gain or (loss) — Schedule D', r.capitalGainLine7),
          L('8', 'Additional income from Schedule 1, line 10', r.sch1Additional),
          L('9', 'Total income', r.totalIncome, true),
          L('10', 'Adjustments to income from Schedule 1, line 26', r.totalAdjustments),
          L('11', 'Adjusted gross income', r.agi, true),
        ],
      },
      {
        title: 'Tax and credits',
        lines: [
          L('12a', r.itemizes ? 'Itemized deductions (Schedule A)' : 'Standard deduction', r.deduction),
          L('12b', 'Charitable contributions for non-itemizers (OBBBA, 2026+)', r.nonItemizerCharity),
          L('13a', 'Qualified business income deduction (Form 8995/8995-A)', r.qbiDeduction),
          L('13b', 'Additional deductions from Schedule 1-A', r.sch1A.total),
          L('14', 'Add lines 12a through 13b', r.deduction + r.nonItemizerCharity + r.qbiDeduction + r.sch1A.total),
          L('15', 'Taxable income', r.taxableIncome, true),
          L('16', `Tax${r.usedCapitalGainWorksheet ? ' (Qualified Dividends and Capital Gain Tax Worksheet)' : ''}`, r.regularTax),
          L('17', 'Amount from Schedule 2, line 3', sch2Line3),
          L('18', 'Add lines 16 and 17', r.taxBeforeCredits),
          L('19', 'Child tax credit / credit for other dependents (Schedule 8812)', r.ctcOdc),
          L('20', 'Amount from Schedule 3, line 8', sch3Line8),
          L('21', 'Add lines 19 and 20', r.totalNonrefundable),
          L('22', 'Subtract line 21 from line 18', pos(r.taxBeforeCredits - r.totalNonrefundable)),
          L('23', 'Other taxes, including self-employment tax, from Schedule 2, line 21', r.otherTaxes),
          L('24', 'Total tax', r.totalTax, true),
        ],
      },
      {
        title: 'Payments',
        lines: [
          L('25a', 'Federal income tax withheld — Form(s) W-2', r.withholdingW2),
          L('25b', 'Federal income tax withheld — Form(s) 1099 / SSA-1099', r.withholding1099),
          L('25c', 'Other forms (incl. Additional Medicare Tax withheld)', r.withholdingOther),
          L('25d', 'Add lines 25a through 25c', line25),
          L('26', '2026 estimated tax payments and amount applied from 2025 return', r.estimatedPayments),
          L('27', 'Earned income credit (EIC)', r.eitc),
          L('28', 'Additional child tax credit (Schedule 8812)', r.actc),
          L('29', 'American opportunity credit (Form 8863, line 8)', r.aotcRefundable),
          L('31', 'Amount from Schedule 3, line 15', sch3Line15),
          L('32', 'Total other payments and refundable credits', r.eitc + r.actc + r.aotcRefundable + sch3Line15),
          L('33', 'Total payments', r.totalPayments, true),
        ],
      },
      {
        title: 'Refund / Amount you owe',
        lines: [
          L('34', 'Amount overpaid', r.refund),
          L('35a', 'Amount to be refunded', r.refund, true),
          L('37', 'Amount you owe', r.owed, true),
          L('38', 'Estimated tax penalty (Form 2210, projected)', r.estimatedTaxPenalty),
        ],
      },
    ],
  });

  const it = input.itemized;
  void it;
  const oi = input.otherIncome;
  const adj = input.adjustments;
  forms.push({
    id: 'sch1', name: 'Schedule 1', title: 'Additional Income and Adjustments to Income',
    sections: [
      {
        title: 'Part I — Additional Income',
        lines: [
          L('1', 'Taxable refunds, credits, or offsets of state and local income taxes', oi.taxableRefunds),
          L('2a', 'Alimony received', oi.alimonyReceived),
          L('3', 'Business income or (loss) — Schedule C', r.scheduleCNet),
          L('4', 'Other gains or (losses) — Form 4797', r.ordinaryGain4797),
          L('5', 'Rental real estate, royalties, partnerships, S corporations, trusts — Schedule E', r.scheduleENet),
          L('7', 'Unemployment compensation', oi.unemployment),
          L('8b', 'Gambling winnings', oi.gamblingWinnings),
          L('8c', 'Cancellation of debt', oi.cancellationOfDebt),
          L('8h', 'Jury duty pay', oi.juryDuty),
          L('8z', `Other income${oi.otherIncomeDescription ? ` (${oi.otherIncomeDescription})` : ''} incl. K-1 other income`,
            oi.otherIncome + sum(input.k1s.filter((k) => includeOwner(input, k.owner)).map((k) => k.otherIncome))),
          L('10', 'Total additional income', r.sch1Additional, true),
        ],
      },
      {
        title: 'Part II — Adjustments to Income',
        lines: [
          L('11', 'Educator expenses', r.educator),
          L('13', 'Health savings account deduction (Form 8889)', r.hsaDeduction),
          L('14', 'Moving expenses for members of the Armed Forces', adj.movingMilitary),
          L('15', 'Deductible part of self-employment tax', r.seTaxDeduction),
          L('16', 'Self-employed SEP, SIMPLE, and qualified plans', r.sepSimple),
          L('17', 'Self-employed health insurance deduction', r.seHealth),
          L('18', 'Penalty on early withdrawal of savings', r.earlyWithdrawalPenalty),
          L('19a', 'Alimony paid', adj.alimonyPaid),
          L('20', 'IRA deduction', r.iraDeduction),
          L('21', 'Student loan interest deduction', r.studentLoan),
          L('24z', 'Other adjustments', adj.otherAdjustments),
          L('26', 'Total adjustments to income', r.totalAdjustments, true),
        ],
      },
    ],
  });

  forms.push({
    id: 'sch1a', name: 'Schedule 1-A', title: 'Additional Deductions (OBBBA: tips, overtime, car loan interest, seniors)',
    sections: [{
      lines: [
        L('', 'Modified AGI', r.sch1A.magi),
        L('Part II', 'No tax on tips deduction (max $25,000)', r.sch1A.tips),
        L('Part III', `No tax on overtime deduction (max ${r.status === 'mfj' ? '$25,000' : '$12,500'})`, r.sch1A.overtime),
        L('Part IV', 'No tax on car loan interest deduction (max $10,000)', r.sch1A.carLoan),
        L('Part V', 'Enhanced deduction for seniors ($6,000 per person 65+)', r.sch1A.senior),
        L('', 'Total — to Form 1040, line 13b', r.sch1A.total, true),
      ],
    }],
    notes: ['Phase-outs: tips/overtime reduce $100 per $1,000 of MAGI over $150,000 ($300,000 MFJ); car loan interest $200 per $1,000 over $100,000 ($200,000 MFJ); senior deduction 6% of MAGI over $75,000 ($150,000 MFJ).'],
  });

  forms.push({
    id: 'sch2', name: 'Schedule 2', title: 'Additional Taxes',
    sections: [
      { title: 'Part I — Tax', lines: [L('2', 'Alternative minimum tax (Form 6251)', r.amt), L('3', 'Total — to Form 1040, line 17', r.amt, true)] },
      {
        title: 'Part II — Other Taxes',
        lines: [
          L('4', 'Self-employment tax (Schedule SE)', r.seTax),
          L('8', 'Additional tax on IRAs or other retirement plans (Form 5329)', r.earlyDistributionTax),
          L('11', 'Additional Medicare Tax (Form 8959)', r.addlMedicare),
          L('12', 'Net investment income tax (Form 8960)', r.niit),
          L('21', 'Total other taxes — to Form 1040, line 23', r.otherTaxes, true),
        ],
      },
    ],
  });

  forms.push({
    id: 'sch3', name: 'Schedule 3', title: 'Additional Credits and Payments',
    sections: [
      {
        title: 'Part I — Nonrefundable Credits',
        lines: [
          L('1', 'Foreign tax credit', r.foreignTaxCredit),
          L('2', 'Credit for child and dependent care expenses (Form 2441)', r.childCareCredit),
          L('3', 'Education credits (Form 8863, line 19)', r.educationNonrefundable),
          L('4', 'Retirement savings contributions credit (Form 8880)', r.saversCredit),
          L('6z', 'Other nonrefundable credits', r.otherNonrefundable),
          L('8', 'Total nonrefundable credits — to Form 1040, line 20', sch3Line8, true),
        ],
      },
      {
        title: 'Part II — Other Payments and Refundable Credits',
        lines: [
          L('10', 'Amount paid with request for extension to file', r.extensionPayment),
          L('11', 'Excess social security and tier 1 RRTA tax withheld', r.excessSsWithheld),
          L('13z', 'Other refundable credits', r.otherRefundable),
          L('15', 'Total — to Form 1040, line 31', sch3Line15, true),
        ],
      },
    ],
  });

  if (r.itemizedBeforeLimit > 0 || input.itemized.forceItemize) {
    const a = r.schA;
    forms.push({
      id: 'schA', name: 'Schedule A', title: 'Itemized Deductions',
      sections: [{
        lines: [
          L('1', 'Medical and dental expenses', input.itemized.medical),
          L('4', 'Deductible medical (over 7.5% of AGI)', a.medical),
          L('5a', input.itemized.useSalesTax ? 'General sales taxes' : 'State and local income taxes', a.stateIncomeTax),
          L('5b', 'State and local real estate taxes', a.realEstate),
          L('5c', 'State and local personal property taxes', a.personalProperty),
          L('5d', 'Add lines 5a through 5c', a.saltPaid),
          L('5e', `SALT deduction (2026 cap $${round(a.saltCap).toLocaleString()} after MAGI phase-down)`, a.saltAllowed),
          L('8–10', 'Home mortgage interest, points, mortgage insurance, and investment interest', a.interest),
          L('11–13', 'Gifts to charity (less 0.5% of AGI floor)', a.charity),
          L('', 'Charitable floor removed (0.5% of AGI)', a.charityFloor),
          L('15', 'Casualty and theft losses', a.casualty),
          L('16', 'Other itemized deductions (incl. 90% gambling losses)', a.other),
          L('17', 'Total before OBBBA 2/37 limitation', r.itemizedBeforeLimit),
          L('', 'Less: limitation for 37% bracket (2/37)', -r.itemizedLimitation),
          L('', 'Total itemized deductions', r.itemizedAllowed, true),
          { line: '', label: 'Election', text: r.itemizes ? 'Itemizing' : `Standard deduction ($${round(r.standardDeduction).toLocaleString()}) is larger — not itemizing` },
        ],
      }],
    });
  }

  if (r.taxableInterest > 1500 || r.ordinaryDividends > 1500) {
    forms.push({
      id: 'schB', name: 'Schedule B', title: 'Interest and Ordinary Dividends',
      sections: [
        { title: 'Part I — Interest', lines: [...input.int1099s.filter((i) => includeOwner(input, i.owner)).map((i) => L('1', i.payer || 'Payer', i.interest)), L('4', 'Total interest', r.taxableInterest, true)] },
        { title: 'Part II — Ordinary Dividends', lines: [...input.div1099s.filter((d) => includeOwner(input, d.owner)).map((d) => L('5', d.payer || 'Payer', d.ordinary)), L('6', 'Total ordinary dividends', r.ordinaryDividends, true)] },
      ],
    });
  }

  if (r.scheduleCNet !== 0 || input.scheduleCs.length) {
    forms.push({
      id: 'schC', name: 'Schedule C', title: 'Profit or Loss From Business',
      sections: input.scheduleCs.filter((x) => includeOwner(input, x.owner)).map((x) => {
        const exp = x.advertising + x.carTruck + x.depreciation + x.insurance + x.legalProfessional + x.office +
          x.rentLease + x.supplies + x.travel + x.meals * 0.5 + x.utilities + x.wagesPaid + x.otherExpenses;
        const gross = x.grossReceipts - x.returns - x.cogs + x.otherIncome;
        return {
          title: `${x.businessName || 'Business'} (${x.owner})`,
          lines: [L('1', 'Gross receipts', x.grossReceipts), L('7', 'Gross income', gross), L('28', 'Total expenses', exp),
            L('30', 'Business use of home', x.homeOffice), L('31', 'Net profit or (loss)', gross - exp - x.homeOffice, true)],
        };
      }),
    });
  }

  if (r.shortTermNet !== 0 || r.longTermNet !== 0 || input.capitalTransactions.length) {
    forms.push({
      id: 'schD', name: 'Schedule D', title: 'Capital Gains and Losses (Form 8949 summary)',
      sections: [{
        lines: [
          L('7', 'Net short-term capital gain or (loss)', r.shortTermNet),
          L('15', 'Net long-term capital gain or (loss) (incl. cap gain distributions, §1231)', r.longTermNet),
          L('16', 'Combine lines 7 and 15', r.shortTermNet + r.longTermNet),
          L('21', 'Amount to Form 1040, line 7', r.capitalGainLine7, true),
          L('', 'Short-term loss carryover to 2027', r.capitalLossCarryover.shortTerm),
          L('', 'Long-term loss carryover to 2027', r.capitalLossCarryover.longTerm),
        ],
      }],
      notes: ['28% collectibles gain and unrecaptured §1250 gain are taxed at the preferential rate in this projection.'],
    });
  }

  if (r.scheduleENet !== 0 || input.rentals.length || input.k1s.length) {
    forms.push({
      id: 'schE', name: 'Schedule E', title: 'Supplemental Income and Loss',
      sections: [
        {
          title: 'Part I — Rental real estate',
          lines: input.rentals.filter((x) => includeOwner(input, x.owner)).map((x) =>
            L('21', x.address || 'Property', x.rents - (x.mortgageInterest + x.taxes + x.insurance + x.repairs + x.depreciation + x.otherExpenses))),
        },
        {
          title: 'Part II — Partnerships, S corporations, and trusts (K-1)',
          lines: input.k1s.filter((x) => includeOwner(input, x.owner)).map((k) =>
            L(k.passive ? 'P' : 'NP', `${k.entityName || 'Entity'} (${k.type}${k.passive ? ', passive' : ', nonpassive'})`,
              k.ordinaryIncome + k.rentalRealEstate + k.otherRental - k.section179 + k.guaranteedPayments + k.royalties)),
        },
        {
          lines: [
            L('', 'Passive activity net income or (loss)', r.passiveNet),
            L('', 'Suspended passive loss (Form 8582)', -r.passiveSuspended),
            L('41', 'Total — to Schedule 1, line 5', r.scheduleENet, true),
          ],
        },
      ],
    });
  }

  if (r.seTax > 0) {
    forms.push({
      id: 'schSE', name: 'Schedule SE', title: 'Self-Employment Tax',
      sections: (['T', 'S'] as const).filter((w) => r.persons[w].seTax > 0).map((w) => ({
        title: w === 'T' ? 'Taxpayer' : 'Spouse',
        lines: [
          L('3', 'Net SE profit (Schedule C, K-1 box 14A)', r.persons[w].seNetProfit),
          L('4a', 'Net earnings × 92.35%', r.persons[w].seNetEarnings),
          L('12', 'Self-employment tax', r.persons[w].seTax, true),
          L('13', 'Deduction for one-half of SE tax', r.persons[w].seTax / 2),
        ],
      })),
    });
  }

  if (r.ctcPotential > 0 || r.actc > 0) {
    forms.push({
      id: 'f8812', name: 'Schedule 8812', title: 'Credits for Qualifying Children and Other Dependents',
      sections: [{
        lines: [
          L('4', 'Qualifying children under 17 with SSN', r.qualifyingChildren),
          L('6', 'Other dependents', r.otherDependents),
          L('12', 'Credit after AGI phase-out', r.ctcPotential),
          L('14', 'Nonrefundable CTC/ODC — to Form 1040, line 19', r.ctcOdc, true),
          L('27', 'Additional child tax credit — to Form 1040, line 28', r.actc, true),
        ],
      }],
      notes: ['OBBBA: $2,200 per qualifying child (refundable portion up to $1,700) and requires an SSN for the taxpayer (or one spouse if MFJ).'],
    });
  }

  if (r.childCareCredit > 0 || input.credits.childCareExpenses > 0) {
    forms.push({
      id: 'f2441', name: 'Form 2441', title: 'Child and Dependent Care Expenses',
      sections: [{
        lines: [
          L('2', 'Qualifying persons', r.childCareQualifyingPersons),
          L('3', 'Qualified expenses incurred', input.credits.childCareExpenses),
          L('8', 'Applicable percentage (OBBBA 2026: 50% → 35% → 20%)', round(r.childCareRate * 100)),
          L('11', 'Credit — to Schedule 3, line 2', r.childCareCredit, true),
          L('', 'Dependent care benefits taxable (line 1e)', r.taxableDependentCare),
        ],
      }],
    });
  }

  if (input.credits.students.length) {
    forms.push({
      id: 'f8863', name: 'Form 8863', title: 'Education Credits',
      sections: [{
        lines: [
          ...input.credits.students.map((st) => L('', `${st.name || 'Student'} — ${st.aotcEligible ? 'AOTC' : 'Lifetime Learning'} expenses`, st.qualifiedExpenses)),
          L('8', 'Refundable American opportunity credit', r.aotcRefundable, true),
          L('19', 'Nonrefundable education credits', r.educationNonrefundable, true),
        ],
      }],
    });
  }

  if (r.qbiDeduction > 0) {
    forms.push({
      id: 'f8995', name: 'Form 8995/8995-A', title: 'Qualified Business Income Deduction',
      sections: [{ lines: [L('', 'Total qualified business income', r.qbiTotal), L('15', 'QBI deduction — to Form 1040, line 13a', r.qbiDeduction, true)] }],
      notes: ['OBBBA (2026+): phase-in range widened to $75,000 ($150,000 MFJ) and $400 minimum deduction for $1,000+ of active QBI.'],
    });
  }

  if (r.amt > 0 || input.amt.isoBargainElement > 0) {
    forms.push({
      id: 'f6251', name: 'Form 6251', title: 'Alternative Minimum Tax — Individuals',
      sections: [{ lines: [L('4', 'Alternative minimum taxable income', r.amti), L('5', 'Exemption (after 50% phase-out)', r.amtExemption), L('11', 'AMT — to Schedule 2, line 2', r.amt, true)] }],
    });
  }

  if (r.addlMedicare > 0) {
    forms.push({ id: 'f8959', name: 'Form 8959', title: 'Additional Medicare Tax', sections: [{ lines: [L('18', 'Additional Medicare Tax', r.addlMedicare, true), L('24', 'Additional Medicare Tax withheld', r.withholdingOther - input.payments.fedOtherWithholding)] }] });
  }
  if (r.niit > 0) {
    forms.push({ id: 'f8960', name: 'Form 8960', title: 'Net Investment Income Tax', sections: [{ lines: [L('12', 'Net investment income', r.netInvestmentIncome), L('13', 'Modified AGI', r.agi), L('17', 'NIIT (3.8%)', r.niit, true)] }] });
  }
  if (r.eitc > 0) {
    forms.push({ id: 'schEIC', name: 'Schedule EIC', title: 'Earned Income Credit', sections: [{ lines: [L('27', 'Earned income credit', r.eitc, true)] }] });
  }
  if (r.saversCredit > 0) {
    forms.push({ id: 'f8880', name: 'Form 8880', title: 'Credit for Qualified Retirement Savings Contributions', sections: [{ lines: [L('12', "Saver's credit — to Schedule 3, line 4", r.saversCredit, true)] }] });
  }
  if (r.estimatedTaxPenalty > 0) {
    forms.push({
      id: 'f2210', name: 'Form 2210', title: 'Underpayment of Estimated Tax (projected)',
      sections: [{ lines: [L('9', 'Required annual payment (safe harbor)', r.safeHarborRequired), L('', 'Withholding + estimates paid', r.paidTowardSafeHarbor), L('19', 'Projected penalty', r.estimatedTaxPenalty, true)] }],
    });
  }
  return forms;
}
