// 2026 California parameters (Form 540).
//
// The FTB publishes indexed 2026 amounts late in the year. Single-filer rate
// schedule breakpoints below match published third-party 2026 schedules; every
// other amount is the official 2025 FTB figure indexed by the same factor
// (~3.4%). All are flagged as estimates in Diagnostics until the FTB releases
// its 2026 Form 540 instructions.

import type { FilingStatus } from './types';
import type { Brackets } from './params2026';

type ByStatus<T> = Record<FilingStatus, T>;

const RATES = [0.01, 0.02, 0.04, 0.06, 0.08, 0.093, 0.103, 0.113, 0.123];

function schedule(bounds: number[]): Brackets {
  return RATES.map((rate, i) => [i < bounds.length ? bounds[i] : Infinity, rate] as [number, number]);
}

const SINGLE = [11456, 27157, 42861, 59498, 75197, 384109, 460927, 768213];
const JOINT = SINGLE.map((b) => b * 2);
const HOH = [22927, 54317, 70020, 86657, 102358, 522401, 626883, 1044804];

export const CA_BRACKETS: ByStatus<Brackets> = {
  single: schedule(SINGLE),
  mfs: schedule(SINGLE),
  mfj: schedule(JOINT),
  qss: schedule(JOINT),
  hoh: schedule(HOH),
};

/** Behavioral Health Services Tax (formerly Mental Health Services Tax). */
export const CA_MHST = { rate: 0.01, threshold: 1000000 };

export const CA_STANDARD_DEDUCTION: ByStatus<number> = {
  single: 5900, mfs: 5900, mfj: 11800, qss: 11800, hoh: 11800,
};

export const CA_EXEMPTION = {
  personal: 158,
  senior: 158,
  blind: 158,
  dependent: 491,
  /** AGI above which exemption credits phase out. */
  phaseoutStart: { single: 260782, mfs: 260782, hoh: 391173, mfj: 521564, qss: 521564 } as ByStatus<number>,
  /** Credits reduce $6 per $2,500 ($1,250 MFS) or fraction of excess AGI. */
  reductionPerStep: 6,
  step: { single: 2500, hoh: 2500, mfj: 2500, qss: 2500, mfs: 1250 } as ByStatus<number>,
};

export const CA_ITEMIZED_LIMIT = {
  threshold: { single: 253183, mfs: 253183, hoh: 379785, mfj: 506366, qss: 506366 } as ByStatus<number>,
  rate: 0.06,
  maxReduction: 0.8,
};

export const CA_RENTERS_CREDIT = {
  single: { amount: 60, agiLimit: 55789 },
  joint: { amount: 120, agiLimit: 111579 },
};

export const CA_CHILD_CARE = {
  // [federal AGI ceiling, percentage of the federal credit]
  tiers: [[40000, 0.5], [70000, 0.43], [100000, 0.34]] as Array<[number, number]>,
  expenseOne: 3000,
  expenseTwoPlus: 6000,
};

export const CA_AMT = {
  rate: 0.07,
  exemption: { single: 95903, hoh: 95903, mfj: 127873, qss: 127873, mfs: 63933 } as ByStatus<number>,
  phaseoutStart: { single: 359642, hoh: 359642, mfj: 479524, qss: 479524, mfs: 239756 } as ByStatus<number>,
  phaseoutRate: 0.25,
};

/** Form 3805P additional tax on early distributions. */
export const CA_EARLY_DISTRIBUTION_RATE = 0.025;

/** CA estimated payments: 30% / 40% / 0% / 30%. */
export const CA_ESTIMATE_PCT = [0.3, 0.4, 0, 0.3];
export const CA_ESTIMATE_DUE_DATES = ['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'];

export const CA_ESTIMATES: string[] = [
  'California 2026 rate schedules, standard deduction, exemption credits and phase-out thresholds are projected from 2025 FTB figures (~3.4% indexing) until the FTB publishes 2026 amounts.',
  'CalEITC, Young Child Tax Credit and Foster Youth Tax Credit are not computed; use FTB 3514 for eligible low-income filers.',
  'California AMT (Schedule P) is simplified: preferences are limited to the ISO bargain element and manual adjustments.',
  'Part-year and nonresident returns (540NR) are not modeled; the 540 assumes full-year residency.',
];
