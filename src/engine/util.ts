import type { Brackets } from './params2026';
import type { FilingStatus, Owner, TaxReturnInput } from './types';

export const sum = (xs: number[]): number => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const pos = (x: number): number => Math.max(0, x);
export const round = (x: number): number => Math.round(x);

/** Age attained by December 31 of the tax year; null when no DOB entered. */
export function ageAtYearEnd(dob: string, year = 2026): number | null {
  if (!dob) return null;
  const birthYear = Number(dob.slice(0, 4));
  if (!Number.isFinite(birthYear) || birthYear < 1880) return null;
  return year - birthYear;
}

/**
 * IRS treats a person as 65 on the day before their 65th birthday, so anyone
 * born before January 2, 1962 is 65 for 2026.
 */
export function is65(dob: string): boolean {
  return !!dob && dob <= '1962-01-01';
}

export function bracketTax(income: number, brackets: Brackets): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    if (income <= lower) break;
    tax += (Math.min(income, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export function marginalBracketRate(income: number, brackets: Brackets): number {
  for (const [upper, rate] of brackets) if (income < upper) return rate;
  return brackets[brackets.length - 1][1];
}

export const isJoint = (s: FilingStatus): boolean => s === 'mfj';
export const isMarried = (s: FilingStatus): boolean => s === 'mfj' || s === 'mfs';

/** Spouse-owned items only belong on a joint return. */
export function includeOwner(input: TaxReturnInput, owner: Owner): boolean {
  return owner !== 'S' || input.client.filingStatus === 'mfj';
}

/** Linear phase-out fraction remaining (1 = full benefit, 0 = fully phased out). */
export function phaseFraction(magi: number, [lo, hi]: [number, number]): number {
  if (hi <= lo) return magi <= lo ? 1 : 0;
  return clamp((hi - magi) / (hi - lo), 0, 1);
}

export function daysBetween(a: string, b: string): number {
  return Math.max(0, (Date.parse(b) - Date.parse(a)) / 86400000);
}

export const fmt = (n: number): string =>
  (n < 0 ? '(' : '') + Math.abs(Math.round(n)).toLocaleString('en-US') + (n < 0 ? ')' : '');
