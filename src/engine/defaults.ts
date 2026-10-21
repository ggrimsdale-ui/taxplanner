import type {
  CapitalTransaction, Dependent, Div1099, EducationStudent, Int1099, K1, Person, R1099, Rental, ScheduleC,
  TaxReturnInput, W2,
} from './types';

let counter = 0;
export const newId = (): string => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export const emptyPerson = (): Person => ({
  firstName: '', lastName: '', ssn: '', dob: '', occupation: '', blind: false, canBeClaimed: false,
  validSsn: true, hdhpCoverage: 'none',
});

export const newW2 = (owner: 'T' | 'S' = 'T'): W2 => ({
  id: newId(), owner, employer: '', ein: '', wages: 0, fedWithholding: 0, ssWages: 0, ssTax: 0,
  medicareWages: 0, medicareTax: 0, ssTips: 0, dependentCareBenefits: 0, electiveDeferrals: 0,
  rothDeferrals: 0, hsaEmployer: 0, qualifiedOvertime: 0, qualifiedTips: 0, retirementPlan: false,
  stateWages: 0, stateWithholding: 0, caSdi: 0,
});

export const newK1 = (): K1 => ({
  id: newId(), owner: 'T', type: '1065', entityName: '', ein: '', passive: false, ordinaryIncome: 0,
  rentalRealEstate: 0, otherRental: 0, guaranteedPayments: 0, interest: 0, ordinaryDividends: 0,
  qualifiedDividends: 0, royalties: 0, shortTermGain: 0, longTermGain: 0, section1231: 0, otherIncome: 0,
  section179: 0, charitable: 0, seEarnings: 0, qbiIncome: 0, qbiW2Wages: 0, qbiUbia: 0, sstb: false,
  caAdjustment: 0, caPtetCredit: 0,
});

export const newR1099 = (): R1099 => ({
  id: newId(), owner: 'T', payer: '', ira: true, grossDistribution: 0, taxableAmount: 0, fedWithholding: 0,
  distributionCode: '7', rolledOver: 0, qcd: 0, penaltyExceptionAmount: 0, stateWithholding: 0,
});

export const newInt = (): Int1099 => ({
  id: newId(), owner: 'T', payer: '', interest: 0, earlyWithdrawalPenalty: 0, usBondInterest: 0,
  fedWithholding: 0, taxExempt: 0, privateActivityBond: 0, taxExemptNonCa: 0,
});

export const newDiv = (): Div1099 => ({
  id: newId(), owner: 'T', payer: '', ordinary: 0, qualified: 0, capGainDistributions: 0, nondividend: 0,
  fedWithholding: 0, section199a: 0, foreignTax: 0, exemptInterestDividends: 0,
});

export const newCapTx = (): CapitalTransaction => ({
  id: newId(), description: '', term: 'long', proceeds: 0, basis: 0, adjustment: 0,
});

export const newSchC = (): ScheduleC => ({
  id: newId(), owner: 'T', businessName: '', grossReceipts: 0, returns: 0, cogs: 0, otherIncome: 0,
  advertising: 0, carTruck: 0, depreciation: 0, insurance: 0, legalProfessional: 0, office: 0, rentLease: 0,
  supplies: 0, travel: 0, meals: 0, utilities: 0, wagesPaid: 0, otherExpenses: 0, homeOffice: 0, sstb: false,
});

export const newRental = (): Rental => ({
  id: newId(), owner: 'J', address: '', rents: 0, mortgageInterest: 0, taxes: 0, insurance: 0, repairs: 0,
  depreciation: 0, otherExpenses: 0, activeParticipation: true,
});

export const newDependent = (): Dependent => ({
  id: newId(), firstName: '', lastName: '', dob: '', relationship: 'Son', monthsLived: 12, hasSsn: true,
  fullTimeStudent: false, disabled: false,
});

export const newStudent = (): EducationStudent => ({ id: newId(), name: '', qualifiedExpenses: 0, aotcEligible: true });

export function emptyReturn(): TaxReturnInput {
  return {
    client: {
      filingStatus: 'single', taxpayer: emptyPerson(), spouse: emptyPerson(), address: '', city: '',
      state: 'CA', zip: '', caResident: true, caRenter: false,
      priorYear: { federalAgi: 0, federalTotalTax: 0, caAgi: 0, caTotalTax: 0 },
    },
    dependents: [], w2s: [], k1s: [], r1099s: [],
    socialSecurity: { T: { benefits: 0, fedWithholding: 0 }, S: { benefits: 0, fedWithholding: 0 } },
    int1099s: [], div1099s: [], capitalTransactions: [], capitalCarryovers: { shortTerm: 0, longTerm: 0 },
    scheduleCs: [], rentals: [],
    otherIncome: {
      taxableRefunds: 0, alimonyReceived: 0, unemployment: 0, gamblingWinnings: 0, form4797Gain: 0,
      cancellationOfDebt: 0, juryDuty: 0, otherIncome: 0, otherIncomeDescription: '',
    },
    adjustments: {
      educatorT: 0, educatorS: 0, hsaT: 0, hsaS: 0, movingMilitary: 0, sepSimpleT: 0, sepSimpleS: 0,
      seHealthInsurance: 0, alimonyPaid: 0, traditionalIraT: 0, traditionalIraS: 0, rothIraT: 0, rothIraS: 0,
      studentLoanInterest: 0, otherAdjustments: 0,
    },
    schedule1A: { additionalTips: 0, additionalOvertime: 0, carLoanInterest: 0, vehicleQualifies: false },
    itemized: {
      forceItemize: false, medical: 0, additionalStateIncomeTax: 0, useSalesTax: false, salesTax: 0,
      realEstateTax: 0, personalPropertyTax: 0, mortgageInterest: 0, mortgagePoints: 0, mortgageInsurance: 0,
      mortgageBalance: 0, investmentInterest: 0, charityCash: 0, charityNoncash: 0, casualtyLoss: 0,
      gamblingLosses: 0, otherItemized: 0, caMiscellaneous: 0,
    },
    credits: {
      childCareExpenses: 0, childCareQualifyingPersons: 0, students: [], foreignTaxAdditional: 0,
      otherNonrefundable: 0, otherRefundable: 0, caOtherCredits: 0,
    },
    payments: {
      fedEstimates: [0, 0, 0, 0], fedPriorOverpayment: 0, fedExtension: 0, fedOtherWithholding: 0,
      caEstimates: [0, 0, 0, 0], caPriorOverpayment: 0, caExtension: 0, caOtherWithholding: 0,
    },
    amt: { isoBargainElement: 0, otherAdjustments: 0 },
  };
}

/** Fill any fields missing from an older saved file with defaults. */
export function normalizeReturn(raw: unknown): TaxReturnInput {
  const base = emptyReturn();
  const merge = (a: any, b: any): any => {
    if (Array.isArray(a)) return Array.isArray(b) ? b : a;
    if (a && typeof a === 'object') {
      const out: any = { ...a };
      if (b && typeof b === 'object') for (const k of Object.keys(b)) out[k] = k in a ? merge(a[k], b[k]) : b[k];
      return out;
    }
    return b === undefined || b === null ? a : b;
  };
  return merge(base, raw);
}

/** A married California household that exercises most input screens. */
export function sampleReturn(): TaxReturnInput {
  const r = emptyReturn();
  r.client = {
    ...r.client,
    filingStatus: 'mfj',
    taxpayer: { ...emptyPerson(), firstName: 'Alex', lastName: 'Rivera', dob: '1972-03-14', occupation: 'Engineering manager', hdhpCoverage: 'family' },
    spouse: { ...emptyPerson(), firstName: 'Jordan', lastName: 'Rivera', dob: '1975-08-02', occupation: 'Nurse' },
    address: '123 Oak Street', city: 'San Jose', state: 'CA', zip: '95125',
    priorYear: { federalAgi: 352000, federalTotalTax: 61000, caAgi: 360000, caTotalTax: 24500 },
  };
  r.dependents = [
    { ...newDependent(), firstName: 'Maya', lastName: 'Rivera', dob: '2014-05-20', relationship: 'Daughter' },
    { ...newDependent(), firstName: 'Leo', lastName: 'Rivera', dob: '2019-11-03', relationship: 'Son' },
  ];
  r.w2s = [
    {
      ...newW2('T'), employer: 'Bay Area Tech Inc.', wages: 225000, fedWithholding: 34000, ssWages: 184500,
      ssTax: 11439, medicareWages: 240000, medicareTax: 3480, electiveDeferrals: 15000, hsaEmployer: 1500,
      retirementPlan: true, stateWages: 226500, stateWithholding: 15500, caSdi: 3120,
    },
    {
      ...newW2('S'), employer: 'Valley Medical Center', wages: 98000, fedWithholding: 9800, ssWages: 104000,
      ssTax: 6448, medicareWages: 104000, medicareTax: 1508, electiveDeferrals: 6000, qualifiedOvertime: 7200,
      retirementPlan: true, stateWages: 98000, stateWithholding: 4900, caSdi: 1352, dependentCareBenefits: 5000,
    },
  ];
  r.k1s = [{
    ...newK1(), entityName: 'Rivera Consulting Partners LLC', type: '1065', ordinaryIncome: 42000,
    guaranteedPayments: 0, seEarnings: 42000, qbiIncome: 42000, interest: 150, sstb: true,
  }];
  r.r1099s = [];
  r.int1099s = [{ ...newInt(), payer: 'First Bank', interest: 2400, usBondInterest: 600 }];
  r.div1099s = [{ ...newDiv(), payer: 'Brokerage', ordinary: 6200, qualified: 5100, capGainDistributions: 1800, foreignTax: 180 }];
  r.capitalTransactions = [
    { ...newCapTx(), description: '100 sh XYZ', term: 'long', proceeds: 38000, basis: 22000 },
    { ...newCapTx(), description: '50 sh ABC', term: 'short', proceeds: 9000, basis: 11500 },
  ];
  r.adjustments.hsaT = 3000;
  r.itemized = {
    ...r.itemized, realEstateTax: 14200, mortgageInterest: 21500, mortgageBalance: 640000, charityCash: 6000,
    charityNoncash: 1500, medical: 4000,
  };
  r.credits.childCareExpenses = 9000;
  r.payments.fedEstimates = [4000, 4000, 4000, 0];
  r.payments.caEstimates = [1500, 2000, 0, 1500];
  return r;
}
