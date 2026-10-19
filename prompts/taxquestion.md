# Tax Research Questions — Need Verification Before `taxplan.md` Finalisation

> **How to use this file:** For each question, find the answer from an authoritative source
> (the gazetted Nigeria Tax Act 2026 / Nigeria Tax Administration Act 2026 / 2026 Presumptive Tax
> Regulations, FIRS/NRS official guidance, or a Big-4 / reputable Nigerian tax-advisory summary).
> Fill in the **YOUR ANSWER** line with the confirmed figure/rule **plus a source link or citation**.
> Then I will bake the confirmed value into `taxplan.md`'s single `STATUTORY` constants block.
>
> Current status: **BLOCKING** — `taxplan.md` cannot be finalised until Q1–Q4 are answered.
> Q5–Q10 are non-blocking clarifications (plan ships a flagged default meanwhile).

---

## BLOCKING — these change computed numbers in the engine

### Q1 — Personal Income Tax (PIT) rate bands for individuals / sole proprietors

**Conflict:**
- `taxlaw.md` L44 says: *"Tax Rates: Any profit above ₦800,000 is taxed on a progressive scale
  starting from **7%** up to 25% for high earners."*
- `taxupdate.md` (original idea doc) assumes a **15% starting** band with a table like
  `15% / 18% / 21% / 23% / 25%` at breakpoints `₦800k / ₦3M / ₦12M / ₦25M / ₦50M`.

**Why it matters:** This drives the PIT branch of the quiz engine for sole proprietors /
registered business names (who are taxed under PIT, not CIT). Wrong bands = wrong on-screen
estimate shown to every SME owner.

**What I need from you:**
1. The **exact band table** from the Nigeria Tax Act 2026 (PIT schedule for individuals):
   lower bound → rate, for every band, in ₦.
2. Confirm the **tax-free threshold** is ₦800,000 (both docs agree on this — just double-check).
3. Confirm whether bands apply to **total annual income** or **profit above the threshold**.

**YOUR ANSWER:**
```
(band table here, e.g. ₦0 – ₦800,000 = 0%; ₦800,001 – ₦X = Y%; …)
Free threshold: ₦________
Source: ________________
```

---

### Q2 — Capital Gains Tax (CGT) rate on digital assets

**Conflict:**
- `taxupdate.md` assumes a **10%** rate specifically on **digital/crypto asset** disposals.
- `taxlaw.md` L9 says: *"Capital Gains Tax (CGT): Aligned progressively with corporate rules,
  up to **30%** for corporate asset disposals."* — no mention of a separate digital-asset rate.

**Why it matters:** The plan has a `disposalGain` field on the tax profile for asset sales.
If there is no special digital-asset rate, the field should just use the standard CGT rate.

**What I need from you:**
1. Is there a **separate CGT rate for digital/crypto assets** in the 2026 Act, or do they fall
   under the standard CGT rate?
2. What is the **standard CGT rate** for (a) individuals, (b) companies, in 2026?
3. Is CGT on the **gain only** (proceeds − cost basis), confirmed?

**YOUR ANSWER:**
```
Digital-asset CGT rate (if separate): ____%
Standard CGT — individuals: ____%
Standard CGT — companies: ____%
Computed on: (gain / proceeds / other)
Source: ________________
```

---

### Q3 — Withholding Tax (WHT) agent / vendor threshold

**Conflict:**
- `taxupdate.md` uses **₦25M** as the turnover threshold above which a business becomes a
  WHT agent (must deduct and remit WHT on vendor payments).
- `taxlaw.md` L173 says: *"Protect Your Revenue: … no deductions on transactions below
  **₦2 million** if your turnover is under **₦50 million**."* — this is a per-transaction
  exemption floor tied to a ₦50M turnover band, which is a different rule entirely.

**Why it matters:** Drives the `isWhftAgent` flag on the tax profile and the WHT-remittance
reminder cadence. Two different-looking rules need reconciling.

**What I need from you:**
1. The **per-transaction WHT de-minimis floor** (the amount below which no WHT is deducted),
   and whether it varies by turnover band.
2. The **turnover threshold** (if any) that makes a business a "WHT agent" required to deduct
   and remit — is it ₦25M, ₦50M, or something else?
3. The **standard WHT rates** on (a) goods/contracts, (b) services, (c) rent — if listed in
   the 2026 Act.

**YOUR ANSWER:**
```
Per-transaction WHT floor: ₦________ (applies when turnover < ₦______)
WHT-agent turnover threshold: ₦________
Standard WHT rates: goods ____% / services ____% / rent ____%
Source: ________________
```

---

### Q4 — VAT small-business exemption threshold

**Conflict:**
- `taxplan.md` (old draft) states the VAT exemption applies to businesses with turnover
  **≤ ₦100 million**.
- `taxlaw.md` L12 says: *"Small Business VAT: Businesses with turnover ≤ **₦50 million** /
  assets ≤ ₦250 million are exempt from charging VAT."*
- `taxlaw.md` L54 restates: *"small businesses with a annual turnover of ₦50 million or less
  are totally exempt from charging or collecting VAT."*

**Why it matters:** The old plan would have wrongly told a ₦80M-revenue LLC it was
VAT-exempt when it is not. This is one of the highest-impact errors in the draft.

**What I need from you:**
1. Confirm the VAT exemption turnover threshold is **₦50M** (not ₦100M), and the fixed-asset
   companion threshold (₦250M?).
2. Confirm whether "exempt" here means **cannot charge output VAT** (customer pays no VAT) vs.
   **exempt from remitting** but still charges — these are legally different.
3. Confirm the **standard VAT rate** is still **7.5%** in 2026 (both docs agree — sanity check).
4. Confirm the **zero-rated categories** (basic food, medical, education) — full list if available.

**YOUR ANSWER:**
```
VAT exemption turnover threshold: ₦________
VAT exemption asset threshold: ₦________
"Exempt" means: (cannot charge output VAT / other)
Standard VAT rate: ____%
Zero-rated categories: ________________
Source: ________________
```

---

## NON-BLOCKING — clarifications (plan ships a flagged default until answered)

### Q5 — Small-company 0% CIT exclusion list

`taxlaw.md` L108-109 lists **professional services** (consulting, law, bookkeeping/accounting,
engineering, medical) and **regulated/financial businesses** (fintech startups, money lenders,
investment boutiques) as barred from the 0% small-company rate.

**Question:** Is there an **official SIC/industry code list** from CAC or NRS that defines
"professional services" exhaustively? Does it include e.g. IT/tech studios, marketing agencies,
architecture, veterinary, education/training services?

**YOUR ANSWER:**
```
Full excluded-industry list (or "see CAC SIC codes ____"): ________________
Is a plain software/tech studio excluded? (yes/no + basis): ________________
Source: ________________
```

---

### Q6 — Presumptive / nano business regime thresholds

`taxlaw.md` L119-122: turnover **≤ ₦12 million** = nano, free annually-renewable exemption
certificate from the State Revenue Service; turnover **> ₦12M with no proper accounting books**
= flat **1% presumptive tax on gross turnover**.

**Question:** Confirm the ₦12M nano threshold and the 1% presumptive rate. Is the 1%
assessed by the **state** (SIRS) rather than the federal NRS? Does having "proper accounting
books" have a formal definition (e.g. audited statements, or any tracked ledger)?

**YOUR ANSWER:**
```
Nano threshold: ₦________
Presumptive rate: ____%
Assessed by: (state SIRS / federal NRS / other)
"Proper books" defined as: ________________
Source: ________________
```

---

### Q7 — Startup / agricultural tax-holiday duration

**Conflict:** `taxupdate.md` assumes **3 years + 2-year extension (3+2)** for qualifying
startups; `taxlaw.md` L98 says agricultural/agribusiness startups get a **structured 5-year
tax holiday**.

**Question:** Is the holiday **5 years flat**, or **3+2 (extendable)**? Does it apply to
**all** qualifying new companies, or **only** agricultural/agribusiness ones? What qualifies
as "newly incorporated" (age limit)?

**YOUR ANSWER:**
```
Holiday duration: ____ years (+ ____ extension if any)
Applies to: (all startups / agriculture only / other)
"Newly incorporated" age limit: ________________
Source: ________________
```

---

### Q8 — Multinational Minimum Tax (MNM) trigger

`taxlaw.md` L6: *"Enterprises with global turnover over **€750 million** or Nigerian revenue
≥ **₦50 billion** face a **15% effective minimum tax rate**."*

**Question:** Confirm both trigger thresholds (global €750M AND Nigerian ₦50bn — are they
alternative triggers or both required?) and the 15% rate. Is this the OECD-style Pillar Two
GloBE minimum tax?

**YOUR ANSWER:**
```
Global turnover trigger: €________
Nigerian revenue trigger: ₦________
Trigger logic: (either / both required)
Effective minimum rate: ____%
Source: ________________
```

---

### Q9 — Filing deadlines and penalty schedule

`taxlaw.md` L14: late-filing penalties escalate to **₦100,000 first month + ₦50,000/month
thereafter**. L62-73 table: PIT annual by **March 31**; CIT within **6 months** after
financial year end (nil returns mandatory); VAT **monthly by the 21st** (turnover > ₦50M);
PAYE **monthly by the 10th**.

**Question:** Confirm the penalty figures and whether they are **per return** or **per month
of delay**. Confirm each filing deadline. Are the VAT/PAYE deadlines the 21st and 10th
respectively, and is there a weekend/holiday rollover rule?

**YOUR ANSWER:**
```
Late-filing penalty: ₦________ first month + ₦________/month after (per return / per month)
PIT annual deadline: ________________
CIT annual deadline (nil returns included?): ________________
VAT monthly deadline: ________________
PAYE monthly deadline: ________________
Weekend/holiday rollover: (yes/no)
Source: ________________
```

---

### Q10 — Rent relief and the old Consolidated Relief Allowance (CRA)

`taxlaw.md` L45: *"The old 'Consolidated Relief Allowance' has been removed and replaced with
a targeted Rent Relief (deduction of **20% of your rent** or **₦500,000**, whichever is
lower)."*

**Question:** Confirm the rent-relief formula (20% of rent paid, capped at ₦500,000 — whichever
is lower) and that CRA is fully repealed. Does rent relief apply to **individuals/PIT only**,
or also to companies under CIT?

**YOUR ANSWER:**
```
Rent relief formula: ____% of rent paid, cap ₦________
CRA: (fully repealed / partially retained)
Applies to: (PIT only / CIT too / both)
Source: ________________
```

---

## How your answers get used

Once you fill in the **YOUR ANSWER** blocks, I will:

1. Create a single `STATUTORY` constants block at the top of the shared quiz engine file
   (`backend/src/shared/tax-quiz-engine.ts`), every constant annotated with its source citation.
2. Rebuild the Q4 turnover question in the quiz to use the confirmed 4-bracket structure
   (`UNDER_12M / 12M–50M / 50M–100M / ABOVE_100M`), matching whatever thresholds you confirm.
3. Update `taxplan.md`'s work items QUIZ-04, QUIZ-05, QUIZ-09, QUIZ-20, QUIZ-21, QUIZ-26 to
   reference the confirmed figures instead of the disputed ones.
4. Mark any answer you leave blank as **UNVERIFIED** in the plan with a clearly-labelled swap
   point, so it can be corrected later without touching surrounding logic.

**Please come back with source links/citations for each answer** — the plan will store them
alongside the constants so future audits can trace every number back to its legal basis.
