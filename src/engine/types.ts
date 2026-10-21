// Input model for a 2026 client return. Every money field is a plain number in
// whole or fractional dollars; empty inputs are stored as 0.

export type FilingStatus = 'single' | 'mfj' | 'mfs' | 'hoh' | 'qss';
/** Taxpayer, Spouse, or Joint (Lacerte's T/S/J ownership code). */
export type Owner = 'T' | 'S' | 'J';

export interface Person {
  firstName: string;
  lastName: string;
  ssn: string;
  /** ISO date, YYYY-MM-DD. */
  dob: string;
  occupation: string;
  blind: boolean;
  /** Can be claimed as a dependent on someone else's return. */
  canBeClaimed: boolean;
  /** Has a valid SSN for the OBBBA senior/tips/overtime deductions. */
  validSsn: boolean;
  /** HDHP coverage for HSA purposes. */
  hdhpCoverage: 'none' | 'self' | 'family';
}

export interface PriorYear {
  federalAgi: number;
  federalTotalTax: number;
  caAgi: number;
  caTotalTax: number;
}

export interface ClientInfo {
  filingStatus: FilingStatus;
  taxpayer: Person;
  spouse: Person;
  address: string;
  city: string;
  state: string;
  zip: string;
  /** Full-year California resident (540). Part-year/nonresident (540NR) is not modeled. */
  caResident: boolean;
  /** Paid rent on a CA principal residence for at least half the year (renter's credit). */
  caRenter: boolean;
  priorYear: PriorYear;
}

export interface Dependent {
  id: string;
  firstName: string;
  lastName: string;
  dob: string;
  relationship: string;
  monthsLived: number;
  hasSsn: boolean;
  fullTimeStudent: boolean;
  disabled: boolean;
}

export interface W2 {
  id: string;
  owner: Exclude<Owner, 'J'>;
  employer: string;
  ein: string;
  wages: number; // box 1
  fedWithholding: number; // box 2
  ssWages: number; // box 3
  ssTax: number; // box 4
  medicareWages: number; // box 5
  medicareTax: number; // box 6
  ssTips: number; // box 7
  dependentCareBenefits: number; // box 10
  electiveDeferrals: number; // box 12 D/E/G (pre-tax 401k/403b/457b)
  rothDeferrals: number; // box 12 AA/BB
  hsaEmployer: number; // box 12 W
  qualifiedOvertime: number; // box 12 TT (2026): overtime premium portion
  qualifiedTips: number; // box 14b (2026): qualified tips
  retirementPlan: boolean; // box 13
  stateWages: number; // box 16
  stateWithholding: number; // box 17
  caSdi: number; // box 14 CA SDI
}

export type K1Type = '1065' | '1120S' | '1041';

export interface K1 {
  id: string;
  owner: Owner;
  type: K1Type;
  entityName: string;
  ein: string;
  /** Passive activity (no material participation). */
  passive: boolean;
  ordinaryIncome: number; // box 1
  rentalRealEstate: number; // box 2
  otherRental: number; // box 3
  guaranteedPayments: number; // 1065 box 4c
  interest: number; // 1065 box 5 / 1120-S box 4
  ordinaryDividends: number;
  qualifiedDividends: number;
  royalties: number;
  shortTermGain: number;
  longTermGain: number;
  section1231: number;
  otherIncome: number;
  section179: number;
  charitable: number;
  seEarnings: number; // 1065 box 14A
  qbiIncome: number; // box 20Z / 17V
  qbiW2Wages: number;
  qbiUbia: number;
  sstb: boolean;
  /** Net CA adjustment (Schedule K-1 565/568/100S vs federal), + adds income. */
  caAdjustment: number;
  /** CA pass-through entity elective tax credit (Form 3804-CR). */
  caPtetCredit: number;
}

export interface R1099 {
  id: string;
  owner: Exclude<Owner, 'J'>;
  payer: string;
  /** IRA/SEP/SIMPLE checkbox: drives line 4 vs line 5 of Form 1040. */
  ira: boolean;
  grossDistribution: number; // box 1
  taxableAmount: number; // box 2a
  fedWithholding: number; // box 4
  distributionCode: string; // box 7
  rolledOver: number; // portion rolled over within 60 days
  qcd: number; // qualified charitable distribution
  penaltyExceptionAmount: number; // portion of early distribution exempt from 10%
  stateWithholding: number;
}

export interface SocialSecurity {
  benefits: number; // SSA-1099 box 5
  fedWithholding: number; // box 6
}

export interface Int1099 {
  id: string;
  owner: Owner;
  payer: string;
  interest: number; // box 1
  earlyWithdrawalPenalty: number; // box 2
  usBondInterest: number; // box 3 (CA-exempt)
  fedWithholding: number; // box 4
  taxExempt: number; // box 8
  privateActivityBond: number; // box 9 (AMT preference)
  taxExemptNonCa: number; // portion of box 8 from non-CA bonds (CA addition)
}

export interface Div1099 {
  id: string;
  owner: Owner;
  payer: string;
  ordinary: number; // 1a
  qualified: number; // 1b
  capGainDistributions: number; // 2a
  nondividend: number; // 3
  fedWithholding: number; // 4
  section199a: number; // 5
  foreignTax: number; // 7
  exemptInterestDividends: number; // 12
}

export interface CapitalTransaction {
  id: string;
  description: string;
  term: 'short' | 'long';
  proceeds: number;
  basis: number;
  adjustment: number;
}

export interface CapitalCarryovers {
  shortTerm: number; // enter as positive loss carryover
  longTerm: number;
}

export interface ScheduleC {
  id: string;
  owner: Exclude<Owner, 'J'>;
  businessName: string;
  grossReceipts: number;
  returns: number;
  cogs: number;
  otherIncome: number;
  advertising: number;
  carTruck: number;
  depreciation: number;
  insurance: number;
  legalProfessional: number;
  office: number;
  rentLease: number;
  supplies: number;
  travel: number;
  meals: number; // entered at 100%; 50% allowed
  utilities: number;
  wagesPaid: number;
  otherExpenses: number;
  homeOffice: number;
  sstb: boolean;
}

export interface Rental {
  id: string;
  owner: Owner;
  address: string;
  rents: number;
  mortgageInterest: number;
  taxes: number;
  insurance: number;
  repairs: number;
  depreciation: number;
  otherExpenses: number;
  activeParticipation: boolean;
}

export interface OtherIncome {
  taxableRefunds: number;
  alimonyReceived: number;
  unemployment: number;
  gamblingWinnings: number;
  form4797Gain: number;
  cancellationOfDebt: number;
  juryDuty: number;
  otherIncome: number;
  otherIncomeDescription: string;
}

export interface Adjustments {
  educatorT: number;
  educatorS: number;
  hsaT: number; // personal (non-payroll) HSA contributions
  hsaS: number;
  movingMilitary: number;
  sepSimpleT: number;
  sepSimpleS: number;
  seHealthInsurance: number;
  alimonyPaid: number;
  traditionalIraT: number;
  traditionalIraS: number;
  rothIraT: number;
  rothIraS: number;
  studentLoanInterest: number;
  otherAdjustments: number;
}

export interface Schedule1A {
  /** Tips not reported on W-2 box 14b (e.g., 1099-NEC/K or Form 4137). */
  additionalTips: number;
  /** Overtime premium not reported in W-2 box 12 TT. */
  additionalOvertime: number;
  carLoanInterest: number;
  vehicleQualifies: boolean;
}

export interface Itemized {
  forceItemize: boolean;
  medical: number;
  /** State/local income tax paid not already captured from W-2/1099-R/CA estimates. */
  additionalStateIncomeTax: number;
  useSalesTax: boolean;
  salesTax: number;
  realEstateTax: number;
  personalPropertyTax: number;
  mortgageInterest: number;
  mortgagePoints: number;
  mortgageInsurance: number;
  mortgageBalance: number;
  investmentInterest: number;
  charityCash: number;
  charityNoncash: number;
  casualtyLoss: number;
  gamblingLosses: number;
  otherItemized: number;
  /** CA-only: unreimbursed employee/2% miscellaneous expenses. */
  caMiscellaneous: number;
}

export interface EducationStudent {
  id: string;
  name: string;
  qualifiedExpenses: number;
  /** First four years of postsecondary education, at least half time. */
  aotcEligible: boolean;
}

export interface Credits {
  childCareExpenses: number;
  /** Override the count of qualifying persons for Form 2441 (0 = auto from dependents under 13). */
  childCareQualifyingPersons: number;
  students: EducationStudent[];
  foreignTaxAdditional: number;
  otherNonrefundable: number;
  otherRefundable: number;
  caOtherCredits: number;
}

export interface Payments {
  fedEstimates: [number, number, number, number];
  fedPriorOverpayment: number;
  fedExtension: number;
  fedOtherWithholding: number;
  caEstimates: [number, number, number, number];
  caPriorOverpayment: number;
  caExtension: number;
  caOtherWithholding: number;
}

export interface AmtInputs {
  isoBargainElement: number;
  otherAdjustments: number;
}

export interface TaxReturnInput {
  client: ClientInfo;
  dependents: Dependent[];
  w2s: W2[];
  k1s: K1[];
  r1099s: R1099[];
  socialSecurity: { T: SocialSecurity; S: SocialSecurity };
  int1099s: Int1099[];
  div1099s: Div1099[];
  capitalTransactions: CapitalTransaction[];
  capitalCarryovers: CapitalCarryovers;
  scheduleCs: ScheduleC[];
  rentals: Rental[];
  otherIncome: OtherIncome;
  adjustments: Adjustments;
  schedule1A: Schedule1A;
  itemized: Itemized;
  credits: Credits;
  payments: Payments;
  amt: AmtInputs;
}

/** One printed line on a form. */
export interface FormLine {
  line: string;
  label: string;
  amount?: number;
  text?: string;
  /** Visually emphasize totals. */
  total?: boolean;
}

export interface FormSection {
  title?: string;
  lines: FormLine[];
}

export interface RenderedForm {
  id: string;
  name: string;
  title: string;
  sections: FormSection[];
  notes?: string[];
}
