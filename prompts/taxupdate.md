Part 1: The Simplified 15-Question Quiz
Phase 1: Business Identity & Legal Form
How is your business registered?
[A] Not registered / Personal name / Freelancer
[B] Registered Business Name (Enterprise)
[C] Limited Liability Company (LTD / LLC)
Does your business provide professional or expert services? (e.g., Consulting, Legal, Tech/Software Studio, Accounting, Medical Clinic, Advertising)
[A] No (We sell goods, produce food, retail, manufacture, etc.)
[B] Yes (We sell specialized advice, services, or technical skills)
Does your business have an official "Startup Label" under the Nigeria Startup Act?
[A] No
[B] Yes
Phase 2: Size & Earnings
How much total money does your business make in a year (gross sales/revenue)?
[A] Under ₦25 Million
[B] Between ₦25 Million and ₦50 Million
[C] Above ₦50 Million
Is the total value of your business equipment, machines, vehicles, and buildings worth more than ₦250 Million?
[A] No
[B] Yes
Phase 3: Staff & Locations
Do you pay any staff or workers a salary above ₦800,000 per year (roughly ₦66,700 per month)?
[A] No (All staff earn less than this, or I have no staff)
[B] Yes (At least one worker earns above this amount)
Do you have workers, shops, or offices in more than one Nigerian state?
[A] No (Only one state)
[B] Yes (Two or more states)
Phase 4: Digital Currency & Online Systems
Does your business buy, sell, or receive Crypto, Web3 tokens, or NFTs?
[A] No
[B] Yes
Do you run an online platform, mobile app, or subscription software where customers pay online?
[A] No
[B] Yes
How do you collect money from most of your customers?
[A] Cash
[B] Bank transfers, POS terminals, and Online Checkout
Phase 5: Foreign Tools & Cross-Border Work
Do you pay for foreign digital services like AWS, Google Workspace, Zoom, or Meta/Google Ads?
[A] No
[B] Yes
Does 100% of your money come from foreign clients outside Nigeria (e.g., export of goods or offshore tech gigs)?
[A] No
[B] Yes
Phase 6: Client Deductions & Tax Zones
Do your corporate clients deduct tax (Withholding Tax / WHT) from your invoices before paying you?
[A] No (We get paid our full invoice amount)
[B] Yes (Clients deduct 2% to 10% before sending our balance)
Is your business physically located inside a recognized Free Trade Zone (e.g., Lekki FTZ)?
[A] No
[B] Yes
Do you currently keep formal accounting books or track your records with software?
[A] Yes
[B] No






Engineering Blueprint: Answer Deductions, Alerts & Configuration EngineUnder the consolidated Nigeria Tax Act and the gazetted Withholding Tax Regulations, Nigerian tax architecture is governed by strict statutory boundaries:The Small Business Triple-Lock (Section 56 & 202 NTA): Turnover $\le$ ₦50M AND Fixed Assets $\le$ ₦250M AND Non-Professional Services.   Withholding Tax (WHT) Agent vs. Exemption Dual-Thresholds: Small businesses under ₦25M turnover are exempt from deducting WHT, while transactions under ₦2M per supplier with a valid Tax Identification Number (TIN) receive withholding relief.Consolidated Development Levy (Section 59 NTA): 4% single assessable profit levy replacing TETFund, NITDA, and NASENI; qualifying small companies are 100% exempt.Personal Income Tax (PIT) Base Exemption: The first ₦800,000 annual taxable band is taxed at 0%.   Below is the complete, rigorous logic mapping for your app's diagnosis engine.Question 1: Business Legal Structure                  ┌─ [A] Unregistered / Freelancer ──► PIT (State IRS) | Direct Assessment
                  │
[Q1 Registration] ┼─ [B] Registered Business Name ────► PIT (State IRS) | Pass-Through Entity
                  │
                  └─ [C] Limited Liability (LLC) ────► CIT (Federal NRS) | Formal Corporation
Option [A] Not Registered / Freelancer / Sole OperatorTax Legal Deduction: The entity lacks corporate legal personality. Governed strictly under the Personal Income Tax (PIT) provisions of the Nigeria Tax Act administered by the relevant State Internal Revenue Service (State IRS). The business cannot be assessed for Corporate Income Tax (CIT).In-App Alert Message:"You are categorized as an Individual Enterprise. You do not pay Federal Corporate Income Tax. Your taxes are assessed under Personal Income Tax by your State Internal Revenue Service (e.g., LIRS, FCT-IRS, OGSIRS)."App Configuration Flags:tax_entity_class = "INDIVIDUAL_ENTERPRISE"primary_tax_authority = "STATE_IRS"modules.corporate_income_tax = falsemodules.development_levy = falsemodules.direct_assessment_pit = trueOption [B] Registered Business Name (Enterprise / Sole Proprietorship)Tax Legal Deduction: A registered business name under Part B of CAMA is a pass-through entity for tax purposes. Profits flow directly to the proprietor/partners and are taxed under the Personal Income Tax graduated rates by the State IRS where the proprietor resides.In-App Alert Message:"Registered Business Names are pass-through entities in Nigeria. Business profits are taxed as personal income through your State IRS. Your CAC registration status requires annual returns, but corporate federal profit taxes do not apply."App Configuration Flags:tax_entity_class = "BUSINESS_NAME_PARTNERSHIP"primary_tax_authority = "STATE_IRS"modules.corporate_income_tax = falsemodules.development_levy = falsemodules.direct_assessment_pit = trueOption [C] Limited Liability Company (LTD / LLC)Tax Legal Deduction: A distinct artificial legal person under Part A of CAMA. Governed by Federal Corporate Income Tax (CIT) laws and assessed by the Nigeria Revenue Service (NRS / federal tax authority).In-App Alert Message:"Your company is an incorporated corporate body. Your primary corporate tax regulator is the Nigeria Revenue Service (NRS at the federal level). You are subject to Corporate Income Tax and the new Development Levy unless statutory exemptions apply."   App Configuration Flags:tax_entity_class = "CORPORATE_LTD"primary_tax_authority = "NRS_FEDERAL"modules.corporate_income_tax = truemodules.development_levy = truecompliance.requires_nrs_tin = trueQuestion 2: Nature of Activities (Professional Services)Option [A] No (Retail, Trade, Manufacturing, Agriculture, Hospitality)Tax Legal Deduction: Qualifies for general small business reliefs without statutory sector exclusions.In-App Alert Message:"Activity Validated: Non-professional businesses are eligible for the 0% Small Business CIT rate, provided your turnover and asset value remain within statutory caps."   App Configuration Flags:flags.is_professional_service = falserules.small_business_cit_disqualified = falseOption [B] Yes (Consulting, Tech Studios, Legal, Medical, Advertising, Accounting)Tax Legal Deduction: Statutory Carve-Out (Section 202 NTA): The definition of a "Small Company" explicitly states that "any business providing professional services shall not qualify as a small company." Consequently, a professional service LLC cannot access the 0% CIT rate regardless of whether its turnover is below ₦50M.   In-App Alert Message:"Special Tax Rule: Under the Nigeria Tax Act, businesses rendering professional, technical, or specialized advisory services are explicitly disqualified from the 0% Small Business CIT rate, even if annual sales are under ₦50M. Standard corporate tax rules apply."   App Configuration Flags:flags.is_professional_service = truerules.small_business_cit_disqualified = trueengine.override_zero_cit_eligibility = trueQuestion 3: Nigeria Startup Act (NSA) LabelOption [A] NoTax Legal Deduction: Standard fiscal regime applies.In-App Alert Message:"Standard tax rules will apply to your operational assessments."App Configuration Flags:flags.has_startup_label = falseexemptions.pioneer_tax_holiday = falseOption [B] Yes (Certified Labelled Startup)Tax Legal Deduction: Qualifies for Section 24-27 incentives of the Nigeria Startup Act, including a 3-year Pioneer Status Incentive (PSI) tax holiday (extendable for 2 additional years) from CIT, and full deduction of qualifying R&D expenses.In-App Alert Message:"Startup Incentive Active: As a labelled startup under the Nigeria Startup Act, you are entitled to apply for the Pioneer Status tax holiday (up to 4–5 years 0% CIT) and special exemptions on angel investor capital gains."App Configuration Flags:flags.has_startup_label = trueexemptions.pioneer_tax_holiday = truerules.cit_rate_override = 0.00modules.rd_tax_relief_calculator = trueQuestion 4: Gross Annual Turnover Bracket                          ┌─ [A] < ₦25M ────────► 0% CIT* | Exempt from WHT Deduction | No VAT Mandate
                          │
[Q4 Turnover Thresholds] ┼─ [B] ₦25M - ₦50M ────► 0% CIT* | Active WHT Agent | Mandatory VAT
                          │
                          └─ [C] > ₦50M ────────► Standard CIT (30%) + 4% Dev Levy | Full Compliance
*Subject to Question 2 & Question 5 exclusionsOption [A] Under ₦25 Million (Micro Enterprise)Tax Legal Deduction:Falls within the Small Company CIT rate ceiling (Section 56).   Fully exempt from obligations to act as a Withholding Tax (WHT) deduction agent under the WHT Regulations.   Exempt from mandatory VAT registration and charging thresholds.In-App Alert Message:"Micro-Tier Cleared: Your turnover is under ₦25 Million. You enjoy 0% Corporate Income Tax (if not professional services), are exempt from collecting VAT, and are legally excused from deducting WHT on vendor payments."App Configuration Flags:turnover_tier = "MICRO_SUB_25M"rules.cit_rate = (flags.is_professional_service ? 0.30 : 0.00)rules.development_levy_exempt = !flags.is_professional_servicecompliance.wht_deduction_agent = falsecompliance.mandatory_vat_collector = falseOption [B] Between ₦25 Million and ₦50 Million (Small Tier)Tax Legal Deduction:Maintains the 0% CIT small business ceiling ($\le$ ₦50M).   Crosses the ₦25M threshold, making the business an active WHT deduction agent.Requires mandatory VAT compliance and e-invoicing filing.In-App Alert Message:"Small Business Tier: Your CIT remains at 0% (if not a professional service), but crossing ₦25M requires you to collect and remit 7.5% VAT monthly and deduct Withholding Tax when paying qualifying suppliers."   App Configuration Flags:turnover_tier = "SMALL_25M_TO_50M"rules.cit_rate = (flags.is_professional_service ? 0.30 : 0.00)compliance.wht_deduction_agent = truecompliance.mandatory_vat_collector = trueOption [C] Above ₦50 Million (Medium / Large Enterprise)Tax Legal Deduction: Exceeds small company classification. Subject to standard Corporate Income Tax (30%) and the 4% Consolidated Development Levy on assessable profits. Full VAT and WHT compliance required.   In-App Alert Message:"Corporate Tier: Operating above ₦50M turnover subjects you to standard Corporate Income Tax plus the 4% Development Levy on assessable profits. You must file VAT by the 21st and WHT by the 21st of each month."   App Configuration Flags:turnover_tier = "LARGE_ABOVE_50M"rules.cit_rate = 0.30rules.development_levy_rate = 0.04compliance.wht_deduction_agent = truecompliance.mandatory_vat_collector = trueQuestion 5: Fixed Asset Value Exceeding ₦250 MillionOption [A] No ($\le$ ₦250M)Tax Legal Deduction: Meets the second leg of Section 202 NTA asset test.In-App Alert Message:"Asset Ceiling Cleared: Your fixed assets are within the ₦250M limit. Your small business status is preserved."App Configuration Flags:flags.assets_exceed_250m = falseOption [B] Yes (> ₦250M)Tax Legal Deduction: Statutory Asset Disqualification (Section 202 NTA): Even if turnover is under ₦50M, fixed assets (excluding land) exceeding ₦250M instantly revoke small company status, triggering standard corporate tax rates.In-App Alert Message:"Asset Over-Cap: Holding fixed assets above ₦250 Million disqualifies you from the small business 0% CIT status regardless of this year's sales. Standard corporate rates and the 4% Development Levy will apply."   App Configuration Flags:flags.assets_exceed_250m = truerules.cit_rate = 0.30rules.development_levy_exempt = falseQuestion 6: Payroll Earning Above ₦800,000 / Year (~₦66,667 / Month)Option [A] No (All Staff Earn $\le$ ₦800,000 / Year)Tax Legal Deduction: Under the personal tax schedule of the Nigeria Tax Act, the initial taxable band of ₦800,000 is taxed at 0%. No employee generates a PAYE liability.   In-App Alert Message:"Zero PAYE Payroll: Under the revised ₦800,000 statutory tax-free personal income threshold, none of your employees owe monthly PAYE tax. You have zero monthly salary tax remittance obligations."App Configuration Flags:payroll.paye_liability_active = falsepayroll.auto_deduct_paye = falsereminders.schedule_monthly_paye = falseOption [B] Yes (Staff Earning Above ₦800,000 / Year)Tax Legal Deduction: Mandatory employer withholding under PAYE. Income earned between ₦800,001 and ₦3,200,000 is taxed at graduated rates starting at 15%, stepping up to 25% for top brackets. Monthly remittance must occur by the 10th of the subsequent month.   In-App Alert Message:"Active PAYE Employer: You must deduct and remit monthly PAYE tax for employees earning over ₦800k/year. Taxes must be calculated using the graduated tax tables and paid to the State IRS by the 10th of every month."App Configuration Flags:payroll.paye_liability_active = truepayroll.auto_deduct_paye = truepayroll.tax_tables = "NTA_GRADUATED_2026"reminders.schedule_monthly_paye = truereminders.paye_due_day = 10Question 7: Multi-State Presence / WorkforceOption [A] No (Single State)Tax Legal Deduction: Standard single-jurisdiction administration.In-App Alert Message:"Single Filing Setup: All employee and personal tax obligations route exclusively to your primary State IRS."App Configuration Flags:compliance.multi_state_paye = falseui.show_multi_state_payroll_splitter = falseOption [B] Yes (Multiple States)Tax Legal Deduction: Principal Place of Residence Rule: Employers must remit PAYE to the internal revenue service of the state where the employee resides, not where the corporate headquarters or factory is registered.In-App Alert Message:"Multi-State Compliance Required: Nigerian law requires you to remit each employee's PAYE to their State of Residence. If an employee lives in Ogun State but works in your Lagos office, their tax belongs to OGIRS, not LIRS."App Configuration Flags:compliance.multi_state_paye = trueui.show_multi_state_payroll_splitter = truevalidation.enforce_employee_residence_state = trueQuestion 8: Crypto, Digital Assets & Web3 TokensOption [A] NoTax Legal Deduction: Neutral. No digital asset gains compliance required.App Configuration Flags:modules.crypto_cgt_tracker = falseOption [B] YesTax Legal Deduction: Section 3(a) of the Capital Gains Tax provisions classifies digital assets (cryptocurrencies, stablecoins, tokenized assets) as chargeable assets. Gains upon disposal/swap are subject to 10% Capital Gains Tax (CGT).In-App Alert Message:"Digital Asset Regime: Net gains from trading, swapping, or staking cryptocurrencies and tokens are subject to 10% Capital Gains Tax. Keep comprehensive historical records of cost bases and transaction hashes."App Configuration Flags:modules.crypto_cgt_tracker = truerules.cgt_digital_asset_rate = 0.10ui.enable_token_disposition_ledger = trueQuestion 9: Digital Platform / SaaS OperationsOption [A] NoApp Configuration Flags:compliance.digital_services_scheme = falseOption [B] YesTax Legal Deduction: Mandatory automated transaction logging. Under the Digital Economy rules, platform operators must account for 7.5% VAT on automated digital checkout lines and provide transparent API logs for revenue audits.In-App Alert Message:"Digital Commerce Rules: As a SaaS or marketplace provider, your digital checkout flows must clearly display and collect 7.5% VAT unless your end-customer provides an explicit business exemption certificate."App Configuration Flags:compliance.digital_services_scheme = truecheckout.apply_vat_rate = 0.075audit.enable_electronic_sales_logging = trueQuestion 10: Cash vs. Digital Inflow DominanceOption [A] Cash-HeavyTax Legal Deduction: Triggers elevated audit-risk flags under Section 43 Tax Administration rules. Cash transactions over statutory thresholds are subject to strict substantiation tests; undocumented cash disbursements risk being disallowed as deductible expenses.In-App Alert Message:"Audit Warning (Cash-Dominant): Nigerian tax inspectors closely audit cash-based businesses. You must maintain serialized physical receipt books and immediate daily petty cash expense vouchers to protect your expense deductions."App Configuration Flags:audit.risk_profile = "ELEVATED_CASH_SCRUTINY"tools.enable_receipt_generator = truetools.force_expense_receipt_uploads = trueOption [B] Digital (Bank, POS, Wallets)Tax Legal Deduction: Provides a clean electronic audit trail reconciling directly with automated banking settlement feeds.In-App Alert Message:"Automated Audit Trail: Your digital inflows make record-keeping easy. You can directly connect your bank and POS feeds for automated tax reconciliation."App Configuration Flags:audit.risk_profile = "STANDARD_LOW"tools.enable_bank_feed_sync = trueQuestion 11: Foreign Digital Subscriptions (AWS, Google, Meta Ads)Option [A] NoApp Configuration Flags:compliance.reverse_charge_vat = falseOption [B] YesTax Legal Deduction: Reverse Charge VAT Rule: When a Nigerian business consumes imported digital services from non-resident providers that do not charge local VAT on invoice, the local business must self-account for and remit 7.5% reverse-charge VAT. Payments are deductible operational costs.In-App Alert Message:"Imported Digital Services: Foreign tools like AWS or Google Workspace are tax-deductible expenses. However, if the vendor's invoice does not include Nigerian VAT, your business must self-account for 7.5% Reverse Charge VAT."App Configuration Flags:compliance.reverse_charge_vat = trueaccounting.expense_tag_imported_services = trueQuestion 12: 100% Export / Foreign Offshore EarningsOption [A] NoApp Configuration Flags:exemptions.export_proceeds_relief = falseOption [B] YesTax Legal Deduction: Export of non-oil goods and qualifying remote tech/software services repatriated through Central Bank of Nigeria (CBN) authorized dealer channels are 0% Zero-Rated for VAT. May also qualify for tax-exempt profits under approved export incentive schemes.In-App Alert Message:"Export Relief Active: 100% offshore earnings repatriated via official banking channels qualify for 0% Zero-Rated VAT and statutory export profit deductions. Ensure you preserve your inward SWIFT / Form NXP certificates."App Configuration Flags:exemptions.export_proceeds_relief = truerules.vat_output_rate = 0.00compliance.require_foreign_inward_repatriation_docs = trueQuestion 13: Clients Deducting Withholding Tax (WHT)Option [A] NoApp Configuration Flags:modules.wht_credit_vault = falseOption [B] YesTax Legal Deduction: Deductions by B2B clients represent advance payments of tax. Under the WHT Regulations, businesses can offset these deductions against final income tax liabilities if supported by a valid electronic Withholding Tax Credit Note.In-App Alert Message:"WHT Credit Note Vault Enabled: Don't lose money to deductions! Every client deduction is an advance payment of your tax. Demand your electronic WHT Credit Notes from clients—our vault will use them to offset your tax bill."App Configuration Flags:modules.wht_credit_vault = trueaccounting.track_inbound_withheld_tax = trueQuestion 14: Physical Location in a Free Trade Zone (FTZ)Option [A] NoApp Configuration Flags:exemptions.ftz_status = falseOption [B] Yes (e.g., NEPZA / OGFZA / Lekki FTZ)Tax Legal Deduction: Under Section 8 of the NEPZA Act and aligned tax statutes, licensed enterprises operating within approved Free Trade Zones are 100% exempt from all federal, state, and local taxes, CIT, VAT, and WHT, provided operations remain strictly export/zone-bounded.In-App Alert Message:"FTZ Complete Exemption: Operating in an approved Free Trade Zone excuses your enterprise from federal and state income taxes, VAT, and local levies. Warning: Any sales released into the domestic Nigerian customs territory require standard duties and VAT."App Configuration Flags:exemptions.ftz_status = truerules.cit_rate = 0.00rules.development_levy_exempt = truecompliance.mandatory_vat_collector = falsecompliance.wht_deduction_agent = falseQuestion 15: Accounting & Record-Keeping MaturityOption [A] Yes (Keeps Formal Software Records)Tax Legal Deduction: Meets Section 32 record-keeping criteria for full double-entry tax reconciliation.In-App Alert Message:"Fast-Track Integration: Your existing bookkeeping system can sync directly. We will import your Chart of Accounts and automate your compliance reports."App Configuration Flags:ui.onboarding_flow = "POWER_USER_INTEGRATION"modules.double_entry_ledger = trueOption [B] No (Informal / Spreadsheet / None)Tax Legal Deduction: Failure to maintain verifiable books empowers tax authorities to apply arbitrary "Best of Judgement" (BOJ) assessments under Section 41, often causing punitive tax bills.In-App Alert Message:"Protection Mode: Operating without books leaves you exposed to arbitrary 'Best of Judgement' tax bills from tax inspectors. We have activated our simplified 1-click Cashbook to safely log daily income and expenses."App Configuration Flags:ui.onboarding_flow = "SIMPLIFIED_CASHBOOK_SETUP"modules.simplified_cashbook = truealerts.boj_audit_risk_notice = trueThe Consolidated Logic Engine (evaluateTaxConfig)Below is the definitive pure function rule engine that converts the 15 quiz answers into the complete app settings:TypeScriptexport interface QuizResponses {
  q01_business_structure: "UNREGISTERED" | "BUSINESS_NAME" | "LLC";
  q02_is_professional_service: boolean;
  q03_startup_act_label: boolean;
  q04_annual_turnover_bracket: "UNDER_25M" | "25M_TO_50M" | "OVER_50M";
  q05_assets_over_250m: boolean;
  q06_staff_salary_above_800k: boolean;
  q07_multi_state_presence: boolean;
  q08_handles_crypto_web3: boolean;
  q09_operates_digital_platform: boolean;
  q10_primary_payment_method: "CASH" | "DIGITAL";
  q11_foreign_software_expenses: boolean;
  q12_pure_export_or_offshore: boolean;
  q13_clients_deduct_wht: boolean;
  q14_located_in_ftz: boolean;
  q15_has_accounting_records: boolean;
}

export function evaluateTaxConfig(answers: QuizResponses) {
  // 1. Entity Classification
  const isCorporate = answers.q01_business_structure === "LLC";
  const primaryTaxAuthority = isCorporate ? "NRS_FEDERAL" : "STATE_IRS";

  // 2. Small Business Triple-Lock Test (Section 56 & 202 NTA)
  const isTurnoverUnder50M = answers.q04_annual_turnover_bracket !== "OVER_50M";
  const isAssetUnder250M = !answers.q05_assets_over_250m;
  const isNonProfessional = !answers.q02_is_professional_service;
  
  const qualifiesForSmallBusinessRelief = 
    isCorporate && 
    isTurnoverUnder50M && 
    isAssetUnder250M && 
    isNonProfessional;

  // 3. Tax Rates & Exemptions
  let citRate = 0.30;
  let devLevyRate = 0.04;
  let vatOutputRate = 0.075;

  if (answers.q14_located_in_ftz) {
    citRate = 0.0;
    devLevyRate = 0.0;
    vatOutputRate = 0.0;
  } else if (answers.q03_startup_act_label) {
    citRate = 0.0;
    devLevyRate = 0.0;
  } else if (qualifiesForSmallBusinessRelief) {
    citRate = 0.0;
    devLevyRate = 0.0;
  }

  if (answers.q12_pure_export_or_offshore) {
    vatOutputRate = 0.0; // Zero-rated export
  }

  // 4. Compliance & Withholding Agent Status
  const isWhtAgent = !answers.q14_located_in_ftz && 
    answers.q04_annual_turnover_bracket !== "UNDER_25M";

  const isMandatoryVatCollector = !answers.q14_located_in_ftz && 
    answers.q04_annual_turnover_bracket !== "UNDER_25M";

  return {
    entity: {
      isCorporate,
      primaryAuthority: primaryTaxAuthority,
      tinRequired: isCorporate
    },
    rates: {
      corporateIncomeTax: isCorporate ? citRate : 0.0,
      developmentLevy: isCorporate ? devLevyRate : 0.0,
      vatRate: vatOutputRate,
      cgtDigitalAssetRate: answers.q08_handles_crypto_web3 ? 0.10 : 0.0
    },
    payroll: {
      enablePayeModule: answers.q06_staff_salary_above_800k,
      multiStateFiling: answers.q07_multi_state_presence,
      taxFreeThresholdAnnual: 800000
    },
    withholdingTax: {
      isDeductionAgent: isWhtAgent,
      enableCreditNoteVault: answers.q13_clients_deduct_wht
    },
    vat: {
      mandatoryRegistration: isMandatoryVatCollector,
      reverseChargeApplicable: answers.q11_foreign_software_expenses,
      digitalCheckoutVat: answers.q09_operates_digital_platform
    },
    operations: {
      auditRisk: answers.q10_primary_payment_method === "CASH" ? "HIGH" : "NORMAL",
      onboardingFlow: answers.q15_has_accounting_records 
        ? "POWER_USER_INTEGRATION" 
        : "SIMPLIFIED_CASHBOOK_SETUP"
    }
  };
}