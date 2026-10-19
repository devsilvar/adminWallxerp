The Comprehensive 15-Question Mapping Matrix
Phase 1: Legal Structure & Sector Constraints
Question / Input Channel Selected Option Internal State Variable Changes Unlocked Legal Deductions / Tax Holidays Added Filing Obligations & Hard Deadlines
Q1: Legal Structure [A] Unregistered isCorporate: false
taxAuthority: "SIRS" Personal Tax Threshold: Profits under ₦800,000 are 100% tax-free. Form A Personal Filings: Due annually by March 31st to the State IRS.
[B] Business Name isCorporate: false
taxAuthority: "SIRS" Rent Relief Deduction: Deduct up to 20% of rent or ₦500,000 (whichever is lower). Form A Personal Filings: Due annually by March 31st to the State IRS.
[C] LLC / PLC isCorporate: true
taxAuthority: "NRS" Enables Corporate Exemption Paths. Corporate Tax Returns: Due exactly 6 months after your financial year ends.
Q2: Niche / Industry [A] Standard Trade Keep default variables. Standard operational expenses allowed. None added.
[B] Professional / Creative Services isProfessionalService: true None: Disables the Small Company 0% CIT status by default. Standard Corporate Track: Forces full bookkeeping requirements from day one.
[C] Agribusiness / Solid Minerals exportIncentives: true Primary Agro-Holiday: Unlocks access to a 5-year 100% tax holiday on primary farming profits. Agric Regulatory Returns: Annual tracking reports sent to Ministry of Agric / NRS.
Q3: Startup Act Status [A] No Label Keep default variables. None. None.
[B] Labeled Startup isStartupActLabel: true Startup Act Override: Bypasses professional service blocks; unlocks 4-year EDTI tax credits. Startup Portal Returns: Milestone progress metrics updated on the National Startup Portal.
Phase 2: Financial Thresholds & Asset Scale
Question / Input Channel Selected Option Internal State Variable Changes Unlocked Legal Deductions / Tax Holidays Added Filing Obligations & Hard Deadlines
Q4: Annual Turnover [A] Under ₦12M isVatExempt: true
citRate: 0.00
devLevyRate: 0.00 Nano Exemption Certificate: 100% exempt from income taxes, CGT, and local levies. Nil Personal Return: File once a year by March 31st to keep the exemption active.
[B] ₦12M – ₦50M isVatExempt: true
if (LLC && !Professional) { citRate: 0.00 } Small Business VAT Exemption: Legally banned from charging 7.5% VAT (gives pricing edge). Nil Corporate Return: If LLC, file a Nil return 6 months post-FYE to avoid ₦100k fine.
[C] ₦50M – ₦100M isVatExempt: false
if (LLC && !Professional) { citRate: 0.00 } 0% Corporate Income Tax: Still pays 0% CIT if registered as a qualifying standard LLC. Monthly VAT Remittance: File and pay 7.5% VAT by the 21st day of every month.
[D] Above ₦100M isVatExempt: false
citRate: 0.30
devLevyRate: 0.04 Standard Business Expense Deductions: Full deductions for software licenses, ads, payroll. 34% Aggregate Corporate Tax: File audited financial statements 6 months post-FYE.
Q5: Fixed Asset Value [A] ≤ ₦250M Keep default calculations. Preserves small business status if turnover matches. None.
[B] > ₦250M citRate: 0.30
devLevyRate: 0.04 Asset size overrules small turnover exemptions. Large Corporate Track: Forces full 30% CIT + 4% Development Levy filing regardless of revenue.
Phase 3: Human Capital & Branch Architecture
Question / Input Channel Selected Option Internal State Variable Changes Unlocked Legal Deductions / Tax Holidays Added Filing Obligations & Hard Deadlines
Q6: Salaried Staff [A] No Staff hasPaye: false None. None.
[B] Yes (Earning >₦800k/yr) hasPaye: true Staff Expense Deduction: Gross salary payouts are fully deductible from company profit. Monthly PAYE Remittance: Deduct and remit payroll tax by the 10th day of every month.
Q7: Team Distribution [A] Single Location isMultiState: false None. Central State Remittance: Pay PAYE to your home state tax authority by the 10th.
[B] Multiple Intra-State isMultiState: false None. Central State Remittance: Centralized payroll sent to your single state tax board.
[C] Multi-State / Remote Workers isMultiState: true None. Multi-State Payroll Split: You must unbundle your payroll and pay each state where a worker lives by the 10th.
Phase 4: Digital Assets & Modern Financial Transactions
Question / Input Channel Selected Option Internal State Variable Changes Unlocked Legal Deductions / Tax Holidays Added Filing Obligations & Hard Deadlines
Q8: Digital Assets / Crypto [A] Fiat Only Keep default variables. None. None.
[B] Yes (Web3/Tokens) isCryptoSubject: true Crypto Loss Offsetting: Digital losses can offset future digital asset gains (ring-fenced). 30% Digital Capital Gains Tax: File itemized digital asset disposal reports during annual returns.
Q9: SaaS / Digital Platform [A] Offline / Direct Keep default variables. None. None.
[B] Global Cloud / Platform sepAudit: true None. Significant Economic Presence (SEP) Audit: Must comply with e-invoicing for cross-border transactions.
Q10: Payment Inflow [A] Cash Only None. None. Manual Ledger Tracking: Higher risk of physical audit inspections by local government.
[B] Digital Rails / POS automatedNrsFlag: true None. Real-Time Data Integration: NRS matches your bank/POS transaction velocity against filed returns.
Phase 5: Global Supply Chains & B2B Operations
Question / Input Channel Selected Option Internal State Variable Changes Unlocked Legal Deductions / Tax Holidays Added Filing Obligations & Hard Deadlines
Q11: International Clients [A] Local Only None. None. None.
[B] Global FX / Tools whtExempt: false None. Foreign Currency Withholding Compliance: Follow specialized guidelines for global asset tools.
Q12: Revenue Source [A] Local Market None. None. None.
[B] 100% Export Contract exportIncentives: true Export Expansion Waiver: 100% corporate tax exemption on foreign currency earnings. FX Repatriation Audits: Must prove all foreign currency was cleared through an official Nigerian bank.
Phase 6: B2B Transactions & Local Withholding
Question / Input Channel Selected Option Internal State Variable Changes Unlocked Legal Deductions / Tax Holidays Added Filing Obligations & Hard Deadlines
Q13: Corporate Client B2B [A] Direct B2C None. None. None.
[B] Yes (Deduct WHT) whtTrackingRequired: true WHT Tax Credit Notes: Turn client withholding receipts into direct cash credits to lower annual tax. WHT Credit Reconciliation: Match your credit notes inside your annual tax portal return profile.
Q14: Physical Location [A] Outside FTZ None. None. Standard tax codes apply.
[B] Inside Free Trade Zone isFtzExempt: true 100% Absolute Tax Exemption: Zero CIT, Zero VAT, Zero CGT, Zero Customs Duties. FTZ Zone Returns: File localized operational compliance reports per NEPZA / OGEFZA schedules.
Q15: Financial Records [A] Clean Audited Books presumptiveTaxRisk: false Defensive Audit Shield: Clean books prevent the tax office from guessing your tax. Standard system calendars apply.
[B] Bank Alerts Only presumptiveTaxActive: true None. 1% Presumptive Tax Penalty: If revenue crosses ₦12M, the state can levy a flat 1% tax on your gross bank deposits.
