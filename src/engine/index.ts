import { computeCalifornia, type CaResult } from './california';
import { computeFederal, type FederalResult } from './federal';
import { buildRecommendations, type Recommendation } from './recommendations';
import type { TaxReturnInput } from './types';

export interface TaxResults {
  federal: FederalResult;
  california: CaResult;
}

export interface FullResults extends TaxResults {
  recommendations: Recommendation[];
  /** Combined marginal rate on the next $1,000 of ordinary income. */
  marginal: { federal: number; california: number };
}

export function computeTaxes(input: TaxReturnInput): TaxResults {
  const federal = computeFederal(input);
  const california = computeCalifornia(input, federal);
  return { federal, california };
}

export function computeAll(input: TaxReturnInput): FullResults {
  const base = computeTaxes(input);
  const bumped = structuredClone(input);
  bumped.otherIncome.otherIncome += 1000;
  const b = computeTaxes(bumped);
  const marginal = {
    federal: (b.federal.totalTax - b.federal.eitc - b.federal.actc - (base.federal.totalTax - base.federal.eitc - base.federal.actc)) / 1000,
    california: (b.california.totalTax - base.california.totalTax) / 1000,
  };
  return { ...base, marginal, recommendations: buildRecommendations(input, base, marginal, computeTaxes) };
}

export type { Recommendation };
export * from './types';
