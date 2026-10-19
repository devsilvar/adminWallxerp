The most important corrections are:

The PIT bands are 0%, 15%, 18%, 21%, 23%, and 25%.

Digital-asset gains do not have a special 10% CGT rate.

The VAT small-business threshold is generally ₦25 million, not ₦50 million, under the enacted administration framework.

The small-company CIT threshold appears to be ₦50 million, although some secondary summaries and drafts incorrectly state ₦100 million.

The WHT ₦2 million rule is an exemption for qualifying small companies and vendors—not a general turnover threshold making a business a WHT agent.

Because your engine will calculate tax, I recommend treating any unresolved item below as UNVERIFIED until checked against the final gazetted text and applicable regulations.

Q1 — PIT rate bands
The enacted individual schedule is:

text
₦0 – ₦800,000                  = 0%
₦800,001 – ₦3,000,000          = 15%
₦3,000,001 – ₦12,000,000       = 18%
₦12,000,001 – ₦25,000,000      = 21%
₦25,000,001 – ₦50,000,000      = 23%
Above ₦50,000,000               = 25%
The tax-free threshold is ₦800,000.

The bands apply progressively to an individual’s chargeable income, not directly to gross turnover and not simply to “profit above ₦800,000.” For a sole proprietor, the relevant starting point is generally business income after allowable deductions, together with other taxable income and applicable reliefs or deductions. The NTA defines total income by reference to taxable income less permitted deductions. The former CRA has been replaced by the rent-relief regime.

text
Free threshold: ₦800,000
Source: NTA 2025, section 58 and Fourth Schedule; KPMG/PwC summaries.
Implementation note: Your table’s boundaries should preferably be represented as band widths rather than integer endpoints:

text
first ₦800,000: 0%
next ₦2,200,000: 15%
next ₦9,000,000: 18%
next ₦13,000,000: 21%
next ₦25,000,000: 23%
excess over ₦50,000,000: 25%
Q2 — Capital gains and digital assets
There is no separate 10% digital-asset CGT rate under the new regime. Digital and virtual assets are expressly brought within taxable income and chargeable gains. For individuals, the gain is generally taxed using the individual’s progressive rates, up to 25%. For companies, chargeable gains generally follow the applicable corporate rate, ordinarily 30%; a qualifying small company may receive the relevant exemption.

text
Digital-asset CGT rate: No separate rate
Standard CGT — individuals: Progressive PIT rates, 0%–25%
Standard CGT — companies: Generally 30%; qualifying small-company exemptions may apply
Computed on: Gain, generally proceeds less allowable cost and disposal expenses
Source: NTA 2025, sections 4, 33–58; NRS virtual-assets guidance; EY/KPMG summaries.
The NTA expressly includes profits or gains from digital or virtual-asset transactions within taxable income. The calculation is not ordinarily based on gross proceeds alone. It is based on the chargeable gain after the statutory computation, including allowable acquisition cost and qualifying disposal expenses.

The NRS virtual-assets guidance also refers to 1% WHT on gross disposal proceeds in applicable transactions. That is a withholding mechanism and should not be confused with the final income-tax rate on the gain.

Q3 — WHT threshold, agent obligation and rates
The ₦25 million figure should not be used as a general “WHT-agent turnover threshold.” Similarly, ₦50 million is not a general turnover threshold that automatically determines whether every business is a WHT agent.

The relevant small-company exemption is generally:

text
Transaction exemption: ₦2,000,000 or less
Additional condition: supplier/vendor must have a valid TIN
Business qualification: qualifying small company
The available guidance describes this as an exemption from deducting WHT where both conditions are satisfied. It is not a universal per-transaction exemption available to every business.

Indicative standard rates are:

Payment type	Resident rate	Non-resident rate
Goods/materials	2%	Often 5% or subject to the applicable category
General services	2%	5%
Consultancy, technical, management and professional fees	5%	10%
Rent, hire or lease	10%	10%
Your requested block should therefore not be populated with a single “WHT-agent turnover threshold” without qualification:

text
Per-transaction WHT floor: ₦2,000,000 or less, only for a qualifying small company and where the vendor has a valid TIN
Applies when turnover < ₦50M: Not established as a general rule
WHT-agent turnover threshold: No general ₦25M/₦50M threshold confirmed
Standard WHT rates: goods/materials 2% resident; general services 2% resident; rent 10%
Source: NTAA 2025 section 51 and Deduction of Tax at Source Regulations 2024; PwC/NRS summaries.
Engine recommendation: Replace isWhtAgent with a transaction-level rule. The payer’s obligation depends on the payer type, payment category, vendor status, TIN, and whether the small-company exemption applies. A simple turnover-only boolean is legally unsafe.

Q4 — VAT small-business exemption
The enacted material and current summaries support a ₦25 million annual turnover threshold, not ₦50 million or ₦100 million, for the small-business VAT exemption/registration treatment.

The relevant rule is not the same as the small-company CIT definition. Do not reuse the CIT threshold for VAT.

text
VAT exemption/registration threshold: ₦25,000,000 annual turnover
VAT exemption asset threshold: No ₦250,000,000 asset test identified for the VAT exemption
"Exempt" means: the qualifying small business is not required to charge VAT or file ordinary VAT returns, unless it opts into VAT
Standard VAT rate: 7.5%
Zero-rated categories: specified essential goods and services, including basic food items, medical and pharmaceutical products, educational books and materials, tuition/education-related supplies, medical equipment and services, electricity generation/transmission and qualifying exports
Source: NTA 2025 sections 144–188; NTAA 2025 section 22; PwC/NRS summaries.
The NTAA states that the VAT-return obligation does not apply to a small business, and that a small business may opt out of the exemption by written notice, including registration, charging VAT and filing returns.

That wording supports the interpretation that a qualifying small business generally does not charge output VAT; it is not merely a business that charges VAT but is excused from remitting it.

The standard VAT rate remains 7.5%. The exact zero-rated list should be copied directly from section 187 and any current NRS regulations before putting it into a production constants block. The broad categories reported by PwC include basic food, medical and pharmaceutical products, educational books and materials, medical equipment and services, tuition and certain electricity and export supplies.

Q5 — Small-company CIT exclusion list
The NTA excludes professional services from the small-company treatment, but I did not find an authoritative exhaustive CAC/NRS SIC-code schedule defining every excluded activity.

text
Full excluded-industry list: No exhaustive statutory SIC list confirmed; “professional services” must be interpreted from the Act and applicable guidance
Is a plain software/tech studio excluded?: Not automatically; a software-development studio should not be treated as excluded merely because it is a technology business, unless its actual activity falls within a specified professional or regulated category
Source: NTA 2025 section 56 and official/Big-Four summaries.
A plain software or application-development studio should be distinguished from regulated fintech, banking, lending, insurance, investment management, accounting, legal, medical or similar professional activities. The NTA itself defines technology-driven services broadly in another context, including computer software or application development, which supports caution against automatically classifying all technology businesses as professional services.

Recommended default: professional_services_exclusion = REVIEW_REQUIRED, with an activity-code/manual review rather than a blanket rule.

Q6 — Presumptive or nano-business regime
The claimed rule of “₦12 million nano threshold plus automatic 1% presumptive tax” is not adequately supported by the enacted NTA text I located.

The NTA contains a presumptive-tax provision, but the detailed thresholds and methodology are to be prescribed. EY’s summary likewise describes presumptive taxation as a framework for informal-sector earners without reliable records, to be prescribed by the Minister.

text
Nano threshold: UNVERIFIED
Presumptive rate: UNVERIFIED; do not hard-code 1%
Assessed by: Relevant tax authority under the applicable prescribed framework; not safely classified as universally state-only
"Proper books" defined as: No confirmed statutory definition located in the sources reviewed
Source: NTA 2025 section 29 and any applicable Ministerial/Presumptive Tax Regulations.
Do not hard-code:

ts
nanoThreshold = 12_000_000;
presumptiveRate = 0.01;
unless you have the actual 2026 Presumptive Tax Regulations or a formal NRS/SIRS publication that confirms those values.

Q7 — Startup and agricultural tax holiday
The available enacted-law summaries support a five-year exemption for qualifying agricultural businesses, rather than a universally applicable 3+2 startup holiday.

text
Holiday duration: 5 years
Extension: No general 2-year extension confirmed
Applies to: Qualifying agricultural/agri-business income, not automatically to every startup
"Newly incorporated" age limit: No general startup age limit confirmed for the claimed 3+2 rule
Source: NTA 2025 exemption provisions; EY summary.
The Nigeria Startup Act’s “startup label” and the NTA’s agricultural exemption should not be conflated. A technology startup is not automatically entitled to the agricultural five-year exemption.

Q8 — Minimum effective tax / multinational trigger
The ₦50 billion Nigerian-revenue trigger in your draft does not match the better-supported enacted summary. The available EY summary states that the 15% minimum effective tax applies to:

a constituent entity of a multinational enterprise group; and

another company with aggregate turnover of at least ₦20 billion.

The OECD Pillar Two global threshold is generally €750 million of consolidated group revenue. The Nigerian ₦20 billion rule is a separate domestic high-turnover trigger in the enacted Nigerian framework.

text
Global turnover trigger: €750,000,000 for the OECD/Pillar Two-style MNE framework
Nigerian revenue trigger: ₦20,000,000,000 under the reported domestic high-turnover rule
Trigger logic: Alternative categories; not both required
Effective minimum rate: 15%
Source: NTA 2025 section 57; EY/KPMG summaries; OECD Pillar Two framework.
Use either, not both required, but keep the MNE and domestic-high-turnover tests as separate predicates.

Q9 — Filing deadlines and penalties
The filing deadlines are substantially as follows:

text
PIT annual deadline: 31 March, according to NRS guidance
CIT annual deadline: Within 6 months after the accounting year-end; for a newly incorporated company, earlier of 18 months from incorporation or 6 months after the first accounting period
CIT nil returns: Yes; every company must file annually whether or not tax is payable
VAT monthly deadline: 21st day of the following month
PAYE monthly deadline: 10th day of the following month
WHT remittance: 21st day of the following month
The ₦100,000 plus ₦50,000 monthly penalty is reported for ordinary late filing in current tax-administration summaries:

text
Late-filing penalty: ₦100,000 for the first month + ₦50,000 for each subsequent month
Application: Generally per return, accruing by month of continuing default
Weekend/holiday rollover: Do not hard-code without an explicit NRS rule; verify the filing portal’s treatment for the relevant deadline
Source: NTAA 2025 sections 11, 13, 22 and 101; NRS filing calendar; PwC tax-administration summary.
The official NRS calendar confirms:

PIT annual filing by 31 March.

VAT filing and payment by the 21st.

PAYE remittance by the 10th.

WHT remittance by the 21st.

However, the NTAA contains special and much higher petroleum-operation penalties, including ₦10 million on the first day and ₦2 million per subsequent day for certain petroleum returns. Those figures should not be used for ordinary SME tax returns.

There is also a distinction between:

late filing;

late payment;

failure to deduct WHT;

failure to remit deducted WHT; and

failure to file petroleum returns.

Your engine should model those separately.

Q10 — Rent relief and CRA
The rent-relief formula is:

text
Rent relief formula: 20% of annual rent paid, capped at ₦500,000
CRA: Fully repealed/replaced under the new individual-tax framework
Applies to: Individuals/PIT only, not companies under CIT
Source: NTA 2025 section 30; 2026 PIT Guidelines; KPMG summary.
The 2026 PIT Guidelines confirm that the relief is based on actual rent paid, subject to the ₦500,000 maximum, and requires prescribed supporting information. The relief is available for the relevant year in which the rent is paid and may be apportioned for multi-year rental payments.

Recommended taxplan.md status
I would not finalise the constants block exactly as currently proposed. Use the following statuses:

Question	Recommended status
Q1 PIT	Confirmed: 0%–25%, ₦800,000 threshold
Q2 digital-asset CGT	Confirmed: no special 10%; individuals progressive, companies generally 30%
Q3 WHT	Partly confirmed; replace turnover-agent boolean with transaction-level logic
Q4 VAT	Correct threshold to ₦25 million unless a later binding regulation changes it
Q5 professional-services exclusions	UNVERIFIED / REVIEW_REQUIRED
Q6 presumptive tax	UNVERIFIED; do not hard-code ₦12 million or 1%
Q7 startup holiday	Agriculture-specific five-year rule supported; general 3+2 not confirmed
Q8 minimum effective tax	Use 15%; domestic threshold reported as ₦20 billion, not ₦50 billion
Q9 filing and penalties	Deadlines confirmed; ordinary penalty generally ₦100,000 + ₦50,000 monthly
Q10 rent relief	Confirmed: lower of 20% of rent and ₦500,000; PIT only
The strongest primary sources reviewed were the Nigeria Tax Act gazette, Nigeria Tax