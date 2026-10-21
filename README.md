# TaxPlanner 2026

A browser-based 2026 individual tax projection tool with Lacerte-style input screens. It projects
federal Form 1040 (with supporting schedules) and a California Form 540, and generates planning
recommendations from the client's entries.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine unit tests
npm run build      # static site in dist/ (open dist/index.html or host anywhere)
```

Client files are saved in the browser (localStorage). Use **Export / Import** to move a client
between machines as JSON. No data leaves the browser.

## Input screens

| Screen | Content |
| --- | --- |
| 1 Client Information | Filing status, taxpayer/spouse (DOB, blind, SSN validity, HDHP), CA residency/renter, 2025 prior-year AGI and tax for safe harbor |
| 2 Dependents | DOB, relationship, months in home, SSN, student/disabled |
| 10 W-2 | Boxes 1–7, 10, 12 (D/E/G, AA, W, **TT overtime**), 13, **14b tips**, 16–17, CA SDI |
| 11 / 12 | 1099-INT, 1099-DIV (incl. U.S. obligation and non-CA muni interest for Schedule CA) |
| 13 1099-R | IRA vs. pension, distribution codes, rollovers, QCDs, penalty exceptions |
| 14 SSA-1099 | Social security benefits and withholding |
| 16 Schedule C, 17 Schedule D, 18 Schedule E | Business, capital transactions, rentals |
| 20 K-1 | 1065 / 1120-S / 1041 boxes, passive flag, SE earnings, §199A, CA adjustments, CA PTET credit |
| 14A Schedule 1 | Other income and capital loss carryovers |
| 24 / 24A | Adjustments (Schedule 1 Part II, IRA), Schedule 1-A (tips, overtime, car loan interest) |
| 25 Schedule A | Itemized deductions, incl. CA-only miscellaneous |
| 30 / 30A / 32 | Credits, education (8863), AMT |
| 6 Payments | Federal and CA estimates by quarter, prior overpayments, extensions |
| CA | California-only entries in one place |

## Output

* **Form 1040** plus Schedules 1, 1-A, 2, 3, A, B, C, D, E, SE, 8812 and Forms 2441, 8863, 8880,
  8995, 6251, 8959, 8960, 2210 (shown when they apply). Printable.
* **California Form 540** and Schedule CA.
* **Summary** with refund/balance due, effective and marginal rates.
* **Recommendations**: safe-harbor shortfalls, retirement/HSA room, Roth conversions, QCDs, bunching,
  SALT phase-down, PTET, tips/overtime/senior deduction, capital gains and NIIT, AMT, family credits,
  and CA-specific items. Savings are simulated by re-running the full calculation with the change.
* **Diagnostics** listing entry issues and every figure that is projected rather than published.

## 2026 law

Federal parameters come from Rev. Proc. 2025-32 and the One Big Beautiful Bill Act (P.L. 119-21):
permanent TCJA brackets, $16,100 / $32,200 / $24,150 standard deduction, $2,200 CTC ($1,700
refundable), $40,400 SALT cap with 30% phase-down over $505,000, Schedule 1-A deductions
(tips $25,000, overtime $12,500/$25,000, car loan interest $10,000, seniors $6,000), non-itemizer
charitable deduction, 0.5% charitable floor, 2/37 itemized limitation, AMT phase-out at
$500,000/$1,000,000 at 50%, expanded QBI phase-in and dependent care credit.

California 2026 amounts are projected from 2025 FTB figures until the FTB publishes them; see
`src/engine/paramsCA2026.ts` and the Diagnostics screen.

## Code layout

* `src/engine/` — pure TypeScript tax engine (no UI dependencies): `params2026.ts`,
  `paramsCA2026.ts`, `federal.ts`, `california.ts`, `recommendations.ts`, tests in `engine.test.ts`.
* `src/ui/` — screen definitions (`screens.tsx`), field components, output views.

This is a planning projection, not tax filing software.
