// 2026 federal tax parameters.
//
// Sources: Rev. Proc. 2025-32 (2026 inflation adjustments, incorporating the
// One Big Beautiful Bill Act, P.L. 119-21), IRS Notice 2025-67 (retirement plan
// limits), Rev. Proc. 2025-19 (HSA limits) and the OBBBA statute itself.
// Items marked in ESTIMATES are projected by this app rather than taken from a
// published IRS figure, and are surfaced to the user in the Diagnostics view.

import type { FilingStatus } from './types';

export const TAX_YEAR = 2026;

type ByStatus<T> = Record<FilingStatus, T>;

/** [upper bound of bracket, rate]; the last bracket uses Infinity. */
export type Brackets = Array<[number, number]>;

export const BRACKETS: ByStatus<Brackets> = {
  single: [
    [12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24],
    [256225, 0.32], [640600, 0.35], [Infinity, 0.37],
  ],
  mfj: [
    [24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24],
    [512450, 0.32], [768700, 0.35], [Infinity, 0.37],
  ],
  qss: [
    [24800, 0.1], [100800, 0.12], [211400, 0.22], [403550, 0.24],
    [512450, 0.32], [768700, 0.35], [Infinity, 0.37],
  ],
  mfs: [
    [12400, 0.1], [50400, 0.12], [105700, 0.22], [201775, 0.24],
    [256225, 0.32], [384350, 0.35], [Infinity, 0.37],
  ],
  hoh: [
    [17700, 0.1], [67450, 0.12], [105700, 0.22], [201750, 0.24],
    [256200, 0.32], [640600, 0.35], [Infinity, 0.37],
  ],
};

export const STANDARD_DEDUCTION: ByStatus<number> = {
  single: 16100, mfs: 16100, mfj: 32200, qss: 32200, hoh: 24150,
};
/** Additional standard deduction per box checked (65+ or blind). */
export const ADDITIONAL_STD_MARRIED = 1650;
export const ADDITIONAL_STD_UNMARRIED = 2050;
export const DEPENDENT_STD_MIN = 1350;
export const DEPENDENT_STD_EARNED_PLUS = 450;

/** Qualified dividend / LTCG breakpoints: top of 0% and top of 15%. */
export const CAPGAIN_BREAKS: ByStatus<[number, number]> = {
  single: [49450, 545500],
  mfs: [49450, 306850],
  mfj: [98900, 613700],
  qss: [98900, 613700],
  hoh: [66200, 579600],
};

export const AMT = {
  exemption: { single: 90100, hoh: 90100, mfj: 140200, qss: 140200, mfs: 70100 } as ByStatus<number>,
  phaseoutStart: { single: 500000, hoh: 500000, mfj: 1000000, qss: 1000000, mfs: 500000 } as ByStatus<number>,
  /** OBBBA raised the exemption phase-out rate to 50% beginning 2026. */
  phaseoutRate: 0.5,
  /** AMTI breakpoint where the 28% rate begins (half for MFS). */
  rate28Threshold: 244500,
};

export const CTC = {
  perChild: 2200,
  refundableMax: 1700,
  otherDependent: 500,
  phaseoutStart: { single: 200000, hoh: 200000, mfs: 200000, mfj: 400000, qss: 400000 } as ByStatus<number>,
  earnedIncomeFloor: 2500,
  refundableRate: 0.15,
};

// EITC: [earned income amount, max credit, phase-in rate, phase-out rate]
export const EITC = {
  table: [
    { earned: 8680, max: 664, phaseoutStart: 10860, phaseoutStartJoint: 18140, phaseoutRate: 0.0765 },
    { earned: 13020, max: 4427, phaseoutStart: 23890, phaseoutStartJoint: 31160, phaseoutRate: 0.1598 },
    { earned: 18290, max: 7316, phaseoutStart: 23890, phaseoutStartJoint: 31160, phaseoutRate: 0.2106 },
    { earned: 18290, max: 8231, phaseoutStart: 23890, phaseoutStartJoint: 31160, phaseoutRate: 0.2106 },
  ],
  investmentIncomeLimit: 12200,
};

export const SALT = {
  /** OBBBA: $40,000 for 2025, increased 1% per year through 2029. */
  cap: 40400,
  capMfs: 20200,
  phasedownStart: 505000,
  phasedownStartMfs: 252500,
  phasedownRate: 0.3,
  floor: 10000,
  floorMfs: 5000,
};

export const SCHEDULE_1A = {
  tipsMax: 25000,
  overtimeMax: 12500,
  overtimeMaxJoint: 25000,
  tipsOvertimePhaseout: 150000,
  tipsOvertimePhaseoutJoint: 300000,
  /** $100 reduction per $1,000 of MAGI over the threshold. */
  tipsOvertimeReductionPer1000: 100,
  carLoanMax: 10000,
  carLoanPhaseout: 100000,
  carLoanPhaseoutJoint: 200000,
  carLoanReductionPer1000: 200,
  seniorAmount: 6000,
  seniorPhaseout: 75000,
  seniorPhaseoutJoint: 150000,
  seniorPhaseoutRate: 0.06,
};

/** OBBBA charitable deduction for non-itemizers (2026+). */
export const NONITEMIZER_CHARITY = { single: 1000, mfs: 1000, hoh: 1000, mfj: 2000, qss: 2000 } as ByStatus<number>;
/** OBBBA 0.5% of AGI floor on itemized charitable contributions (2026+). */
export const CHARITY_FLOOR_RATE = 0.005;
/** OBBBA "2/37" limitation on itemized deductions for 37% bracket taxpayers. */
export const ITEMIZED_LIMIT_FRACTION = 2 / 37;
/** OBBBA limits gambling losses to 90% of losses (2026+). */
export const GAMBLING_LOSS_RATE = 0.9;
export const MEDICAL_FLOOR = 0.075;
export const MORTGAGE_DEBT_LIMIT = 750000;

export const QBI = {
  rate: 0.2,
  threshold: { single: 201750, hoh: 201750, qss: 403500, mfj: 403500, mfs: 201775 } as ByStatus<number>,
  /** OBBBA widened the phase-in range to $75,000 / $150,000 beginning 2026. */
  phaseInRange: { single: 75000, hoh: 75000, mfs: 75000, mfj: 150000, qss: 150000 } as ByStatus<number>,
  minimumDeduction: 400,
  minimumQbi: 1000,
};

export const SE_TAX = {
  netEarningsFactor: 0.9235,
  ssRate: 0.124,
  medicareRate: 0.029,
  ssWageBase: 184500,
  minimum: 400,
};
export const EMPLOYEE_SS_RATE = 0.062;

export const ADDL_MEDICARE = {
  rate: 0.009,
  threshold: { single: 200000, hoh: 200000, qss: 200000, mfj: 250000, mfs: 125000 } as ByStatus<number>,
};

export const NIIT = {
  rate: 0.038,
  threshold: { single: 200000, hoh: 200000, qss: 250000, mfj: 250000, mfs: 125000 } as ByStatus<number>,
};

export const SOCIAL_SECURITY_BASE = {
  base1: { single: 25000, hoh: 25000, qss: 25000, mfj: 32000, mfs: 0 } as ByStatus<number>,
  base2: { single: 34000, hoh: 34000, qss: 34000, mfj: 44000, mfs: 0 } as ByStatus<number>,
};

export const CAPITAL_LOSS_LIMIT = { single: 3000, hoh: 3000, qss: 3000, mfj: 3000, mfs: 1500 } as ByStatus<number>;

export const RETIREMENT = {
  deferralLimit: 24500,
  catchUp50: 8000,
  /** SECURE 2.0 enhanced catch-up for ages 60-63. */
  catchUp60to63: 11250,
  iraLimit: 7500,
  iraCatchUp: 1100,
  /** Traditional IRA deduction phase-out for active plan participants. */
  iraPhaseoutCovered: { single: [81000, 91000], hoh: [81000, 91000], qss: [129000, 149000], mfj: [129000, 149000], mfs: [0, 10000] } as ByStatus<[number, number]>,
  /** Phase-out when only the spouse is covered (MFJ). */
  iraPhaseoutSpouseCovered: [242000, 252000] as [number, number],
  rothPhaseout: { single: [153000, 168000], hoh: [153000, 168000], qss: [242000, 252000], mfj: [242000, 252000], mfs: [0, 10000] } as ByStatus<[number, number]>,
  /** RMD start age for people born 1951-1959 (75 for 1960+). */
  rmdAge: 73,
};

export const HSA = { self: 4400, family: 8750, catchUp55: 1000 };

export const EDUCATOR_EXPENSE = 350;

export const STUDENT_LOAN = {
  max: 2500,
  phaseout: { single: [85000, 100000], hoh: [85000, 100000], qss: [85000, 100000], mfj: [175000, 205000], mfs: [0, 0] } as ByStatus<[number, number]>,
};

export const EDUCATION = {
  aotcMax: 2500,
  aotcRefundableRate: 0.4,
  llcRate: 0.2,
  llcExpenseMax: 10000,
  /** Not inflation indexed since 2021. */
  phaseout: { single: [80000, 90000], hoh: [80000, 90000], qss: [80000, 90000], mfj: [160000, 180000], mfs: [0, 0] } as ByStatus<[number, number]>,
};

export const CHILD_CARE = {
  expenseOne: 3000,
  expenseTwoPlus: 6000,
  /** OBBBA (2026+): 50% top rate, stepping down to 35% then to 20%. */
  maxRate: 0.5,
  midRate: 0.35,
  minRate: 0.2,
  firstPhaseStart: 15000,
  firstPhaseStep: 2000,
  secondPhaseStart: { single: 75000, hoh: 75000, mfs: 75000, mfj: 150000, qss: 150000 } as ByStatus<number>,
  secondPhaseStep: { single: 2000, hoh: 2000, mfs: 2000, mfj: 4000, qss: 4000 } as ByStatus<number>,
  /** OBBBA raised the dependent care assistance exclusion to $7,500 (2026+). */
  fsaExclusion: 7500,
  fsaExclusionMfs: 3750,
};

export const SAVERS_CREDIT = {
  // Upper AGI limits for the 50% / 20% / 10% tiers.
  tiers: {
    mfj: [48500, 52500, 80500], qss: [48500, 52500, 80500],
    hoh: [36375, 39375, 60375],
    single: [24250, 26250, 40250], mfs: [24250, 26250, 40250],
  } as ByStatus<[number, number, number]>,
  contributionMax: 2000,
};

export const FOREIGN_TAX_SIMPLIFIED_LIMIT = { single: 300, hoh: 300, mfs: 300, mfj: 600, qss: 600 } as ByStatus<number>;

export const EARLY_DISTRIBUTION_RATE = 0.1;

/** Form 2210 underpayment interest rate (annualized). */
export const UNDERPAYMENT_RATE = 0.07;
export const ESTIMATE_DUE_DATES = ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'];
export const RETURN_DUE_DATE = '2027-04-15';

/** Figures this app projected rather than copying from a published IRS source. */
export const ESTIMATES: string[] = [
  'Form 1040 line numbers follow the 2025 OBBBA-era form; the 2026 form has not been finalized.',
  "Saver's credit AGI tiers (IRS has published them, but they are projected here from 2025 + indexing).",
  'AMT 28% bracket threshold ($244,500) and Form 2210 underpayment rate (7%) are projected.',
  'Traditional/Roth IRA phase-out ranges per Notice 2025-67; verify against the final notice.',
  'Overtime and tip W-2 reporting codes (box 12 TT, box 14b) reflect IRS draft guidance for 2026.',
];
