The 15-Question Million-Dollar Diagnostic Quiz
Phase 1: Legal Structure & Sector Constraints

1. What is the legal structure of your business?
   • [A] Unregistered / Individual Freelancer / Content Creator
   • Logic: isCorporate = false; taxAuthority = "SIRS";
   • [B] Registered Business Name (Sole Proprietorship / Partnership)
   • Logic: isCorporate = false; taxAuthority = "SIRS";
   • [C] Limited Liability Company (LLC) or PLC
   • Logic: isCorporate = true; taxAuthority = "NRS";
2. What specific niche or industry does your business operate in?
   • [A] Trading, Physical Commerce, E-commerce, Real Estate, Logistics, or Manufacturing
   • Logic: Keep default flags.
   • [B] Professional & Creative Services (Digital Marketing Agency, Tech Consulting, UI/UX Studio, Software House, Legal/Accounting, Medical)
   • Logic: isProfessionalService = true;
   • [C] Primary Agriculture, Farming, Agro-Processing, or Solid Minerals Development
   • Logic: exportIncentives = true; (Triggers check for multi-year Pioneer Status/EDTI holidays).
3. Is your tech startup or creative company officially registered and "Labeled" under the Nigeria Startup Act portal?
   • [A] No
   • Logic: No change.
   • [B] Yes, we hold an official Startup Label
   • Logic: isStartupActEligible = true; (Overrides standard service exclusions; unlocks accelerated 4-year tax holidays under EDTI).
   Phase 2: Financial Thresholds & Asset Scale
4. What is your estimated or actual Annual Turnover (Gross Inflow/Sales)?
   • [A] Under ₦12 Million (Nano / Petite Tier)
   • Logic: isVatExempt = true; isCitExempt = true; citRate = 0.00; devLevyRate = 0.00;
   • [B] Between ₦12 Million and ₦50 Million (Micro Tier)
   • Logic: isVatExempt = true; if (isCorporate && !isProfessionalService) { isCitExempt = true; citRate = 0.00; devLevyRate = 0.00; }
   • [C] Between ₦50 Million and ₦100 Million (Small/Medium Tier)
   • Logic: isVatExempt = false; if (isCorporate && !isProfessionalService) { isCitExempt = true; citRate = 0.00; devLevyRate = 0.00; }
   • [D] Above ₦100 Million (Large Corporate Tier)
   • Logic: isVatExempt = false; isCitExempt = false; citRate = 0.30; devLevyRate = 0.04; if (isProfessionalService || isCorporate) { hasNitdaObligation = true; }
5. What is the total valuation of your business's Fixed Assets (including machinery, studio gear, properties, and corporate vehicles)?
   • [A] ₦250 Million or Less
   • Logic: Keep default threshold calculations.
   • [B] More than ₦250 Million
   • Logic: isCitExempt = false; citRate = 0.30; devLevyRate = 0.04; (Asset size override: Forces large corporate categorization even if annual turnover was under ₦100M).
   Phase 3: Human Capital & Branch Architecture
6. Do you have employees or structured team members earning a regular salary above ₦800,000 annually (approx. ₦66,667+ per month)?
   • [A] No, I run it solo, with family, or strictly engage ad-hoc contractors
   • Logic: hasPayeObligation = false;
   • [B] Yes, we have salaried employees crossing this threshold
   • Logic: hasPayeObligation = true;
7. How is your team or branch network physically distributed?
   • [A] Single location / Single home office
   • Logic: isMultiStateRemittance = false;
   • [B] Multiple physical branch offices, or remote workers living in different States across Nigeria
   • Logic: if (hasPayeObligation) { isMultiStateRemittance = true; }
   Phase 4: Digital Assets & Modern Financial Transactions
8. Does your business trade, manage, create, or process Digital Assets (Cryptocurrencies, Web3 utility tokens, or Monetized NFTs)?
   • [A] No, we settle exclusively in fiat currency (Naira, USD, GBP, etc.)
   • Logic: No change.
   • [B] Yes, we actively process or hold virtual/digital assets
   • Logic: digitalAssetRules = true;
9. Do you operate an online platform, subscription-based SaaS, digital marketplace, or streaming service targeting users in Nigeria?
   • [A] No, we offer direct services or custom offline products
   • Logic: No change.
   • [B] Yes, we manage digital cloud infrastructure and automated platforms accessible globally and locally
   • Logic: sepAudit = true; (Triggers assessment under Significant Economic Presence rules for foreign and domestic cloud hosting).
10. How are customer payments primarily received into your business systems?
    • [A] Purely physical cash
    • Logic: Flag for physical record compliance.
    • [B] Via digital/fintech rails (POS Terminals, Moniepoint/OPay Business wallets, Corporate Bank accounts)
    • Logic: automatedNrsFlag = true; (Alerts user that transaction histories are automatically shared with the NRS network).
    Phase 5: Global Supply Chains & B2B Operations
11. Do you service international clients or pay foreign third-party infrastructure (like AWS servers, Google Workspace, or Meta Ads)?
    • [A] No, our clients and tools are 100% inside Nigeria
    • Logic: No change.
    • [B] Yes, we generate foreign FX revenue or heavily deploy foreign tech tools
    • Logic: whtExempt = false; (Requires specialized multi-currency withholding calculations).
12. Does your business generate its income by physically exporting goods or servicing 100% offshore tech markets?
    • [A] No
    • Logic: No change.
    • [B] Yes, 100% of our revenue comes from repatriated export/offshore contracts
    • Logic: exportIncentives = true;
    Phase 6: B2B Transactions & Local Withholding
13. Do you routinely execute B2B contracts where corporate clients deduct Withholding Tax (WHT) before paying your invoices?
    • [A] No, we sell direct-to-consumer (B2C)
    • Logic: No change.
    • [B] Yes, we deal heavily with corporate clients who issue WHT credit notes
    • Logic: whtTrackingRequired = true; (System must instruct them on how to offset WHT credits against annual liabilities).
14. Is your business or creative facility physically located inside a licensed Free Trade Zone (FTZ) (e.g., Lekki FTZ)?
    • [A] No
    • Logic: No change.
    • [B] Yes, we operate completely inside an approved Free Trade Zone
    • Logic: isFtzExempt = true; isCitExempt = true; isVatExempt = true;
15. Does your business maintain complete, audited financial statements and digital bookkeeping records?
    • [A] Yes, our accounts are clean and tracked via software
    • Logic: presumptiveTaxRisk = false;
    • [B] No, we do not keep structured books; we track only bank alerts
    • Logic: if (turnover > 12000000) { presumptiveTaxRisk = true; } (Triggers warning for the 1% presumptive tax penalty applied to undocumented high-velocity accounts).
