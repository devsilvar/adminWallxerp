import {
  Shield,
  CreditCard,
  Clock,
  TrendingUp,
  Receipt,
  Wallet,
  BarChart3,
  Zap,
  FileText,
  Bell,
  ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/* ─── Testimonials ─── */
export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  avatar: string;
  color: string;
  verified?: boolean;
}

export const testimonials: Testimonial[] = [
  {
    name: 'Adebayo Ogunlesi',
    role: 'CEO, Greenfield Ventures',
    quote:
      'WallXERP completely transformed how we handle taxes. What used to take our accountant days now takes minutes.',
    avatar: 'AO',
    color: 'from-violet-500 to-purple-600',
    verified: true,
  },
  {
    name: 'Chioma Nwosu',
    role: 'Founder, CraftHub Lagos',
    quote:
      'Finally, a tax platform that actually understands Nigerian businesses. The reminders have saved us from NRS penalties.',
    avatar: 'CN',
    color: 'from-purple-500 to-indigo-600',
    verified: true,
  },
  {
    name: 'Ibrahim Musa',
    role: 'MD, Sahel Logistics',
    quote:
      'Crystal-clear picture of our tax obligations. The PDF statements look incredibly professional.',
    avatar: 'IM',
    color: 'from-fuchsia-500 to-purple-600',
    verified: true,
  },
];

/* ─── FAQs ─── */
export interface FAQItem {
  q: string;
  a: string;
  category?: 'general' | 'pricing' | 'tax' | 'security';
}

export const faqs: FAQItem[] = [
  {
    q: 'Is wallXTax really free to use?',
    a: 'Yes! wallXTax provides a completely free tier for small businesses. No monthly subscription fee or hidden charges to get started. You can track unlimited manual sales and expenses, calculate taxes, and export reports for free.',
    category: 'pricing',
  },
  {
    q: 'How does the AI Virtual CFO help my business?',
    a: 'Think of it as having a financial expert in your pocket 24/7. Our AI analyzes your sales, expenses, and cash flow to give you smart recommendations like "Stock up on inventory now" or "You can save ₦50K on taxes this month." It learns your business patterns and alerts you to opportunities you might miss.',
    category: 'general',
  },
  {
    q: 'Can I track my business from my phone?',
    a: "Absolutely! Record sales, log expenses, check your cash position, and even send invoices — all from your mobile device. Whether you're at the market, in a meeting, or on the go, your business data is always at your fingertips.",
    category: 'general',
  },
  {
    q: 'What happens to my debtors? Can the app help me get paid?',
    a: "Yes! Our Debtors Management feature tracks who owes you, sends automated payment reminders, and shows you which customers pay on time. You'll never forget who owes what, and your customers get professional reminders without awkward phone calls.",
    category: 'general',
  },
  {
    q: 'How is my tax calculated? Is it really NRS-compliant?',
    a: '100% NRS-compliant. Nigeria has more than one tax obligation: VAT is a flat 7.5%, and company income tax is charged on your chargeable profit at the rate your turnover attracts. WallXERP computes what is due from your actual sales and allowable expenses — every figure is auditable, and locked periods stay immutable after filing. No guesswork, no penalties.',
    category: 'tax',
  },
  {
    q: 'Can I open a business bank account through the app?',
    a: 'Yes! We partner with licensed Nigerian banking infrastructure to provision a Dedicated Virtual Account (DVA) directly from the platform. It integrates seamlessly with your sales and expense tracking, making bank reconciliation effortless.',
    category: 'general',
  },
  {
    q: 'Is my financial data secure?',
    a: "Absolutely. We use bank-grade AES-256 encryption and TLS 1.3 security. Your data is encrypted both in transit and at rest. We never sell your data to third parties, and all payment processing is protected by Paystack's PCI-DSS Level 1 certified infrastructure.",
    category: 'security',
  },
  {
    q: 'What if I already use accounting software?',
    a: "wallXTax complements your existing tools. You can import your data via Excel/CSV, or use us as your primary system — we're designed to be simple enough for non-accountants while powerful enough to replace complex software. Many businesses switch completely because we're easier and smarter.",
    category: 'general',
  },
  {
    q: 'Can I manage multiple businesses from one account?',
    a: 'Yes! Switch between businesses with one click. Starter plans support up to 2 businesses, Business supports 5, and Scale offers unlimited businesses. Each business gets its own independent ledger, dashboard, and tax filings.',
    category: 'pricing',
  },
  {
    q: 'Do I need accounting knowledge to use this?',
    a: 'Not at all! We built wallXTax for business owners, not accountants. If you can send a WhatsApp message, you can use our app. The interface is intuitive, and the AI CFO explains everything in plain English — no jargon, no confusion.',
    category: 'general',
  },
  {
    q: 'How fast can I start using it?',
    a: "Under 5 minutes. Sign up, add your business details, and you're live. Import past transactions if you have them, or start fresh. You'll be tracking your first sale before your coffee gets cold.",
    category: 'general',
  },
  {
    q: 'What if I miss a tax deadline?',
    a: "You won't — that's the point! Our Smart Notifications send you reminders days before any NRS deadline. You'll get alerts via email and in-app notifications. We've helped thousands avoid penalties by keeping them ahead of deadlines.",
    category: 'tax',
  },
  {
    q: 'Can I generate invoices for my customers?',
    a: 'Yes! Create professional, branded e-invoices in seconds. Add your logo, payment terms, and bank details. Customers receive them instantly via email or WhatsApp, and you track payment status in real-time — no more chasing paper receipts.',
    category: 'general',
  },
  {
    q: 'How does the Cash at Hand feature work?',
    a: 'It gives you a live, accurate picture of your cash position at any moment. Every sale, expense, and bank transaction updates your balance instantly. No more surprises. You always know exactly how much cash you have available to reinvest or pay bills.',
    category: 'general',
  },
  {
    q: 'What kind of support do I get?',
    a: 'You get real human support via email, WhatsApp, and in-app chat. Plus, our AI CFO answers common questions instantly. Most issues are resolved within hours. We also provide comprehensive documentation and workflow guides.',
    category: 'general',
  },
];

export const pricingFaqs = faqs.filter(
  (f) => f.category === 'pricing' || f.q.includes('free') || f.q.includes('multiple businesses') || f.q.includes('support'),
);

/* ─── Trust Indicators ─── */
export const trustIndicators = [
  { icon: Shield, text: 'Bank-Grade AES-256 Encryption' },
  { icon: CreditCard, text: 'Paystack PCI-DSS Certified' },
  { icon: Clock, text: 'Active NRS Compliance' },
];

/* ─── Pricing Plans (from freetrial.txt) ─── */
export interface PricingPlan {
  id: 'free' | 'starter' | 'business' | 'scale';
  name: string;
  tagline: string;
  monthlyPrice: number; // in NGN
  quarterlyPrice: number; // in NGN/quarter
  annualPrice: number; // in NGN/year
  savingsQuarterly?: string;
  savingsAnnual?: string;
  popular?: boolean;
  trialBadge?: string;
  features: string[];
  ctaText: string;
  ctaLink: string;
}

export const freeTrialPlan: PricingPlan = {
  id: 'free',
  name: '30-days FREE Trial (Freemiums)',
  tagline: 'Get 30 days of unrestricted access to every single feature across Starter, Business, and Scale-Up tiers.',
  monthlyPrice: 0,
  quarterlyPrice: 0,
  annualPrice: 0,
  trialBadge: '30-Day Free Trial',
  features: [
    'Everything in Starter, Business and ScaleUp',
  ],
  ctaText: 'Start 30-Day Free Trial',
  ctaLink: '/register?plan=free',
};

export const paidPricingPlans: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Monthly PLAN (Starter)',
    tagline: 'Monthly Plan for essential store operations and sales records.',
    monthlyPrice: 5000,
    quarterlyPrice: 15000,
    annualPrice: 50000,
    features: [
      'Up to 3 team members',
      'Sales Management',
      'Dedicated Virtual Bank Acc (DVA)',
      'Manage Up to 2 businesses/branches',
      'Unlimited invoices (custom branding) & Auto Collection',
      'Excel & CSV bulk sales import',
      '15 AI CFO queries / month',
      'Payment/Debtors/ Mgt & Reminders',
      'Business Profit/Loss Summary',
      'Expense Management',
      'Generate Reports',
      'FIR/NRS Tax Calculation & Filling',
      'Customer Retention & Loyalty Program',
    ],
    ctaText: 'Choose Monthly Plan',
    ctaLink: '/register?plan=starter',
  },
  {
    id: 'business',
    name: 'Quarterly (Business)',
    tagline: 'Quarterly Plan for scaling SMEs with customer credit and automated triggers.',
    monthlyPrice: 5000,
    quarterlyPrice: 12000,
    annualPrice: 45000,
    popular: true,
    trialBadge: 'Saving ₦3,000',
    savingsQuarterly: 'Saving ₦3,000',
    features: [
      'Everything in Starter Plan',
      'Sales Management',
      'Dedicated Virtual Bank Acc (DVA)',
      'Up to 10 team members',
      'Manage Up to 5 businesses/branches',
      'Unlimited invoices (custom branding) & Auto Collection',
      'Unlimited Receipt',
      'Excel & CSV bulk sales & expense import',
      '30 AI CFO queries / month',
      'Payment/Debtors/ Mgt & Reminders',
      'Business Profit/Loss Summary',
      'Customer Credit Management (BNPL)',
      'Expense Management',
      'Generate Reports',
      '19 Automated Reminders & Triggers',
      'FIR/NRS Tax Calculation & Filling',
      'Business Intelligence Reports/Analytics',
      'Customer Retention & Loyalty Program',
    ],
    ctaText: 'Choose Quarterly Plan',
    ctaLink: '/register?plan=business',
  },
  {
    id: 'scale',
    name: 'Annual (Scale-Up)',
    tagline: 'Annual Plan for high-volume enterprises with unlimited operations.',
    monthlyPrice: 5000,
    quarterlyPrice: 12000,
    annualPrice: 45000,
    trialBadge: 'Saving ₦15,000',
    savingsAnnual: 'Saving ₦15,000',
    features: [
      'Everything in Business Plan',
      'Unlimited team members',
      'Unlimited Sales Management',
      'Dedicated Virtual Bank Acc (DVA)',
      'Manage Up to Unlimited businesses/branches',
      'Unlimited invoices (custom branding) & Auto Collection',
      'Bulk Invoicing & Receipting',
      'Unlimited Receipt',
      'Excel & CSV bulk sales & expense import',
      '30 AI CFO queries / month',
      'Payment/Debtors/ Mgt & Reminders',
      'Business Profit/Loss Summary',
      'Customer Credit Management (BNPL)',
      'Expense Management',
      'Generate Reports',
      '30 Automated Reminders & Triggers',
      'Business Intelligence Reports/Analytics',
      'FIR/NRS Tax Calculation & Filling',
      'Customer Retention & Loyalty Program',
    ],
    ctaText: 'Choose Annual Plan',
    ctaLink: '/register?plan=scale',
  },
];

export const pricingPlans: PricingPlan[] = [freeTrialPlan, ...paidPricingPlans];

/* ─── Plan Comparison Matrix ─── */
export interface MatrixRow {
  category: string;
  rows: {
    feature: string;
    free: string;
    starter: string;
    business: string;
    scale: string;
    tooltip?: string;
  }[];
}

export const planComparisonMatrix: MatrixRow[] = [
  {
    category: 'Plan Structure & Commitment',
    rows: [
      {
        feature: 'Billing / Commitment Term',
        free: '30-days FREE Trial',
        starter: 'Monthly Plan',
        business: 'Quarterly Plan',
        scale: 'Annual Plan',
      },
      {
        feature: 'Price & Savings',
        free: '₦0',
        starter: '₦5,000 / month',
        business: '₦12,000 / quarter (Saving ₦3,000)',
        scale: '₦45,000 / year (Saving ₦15,000)',
      },
      {
        feature: 'Team Member Seats',
        free: 'Up to 10 team members (trial)',
        starter: 'Up to 3 team members',
        business: 'Up to 10 team members',
        scale: 'Unlimited team members',
      },
      {
        feature: 'Businesses / Branches Managed',
        free: 'Up to 5 businesses/branches (trial)',
        starter: 'Manage Up to 2 businesses/branches',
        business: 'Manage Up to 5 businesses/branches',
        scale: 'Manage Up to Unlimited businesses/branches',
      },
    ],
  },
  {
    category: 'Sales, Invoicing & Receipts',
    rows: [
      {
        feature: 'Sales Management',
        free: 'Unlimited Sales Management',
        starter: 'Sales Management',
        business: 'Sales Management',
        scale: 'Unlimited Sales Management',
      },
      {
        feature: 'Dedicated Virtual Bank Acc (DVA)',
        free: '✓ Included',
        starter: '✓ Included',
        business: '✓ Included',
        scale: '✓ Included',
      },
      {
        feature: 'Invoicing & Auto Collection',
        free: 'Unlimited invoices (custom branding) & Auto Collection',
        starter: 'Unlimited invoices (custom branding) & Auto Collection',
        business: 'Unlimited invoices (custom branding) & Auto Collection',
        scale: 'Unlimited invoices (custom branding) & Auto Collection',
      },
      {
        feature: 'Receipt Generation',
        free: 'Unlimited Receipt + Bulk Receipting',
        starter: 'Standard Receipts',
        business: 'Unlimited Receipt',
        scale: 'Bulk Invoicing & Receipting + Unlimited Receipt',
      },
      {
        feature: 'Bulk Sales & Expense Import',
        free: 'Excel & CSV bulk sales & expense import',
        starter: 'Excel & CSV bulk sales import',
        business: 'Excel & CSV bulk sales & expense import',
        scale: 'Excel & CSV bulk sales & expense import',
      },
    ],
  },
  {
    category: 'Finance, Credit & AI Intelligence',
    rows: [
      {
        feature: 'AI CFO Queries / Month',
        free: '30 AI CFO queries / month',
        starter: '15 AI CFO queries / month',
        business: '30 AI CFO queries / month',
        scale: '30 AI CFO queries / month',
      },
      {
        feature: 'Payment/Debtors/ Mgt & Reminders',
        free: '✓ Included',
        starter: '✓ Included',
        business: '✓ Included',
        scale: '✓ Included',
      },
      {
        feature: 'Customer Credit Management (BNPL)',
        free: '✓ Included',
        starter: '—',
        business: '✓ Included',
        scale: '✓ Included',
      },
      {
        feature: 'Automated Reminders & Triggers',
        free: '19 Automated Reminders & Triggers',
        starter: 'Standard Reminders',
        business: '19 Automated Reminders & Triggers',
        scale: '30 Automated Reminders & Triggers',
      },
      {
        feature: 'Business Profit/Loss Summary',
        free: '✓ Included',
        starter: '✓ Included',
        business: '✓ Included',
        scale: '✓ Included',
      },
      {
        feature: 'Business Intelligence Reports/Analytics',
        free: '✓ Included',
        starter: '—',
        business: '✓ Included',
        scale: '✓ Included',
      },
    ],
  },
  {
    category: 'Compliance & Growth Programs',
    rows: [
      {
        feature: 'Expense Management',
        free: '✓ Included',
        starter: '✓ Included',
        business: '✓ Included',
        scale: '✓ Included',
      },
      {
        feature: 'Generate Reports',
        free: '✓ Included',
        starter: '✓ Included',
        business: '✓ Included',
        scale: '✓ Included',
      },
      {
        feature: 'FIR/NRS Tax Calculation & Filling',
        free: '✓ Included',
        starter: '✓ Included',
        business: '✓ Included',
        scale: '✓ Included',
      },
      {
        feature: 'Customer Retention & Loyalty Program',
        free: '✓ Included',
        starter: '✓ Included',
        business: '✓ Included',
        scale: '✓ Included',
      },
    ],
  },
];

/* ─── Core Product Features ─── */
export interface FeatureItem {
  id: string;
  icon: LucideIcon;
  iconColor: string;
  title: string;
  description: string;
  tag?: string;
}

export const featuresList: FeatureItem[] = [
  {
    id: 'sales',
    icon: TrendingUp,
    iconColor: 'from-emerald-500 to-teal-500',
    title: 'Real-Time Sales Tracking',
    description:
      'Log daily sales, point-of-sale entries, and bank transfers with instant revenue analytics and customer trend tracking.',
    tag: 'Core Ledger',
  },
  {
    id: 'expenses',
    icon: Receipt,
    iconColor: 'from-rose-500 to-pink-500',
    title: 'Categorized Expense Management',
    description:
      'Capture allowable operating costs, bills, and bad debt write-offs to shield your profit from over-taxation.',
    tag: 'Deductions',
  },
  {
    id: 'cash-at-hand',
    icon: Wallet,
    iconColor: 'from-amber-500 to-orange-500',
    title: 'Cash at Hand Register',
    description:
      'Keep your actual physical drawer balance synchronized with digital transfers and settled invoices without discrepancy.',
  },
  {
    id: 'debtors',
    icon: Clock,
    iconColor: 'from-blue-500 to-cyan-500',
    title: 'Debtors & Credit Sales (BNPL)',
    description:
      'Issue goods on credit with accrual-basis accounting, track aging receivables, and schedule automatic debtor reminders.',
    tag: 'Accrual Accounting',
  },
  {
    id: 'performance',
    icon: BarChart3,
    iconColor: 'from-violet-500 to-purple-500',
    title: 'Executive Financial KPIs',
    description:
      'Get immediate clarity on gross profit margins, revenue growth, top-selling items, and seasonal expenditure spikes.',
  },
  {
    id: 'ai-cfo',
    icon: Zap,
    iconColor: 'from-indigo-500 to-purple-600',
    title: 'Virtual CFO Assistant',
    description:
      'Ask financial questions in plain Nigerian business terms. Forecast tax liabilities, review inventory trends, and spot cost leaks.',
    tag: 'AI Powered',
  },
  {
    id: 'invoicing',
    icon: FileText,
    iconColor: 'from-sky-500 to-blue-500',
    title: 'Professional E-Invoices',
    description:
      'Generate FIRS-compliant VAT invoices with your logo, download A4 PDFs, and send directly via email or WhatsApp.',
  },
  {
    id: 'bank-account',
    icon: CreditCard,
    iconColor: 'from-primary-500 to-indigo-500',
    title: 'Dedicated Virtual Account (DVA)',
    description:
      'Get a dedicated Nigerian bank account number for your business that automatically captures inbound transfers into sales.',
    tag: 'Auto-Capture',
  },
  {
    id: 'notifications',
    icon: Bell,
    iconColor: 'from-fuchsia-500 to-pink-500',
    title: 'Smart Filing Reminders',
    description:
      'Receive timely alerts ahead of the 21st monthly NRS filing deadline so you never incur punitive interest or late charges.',
  },
  {
    id: 'tax-calc',
    icon: ShieldCheck,
    iconColor: 'from-emerald-500 to-green-500',
    title: 'Official NRS Tax Engine',
    description:
      'Automated VAT and income-tax calculations derived from your real sales and expenses, strictly following Nigerian tax rules, with full audit logs.',
    tag: 'NRS 2026',
  },
];

/* ─── 3-Step Process ─── */
export interface StepItem {
  stepNum: number;
  title: string;
  description: string;
  image: string;
  webpSm: string;
  webpMd: string;
}

export const howItWorksSteps: StepItem[] = [
  {
    stepNum: 1,
    title: 'Create Your Account',
    description:
      'Set up your business profile in under 2 minutes. Enter your business details and configure your default profit margins.',
    image: '/images/step-1-account.jpg',
    webpSm: '/images-optimized/step-1-account-sm.webp',
    webpMd: '/images-optimized/step-1-account-md.webp',
  },
  {
    stepNum: 2,
    title: 'Record Transactions',
    description:
      'Track sales and allowable expenses. Collect counter payments via your Dedicated Virtual Account or import bulk files.',
    image: '/images/step-2-transactions.jpg',
    webpSm: '/images-optimized/step-2-transactions-sm.webp',
    webpMd: '/images-optimized/step-2-transactions-md.webp',
  },
  {
    stepNum: 3,
    title: 'File & Pay Tax',
    description:
      'Review your auto-computed tax report, finalize with one click, and remit payment securely via Paystack with an instant receipt.',
    image: '/images/step-3-file-tax.jpg',
    webpSm: '/images-optimized/step-3-file-tax-sm.webp',
    webpMd: '/images-optimized/step-3-file-tax-md.webp',
  },
];

/* ─── Support Channels ─── */
export interface SupportChannel {
  id: 'email' | 'whatsapp' | 'inapp';
  title: string;
  description: string;
  contact: string;
  href: string;
  actionText: string;
  telHref?: string;
}

export const supportChannels: SupportChannel[] = [
  {
    id: 'email',
    title: 'Email Support',
    description: 'Direct response from our accounting and technical team within 2 hours during business hours.',
    contact: 'support@paymytax.com',
    href: 'mailto:support@paymytax.com',
    actionText: 'Email Us',
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp Business',
    description: 'Chat directly with support representatives for rapid assistance, onboarding, and quick questions.',
    contact: '+234 814 749 0832',
    telHref: 'tel:2348147490832',
    href: 'https://wa.me/2348147490832?text=Hello%20WallXERP%20Support,%20I%20have%20an%20inquiry%20regarding%20my%20account.',
    actionText: 'Chat on WhatsApp',
  },
  {
    id: 'inapp',
    title: 'In-App Support Desk',
    description: 'Active subscribers can open ticket threads directly from the dashboard with transaction context.',
    contact: 'Available in dashboard',
    href: '/login',
    actionText: 'Open Dashboard',
  },
];
