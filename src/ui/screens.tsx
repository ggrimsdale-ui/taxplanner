import * as D from '../engine/defaults';
import type { TaxReturnInput } from '../engine/types';
import type { FieldDef, SectionDef } from './fields';

export interface ScreenDef {
  id: string;
  number: string;
  title: string;
  group: 'General' | 'Income' | 'Deductions' | 'Credits & Taxes' | 'Payments' | 'State';
  /** Path to the object (single) or array (list) that the fields edit. */
  base: string;
  list?: { create: () => unknown; label: (item: any, i: number) => string; noun: string };
  sections: SectionDef[] | ((input: TaxReturnInput) => SectionDef[]);
  intro?: string;
}

const OWNER_TS: Array<[string, string]> = [['T', 'T — Taxpayer'], ['S', 'S — Spouse']];
const OWNER_TSJ: Array<[string, string]> = [...OWNER_TS, ['J', 'J — Joint']];
const yes = (key: string, label: string, help?: string): FieldDef => ({ key, label, type: 'bool', help });
const txt = (key: string, label: string, box?: string): FieldDef => ({ key, label, type: 'text', box });
const m = (key: string, label: string, box?: string, help?: string): FieldDef => ({ key, label, box, help });

const personFields = (p: string): FieldDef[] => [
  txt(`${p}.firstName`, 'First name'),
  txt(`${p}.lastName`, 'Last name'),
  { key: `${p}.ssn`, label: 'Social security number', type: 'ssn' },
  { key: `${p}.dob`, label: 'Date of birth', type: 'date', help: 'Drives the 65+ standard deduction, the OBBBA senior deduction, catch-up limits and RMD reminders.' },
  txt(`${p}.occupation`, 'Occupation'),
  yes(`${p}.blind`, 'Legally blind'),
  yes(`${p}.canBeClaimed`, 'Can be claimed as a dependent by another taxpayer'),
  yes(`${p}.validSsn`, 'SSN valid for employment (required for CTC, tips, overtime, senior deduction)'),
  {
    key: `${p}.hdhpCoverage`, label: 'High-deductible health plan (HSA) coverage', type: 'select',
    options: [['none', 'None'], ['self', 'Self-only'], ['family', 'Family']],
  },
];

export const SCREENS: ScreenDef[] = [
  {
    id: 'client', number: '1', title: 'Client Information', group: 'General', base: 'client',
    sections: (input) => [
      {
        title: 'Filing status & address',
        fields: [
          {
            key: 'filingStatus', label: 'Filing status', type: 'select',
            options: [['single', '1 — Single'], ['mfj', '2 — Married filing jointly'], ['mfs', '3 — Married filing separately'], ['hoh', '4 — Head of household'], ['qss', '5 — Qualifying surviving spouse']],
          },
          txt('address', 'Street address'), txt('city', 'City'), txt('state', 'State'), txt('zip', 'ZIP code'),
          yes('caResident', 'Full-year California resident (Form 540)'),
          yes('caRenter', "Rented a CA principal residence ≥ 6 months (renter's credit)"),
        ],
      },
      { title: 'Taxpayer', fields: personFields('taxpayer') },
      ...(input.client.filingStatus === 'mfj' || input.client.filingStatus === 'mfs'
        ? [{ title: 'Spouse', fields: personFields('spouse') }] : []),
      {
        title: '2025 prior-year information (safe harbor)',
        fields: [
          m('priorYear.federalAgi', '2025 federal AGI', '1040 L11'),
          m('priorYear.federalTotalTax', '2025 federal total tax', '1040 L24'),
          m('priorYear.caAgi', '2025 California AGI', '540 L17'),
          m('priorYear.caTotalTax', '2025 California total tax', '540 L64'),
        ],
      },
    ],
  },
  {
    id: 'dependents', number: '2', title: 'Dependents', group: 'General', base: 'dependents',
    list: { create: D.newDependent, label: (d, i) => `${d.firstName || 'Dependent'} ${d.lastName || i + 1}`.trim(), noun: 'dependent' },
    sections: [{
      fields: [
        txt('firstName', 'First name'), txt('lastName', 'Last name'),
        { key: 'dob', label: 'Date of birth', type: 'date' },
        {
          key: 'relationship', label: 'Relationship', type: 'select',
          options: ['Son', 'Daughter', 'Stepchild', 'Foster child', 'Grandchild', 'Sibling', 'Parent', 'Other relative', 'Other'].map((x) => [x, x]),
        },
        { key: 'monthsLived', label: 'Months lived in home', type: 'number' },
        yes('hasSsn', 'Has SSN valid for employment (CTC / EIC)'),
        yes('fullTimeStudent', 'Full-time student'),
        yes('disabled', 'Permanently and totally disabled'),
      ],
    }],
  },
  {
    id: 'w2', number: '10', title: 'Wages, Salaries, Tips (W-2)', group: 'Income', base: 'w2s',
    list: { create: () => D.newW2('T'), label: (w) => `${w.owner}: ${w.employer || 'Employer'}`, noun: 'W-2' },
    sections: [
      { title: 'Employer', fields: [{ key: 'owner', label: 'Taxpayer / Spouse', type: 'select', options: OWNER_TS }, txt('employer', 'Employer name', 'c'), txt('ein', 'Employer ID (EIN)', 'b')] },
      {
        title: 'Federal',
        fields: [
          m('wages', 'Wages, tips, other compensation', '1'), m('fedWithholding', 'Federal income tax withheld', '2'),
          m('ssWages', 'Social security wages', '3'), m('ssTax', 'Social security tax withheld', '4'),
          m('medicareWages', 'Medicare wages and tips', '5'), m('medicareTax', 'Medicare tax withheld', '6'),
          m('ssTips', 'Social security tips', '7'), m('dependentCareBenefits', 'Dependent care benefits', '10'),
          m('electiveDeferrals', 'Pre-tax 401(k)/403(b)/457(b) deferrals', '12 D/E/G'),
          m('rothDeferrals', 'Roth 401(k)/403(b) deferrals', '12 AA/BB'),
          m('hsaEmployer', 'Employer HSA contributions (incl. cafeteria plan)', '12 W'),
          m('qualifiedOvertime', 'Qualified overtime compensation (premium portion)', '12 TT', 'OBBBA "no tax on overtime": only the half-time premium under FLSA qualifies.'),
          m('qualifiedTips', 'Qualified tips', '14b', 'OBBBA "no tax on tips": voluntary tips in an occupation that customarily received tips.'),
          yes('retirementPlan', 'Retirement plan (box 13)'),
        ],
      },
      { title: 'State — California', fields: [m('stateWages', 'State wages', '16'), m('stateWithholding', 'State income tax withheld', '17'), m('caSdi', 'CA SDI withheld', '14')] },
    ],
  },
  {
    id: 'int', number: '11', title: 'Interest Income (1099-INT)', group: 'Income', base: 'int1099s',
    list: { create: D.newInt, label: (x) => `${x.owner}: ${x.payer || 'Payer'}`, noun: '1099-INT' },
    sections: [{
      fields: [
        { key: 'owner', label: 'T / S / J', type: 'select', options: OWNER_TSJ }, txt('payer', 'Payer name'),
        m('interest', 'Interest income', '1'), m('earlyWithdrawalPenalty', 'Early withdrawal penalty', '2'),
        m('usBondInterest', 'Interest on U.S. savings bonds and Treasury obligations', '3', 'Exempt from California tax.'),
        m('fedWithholding', 'Federal income tax withheld', '4'), m('taxExempt', 'Tax-exempt interest', '8'),
        m('privateActivityBond', 'Specified private activity bond interest (AMT)', '9'),
        m('taxExemptNonCa', 'Portion of box 8 from non-California bonds', 'CA', 'Taxable in California (Schedule CA addition).'),
      ],
    }],
  },
  {
    id: 'div', number: '12', title: 'Dividend Income (1099-DIV)', group: 'Income', base: 'div1099s',
    list: { create: D.newDiv, label: (x) => `${x.owner}: ${x.payer || 'Payer'}`, noun: '1099-DIV' },
    sections: [{
      fields: [
        { key: 'owner', label: 'T / S / J', type: 'select', options: OWNER_TSJ }, txt('payer', 'Payer name'),
        m('ordinary', 'Total ordinary dividends', '1a'), m('qualified', 'Qualified dividends', '1b'),
        m('capGainDistributions', 'Total capital gain distributions', '2a'), m('nondividend', 'Nondividend distributions', '3'),
        m('fedWithholding', 'Federal income tax withheld', '4'), m('section199a', 'Section 199A (REIT) dividends', '5'),
        m('foreignTax', 'Foreign tax paid', '7'), m('exemptInterestDividends', 'Exempt-interest dividends', '12'),
      ],
    }],
  },
  {
    id: 'r1099', number: '13', title: 'Pensions, IRAs (1099-R)', group: 'Income', base: 'r1099s',
    list: { create: D.newR1099, label: (x) => `${x.owner}: ${x.payer || 'Payer'}${x.ira ? ' (IRA)' : ''}`, noun: '1099-R' },
    sections: [{
      fields: [
        { key: 'owner', label: 'Taxpayer / Spouse', type: 'select', options: OWNER_TS }, txt('payer', 'Payer name'),
        yes('ira', 'IRA / SEP / SIMPLE (Form 1040 line 4; otherwise line 5)'),
        m('grossDistribution', 'Gross distribution', '1'), m('taxableAmount', 'Taxable amount', '2a'),
        m('fedWithholding', 'Federal income tax withheld', '4'),
        { key: 'distributionCode', label: 'Distribution code(s)', box: '7', type: 'text', help: '1 = early (10% penalty), 2 = early w/ exception, 7 = normal, G = direct rollover, S = early SIMPLE (25%).' },
        m('rolledOver', 'Amount rolled over (60-day)'), m('qcd', 'Qualified charitable distribution (QCD)'),
        m('penaltyExceptionAmount', 'Portion exempt from the 10% penalty (Form 5329)'),
        m('stateWithholding', 'State income tax withheld', '14'),
      ],
    }],
  },
  {
    id: 'ssa', number: '14', title: 'Social Security (SSA-1099)', group: 'Income', base: 'socialSecurity',
    sections: [
      { title: 'Taxpayer', fields: [m('T.benefits', 'Net benefits', '5'), m('T.fedWithholding', 'Voluntary federal tax withheld', '6')] },
      { title: 'Spouse', fields: [m('S.benefits', 'Net benefits', '5'), m('S.fedWithholding', 'Voluntary federal tax withheld', '6')] },
    ],
  },
  {
    id: 'schc', number: '16', title: 'Business Income (Schedule C)', group: 'Income', base: 'scheduleCs',
    list: { create: D.newSchC, label: (x) => `${x.owner}: ${x.businessName || 'Business'}`, noun: 'business' },
    sections: [
      { title: 'General', fields: [{ key: 'owner', label: 'Taxpayer / Spouse', type: 'select', options: OWNER_TS }, txt('businessName', 'Business name'), yes('sstb', 'Specified service trade or business (QBI)')] },
      { title: 'Income', fields: [m('grossReceipts', 'Gross receipts or sales', '1'), m('returns', 'Returns and allowances', '2'), m('cogs', 'Cost of goods sold', '4'), m('otherIncome', 'Other income', '6')] },
      {
        title: 'Expenses',
        fields: [
          m('advertising', 'Advertising', '8'), m('carTruck', 'Car and truck expenses', '9'), m('depreciation', 'Depreciation and §179', '13'),
          m('insurance', 'Insurance (other than health)', '15'), m('legalProfessional', 'Legal and professional services', '17'),
          m('office', 'Office expense', '18'), m('rentLease', 'Rent or lease', '20'), m('supplies', 'Supplies', '22'),
          m('travel', 'Travel', '24a'), m('meals', 'Meals (enter 100%; 50% deducted)', '24b'), m('utilities', 'Utilities', '25'),
          m('wagesPaid', 'Wages paid (also W-2 wages for QBI)', '26'), m('otherExpenses', 'Other expenses', '27a'),
          m('homeOffice', 'Business use of home', '30'),
        ],
      },
    ],
  },
  {
    id: 'schd', number: '17', title: 'Dispositions (Schedule D / 8949)', group: 'Income', base: 'capitalTransactions',
    list: { create: D.newCapTx, label: (x) => `${x.term === 'short' ? 'ST' : 'LT'}: ${x.description || 'Sale'}`, noun: 'sale' },
    intro: 'Enter each sale or a summary per 1099-B category. Capital loss carryovers from 2025 are on the Other Income screen.',
    sections: [{
      fields: [
        txt('description', 'Description of property', 'a'),
        { key: 'term', label: 'Holding period', type: 'select', options: [['short', 'Short-term (1 year or less)'], ['long', 'Long-term (more than 1 year)']] },
        m('proceeds', 'Proceeds (sales price)', 'd'), m('basis', 'Cost or other basis', 'e'), m('adjustment', 'Adjustment (e.g., wash sale +)', 'g'),
      ],
    }],
  },
  {
    id: 'sche', number: '18', title: 'Rental & Royalty (Schedule E)', group: 'Income', base: 'rentals',
    list: { create: D.newRental, label: (x) => x.address || 'Property', noun: 'property' },
    sections: [{
      fields: [
        { key: 'owner', label: 'T / S / J', type: 'select', options: OWNER_TSJ }, txt('address', 'Property address'),
        yes('activeParticipation', 'Actively participates ($25,000 loss allowance)'),
        m('rents', 'Rents received', '3'), m('mortgageInterest', 'Mortgage interest', '12'), m('taxes', 'Taxes', '16'),
        m('insurance', 'Insurance', '9'), m('repairs', 'Repairs', '14'), m('depreciation', 'Depreciation', '18'), m('otherExpenses', 'Other expenses', '19'),
      ],
    }],
  },
  {
    id: 'k1', number: '20', title: 'Partnership / S Corp / Trust (K-1)', group: 'Income', base: 'k1s',
    list: { create: D.newK1, label: (x) => `${x.type}: ${x.entityName || 'Entity'}`, noun: 'K-1' },
    sections: [
      {
        title: 'Entity',
        fields: [
          { key: 'owner', label: 'T / S / J', type: 'select', options: OWNER_TSJ },
          { key: 'type', label: 'Schedule K-1 type', type: 'select', options: [['1065', 'Form 1065 — Partnership'], ['1120S', 'Form 1120-S — S corporation'], ['1041', 'Form 1041 — Estate/Trust']] },
          txt('entityName', 'Entity name'), txt('ein', 'Entity EIN'),
          yes('passive', 'Passive activity (no material participation)'),
        ],
      },
      {
        title: 'Income (loss)',
        fields: [
          m('ordinaryIncome', 'Ordinary business income (loss)', '1'), m('rentalRealEstate', 'Net rental real estate income (loss)', '2'),
          m('otherRental', 'Other net rental income (loss)', '3'), m('guaranteedPayments', 'Guaranteed payments (1065 only)', '4c'),
          m('interest', 'Interest income', '5'), m('ordinaryDividends', 'Ordinary dividends', '6a'), m('qualifiedDividends', 'Qualified dividends', '6b'),
          m('royalties', 'Royalties', '7'), m('shortTermGain', 'Net short-term capital gain (loss)', '8'), m('longTermGain', 'Net long-term capital gain (loss)', '9a'),
          m('section1231', 'Net section 1231 gain (loss)', '10'), m('otherIncome', 'Other income (loss)', '11'),
        ],
      },
      {
        title: 'Deductions, SE and QBI',
        fields: [
          m('section179', 'Section 179 deduction', '12'), m('charitable', 'Cash charitable contributions', '13'),
          m('seEarnings', 'Net earnings from self-employment (1065)', '14A'),
          m('qbiIncome', 'Qualified business income (§199A)', '20Z'), m('qbiW2Wages', 'W-2 wages (§199A)', '20Z'), m('qbiUbia', 'UBIA of qualified property', '20Z'),
          yes('sstb', 'Specified service trade or business'),
        ],
      },
      { title: 'California', fields: [m('caAdjustment', 'Net CA adjustment (+ increases CA income)', '565/100S'), m('caPtetCredit', 'CA pass-through entity elective tax credit', '3804-CR')] },
    ],
  },
  {
    id: 'other', number: '14A', title: 'Additional Income (Schedule 1)', group: 'Income', base: '',
    sections: [
      {
        title: 'Schedule 1, Part I',
        fields: [
          m('otherIncome.taxableRefunds', 'Taxable state/local tax refunds', '1'), m('otherIncome.alimonyReceived', 'Alimony received (pre-2019 divorce)', '2a'),
          m('otherIncome.form4797Gain', 'Other gains (losses) — Form 4797', '4'), m('otherIncome.unemployment', 'Unemployment compensation', '7'),
          m('otherIncome.gamblingWinnings', 'Gambling winnings', '8b'), m('otherIncome.cancellationOfDebt', 'Cancellation of debt', '8c'),
          m('otherIncome.juryDuty', 'Jury duty pay', '8h'), m('otherIncome.otherIncome', 'Other income', '8z'),
          txt('otherIncome.otherIncomeDescription', 'Other income description', '8z'),
        ],
      },
      { title: 'Capital loss carryovers from 2025', fields: [m('capitalCarryovers.shortTerm', 'Short-term capital loss carryover', 'D 6'), m('capitalCarryovers.longTerm', 'Long-term capital loss carryover', 'D 14')] },
    ],
  },
  {
    id: 'adj', number: '24', title: 'Adjustments to Income', group: 'Deductions', base: 'adjustments',
    sections: [
      {
        title: 'Schedule 1, Part II',
        fields: [
          m('educatorT', 'Educator expenses — taxpayer (max $350)', '11'), m('educatorS', 'Educator expenses — spouse', '11'),
          m('hsaT', 'HSA contributions (not through payroll) — taxpayer', '13'), m('hsaS', 'HSA contributions — spouse', '13'),
          m('movingMilitary', 'Moving expenses — Armed Forces', '14'),
          m('sepSimpleT', 'SEP / SIMPLE / solo 401(k) — taxpayer', '16'), m('sepSimpleS', 'SEP / SIMPLE / solo 401(k) — spouse', '16'),
          m('seHealthInsurance', 'Self-employed health insurance', '17'), m('alimonyPaid', 'Alimony paid (pre-2019 divorce)', '19a'),
          m('studentLoanInterest', 'Student loan interest paid', '21'), m('otherAdjustments', 'Other adjustments', '24z'),
        ],
      },
      {
        title: 'IRA contributions for 2026',
        fields: [
          m('traditionalIraT', 'Traditional IRA — taxpayer', '20'), m('traditionalIraS', 'Traditional IRA — spouse', '20'),
          m('rothIraT', 'Roth IRA — taxpayer', '8880'), m('rothIraS', 'Roth IRA — spouse', '8880'),
        ],
      },
    ],
  },
  {
    id: 'sch1a', number: '24A', title: 'Schedule 1-A (Tips, Overtime, Car Loan)', group: 'Deductions', base: 'schedule1A',
    intro: 'W-2 box 12 TT and box 14b amounts flow here automatically. The $6,000 senior deduction is computed from date of birth.',
    sections: [{
      fields: [
        m('additionalTips', 'Qualified tips not on W-2 (1099, Form 4137)'),
        m('additionalOvertime', 'Qualified overtime not on W-2'),
        m('carLoanInterest', 'Interest on qualified passenger vehicle loan'),
        yes('vehicleQualifies', 'Vehicle is new, final assembly in U.S., personal use, loan originated after 2024'),
      ],
    }],
  },
  {
    id: 'itemized', number: '25', title: 'Itemized Deductions (Schedule A)', group: 'Deductions', base: 'itemized',
    intro: 'State income tax withheld on W-2s/1099-Rs and CA estimates paid in 2026 (Q1–Q3) are included automatically.',
    sections: [
      { fields: [yes('forceItemize', 'Force itemized deductions'), m('medical', 'Medical and dental expenses', '1')] },
      {
        title: 'Taxes you paid',
        fields: [
          m('additionalStateIncomeTax', 'Other state income tax paid in 2026 (e.g., 2025 balance due)', '5a'),
          yes('useSalesTax', 'Elect general sales tax instead of income tax'), m('salesTax', 'General sales tax', '5a'),
          m('realEstateTax', 'Real estate taxes', '5b'), m('personalPropertyTax', 'Personal property taxes', '5c'),
        ],
      },
      {
        title: 'Interest you paid',
        fields: [
          m('mortgageInterest', 'Home mortgage interest (Form 1098)', '8a'), m('mortgagePoints', 'Points not reported on 1098', '8c'),
          m('mortgageInsurance', 'Mortgage insurance premiums (restored 2026)', '8d'),
          m('mortgageBalance', 'Average acquisition debt balance', '', 'Used for the $750,000 federal / $1,000,000 California limits.'),
          m('investmentInterest', 'Investment interest (Form 4952)', '9'),
        ],
      },
      { title: 'Gifts to charity', fields: [m('charityCash', 'Cash contributions', '11'), m('charityNoncash', 'Noncash contributions', '12')] },
      {
        title: 'Other',
        fields: [
          m('casualtyLoss', 'Casualty loss (federally declared disaster)', '15'), m('gamblingLosses', 'Gambling losses (90% allowed)', '16'),
          m('otherItemized', 'Other itemized deductions', '16'), m('caMiscellaneous', 'CA only: unreimbursed employee / 2% misc. expenses', 'CA'),
        ],
      },
    ],
  },
  {
    id: 'credits', number: '30', title: 'Credits', group: 'Credits & Taxes', base: 'credits',
    sections: [
      {
        title: 'Child and dependent care (Form 2441)',
        fields: [m('childCareExpenses', 'Qualified care expenses paid in 2026'), { key: 'childCareQualifyingPersons', label: 'Qualifying persons (0 = from dependents under 13)', type: 'number' }],
      },
      {
        title: 'Other credits',
        fields: [
          m('foreignTaxAdditional', 'Foreign tax paid (other than 1099-DIV)', '3 L1'),
          m('otherNonrefundable', 'Other nonrefundable credits', '3 L6z'), m('otherRefundable', 'Other refundable credits', '3 L13z'),
          m('caOtherCredits', 'Other California credits', '540'),
        ],
      },
    ],
  },
  {
    id: 'education', number: '30A', title: 'Education (Form 8863)', group: 'Credits & Taxes', base: 'credits.students',
    list: { create: D.newStudent, label: (x) => x.name || 'Student', noun: 'student' },
    sections: [{ fields: [txt('name', 'Student name'), m('qualifiedExpenses', 'Qualified tuition and expenses (1098-T)'), yes('aotcEligible', 'American opportunity credit eligible (first 4 years, half-time)')] }],
  },
  {
    id: 'amt', number: '32', title: 'Alternative Minimum Tax', group: 'Credits & Taxes', base: 'amt',
    sections: [{ fields: [m('isoBargainElement', 'Incentive stock option bargain element', '6251 2i'), m('otherAdjustments', 'Other AMT adjustments and preferences', '6251')] }],
  },
  {
    id: 'payments', number: '6', title: 'Taxes Paid & Estimates', group: 'Payments', base: 'payments',
    intro: 'Withholding from W-2, 1099 and SSA-1099 screens flows in automatically.',
    sections: [
      {
        title: 'Federal 2026 estimated payments (1040-ES)',
        fields: [
          m('fedEstimates.0', 'Q1 — paid April 15, 2026'), m('fedEstimates.1', 'Q2 — paid June 15, 2026'),
          m('fedEstimates.2', 'Q3 — paid September 15, 2026'), m('fedEstimates.3', 'Q4 — due January 15, 2027'),
          m('fedPriorOverpayment', '2025 overpayment applied to 2026'), m('fedExtension', 'Paid with extension (Form 4868)'),
          m('fedOtherWithholding', 'Other federal withholding'),
        ],
      },
      {
        title: 'California 2026 estimated payments (540-ES)',
        fields: [
          m('caEstimates.0', 'Q1 — April 15, 2026 (30%)'), m('caEstimates.1', 'Q2 — June 15, 2026 (40%)'),
          m('caEstimates.2', 'Q3 — September 15, 2026 (0%)'), m('caEstimates.3', 'Q4 — January 15, 2027 (30%)'),
          m('caPriorOverpayment', '2025 CA overpayment applied'), m('caExtension', 'Paid with FTB 3519'),
          m('caOtherWithholding', 'Other CA withholding (592-B, 593)'),
        ],
      },
    ],
  },
  {
    id: 'ca', number: 'CA', title: 'California (Form 540)', group: 'State', base: '',
    intro: 'California-specific entries in one place. CA wages and withholding come from W-2 boxes 16–17; K-1 CA adjustments and PTET credits are on the K-1 screen.',
    sections: [
      { title: 'Residency', fields: [yes('client.caResident', 'Full-year California resident'), yes('client.caRenter', "Renter's credit: rented a CA principal residence ≥ 6 months")] },
      {
        title: 'Estimated payments (540-ES)',
        fields: [
          m('payments.caEstimates.0', 'Q1 — April 15, 2026 (30%)'), m('payments.caEstimates.1', 'Q2 — June 15, 2026 (40%)'),
          m('payments.caEstimates.2', 'Q3 — September 15, 2026 (0%)'), m('payments.caEstimates.3', 'Q4 — January 15, 2027 (30%)'),
          m('payments.caPriorOverpayment', '2025 CA overpayment applied'), m('payments.caExtension', 'Paid with FTB 3519'),
          m('payments.caOtherWithholding', 'Other CA withholding (592-B, 593)'),
        ],
      },
      { title: 'Deductions & credits', fields: [m('itemized.caMiscellaneous', 'Unreimbursed employee / 2% miscellaneous expenses'), m('credits.caOtherCredits', 'Other California credits')] },
      { title: 'Prior year', fields: [m('client.priorYear.caAgi', '2025 California AGI', '540 L17'), m('client.priorYear.caTotalTax', '2025 California total tax', '540 L64')] },
    ],
  },
];

export const GROUPS: ScreenDef['group'][] = ['General', 'Income', 'Deductions', 'Credits & Taxes', 'Payments', 'State'];
