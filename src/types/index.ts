export interface User {
  id: string;
  email: string;
  fullName?: string | null;
  phone?: string;
  bvn?: string;
  bvnLast4?: string | null;
  nin?: string;
  bvnVerifiedAt?: string;
  ninVerifiedAt?: string;
  role: 'user' | 'admin';
  isVerified: boolean;
  isActive: boolean;
  createdAt: string;
  settlementBankCode?: string | null;
  settlementBankName?: string | null;
  settlementAccountNumber?: string | null;
  settlementAccountName?: string | null;
  settlementConnectedAt?: string | null;
  paystackCustomerCode?: string | null;
  virtualAccountNumber?: string | null;
  virtualAccountBank?: string | null;
  primaryBusinessId?: string | null;
  regulatoryTermsAcceptedAt?: string | null;
  regulatoryTermsVersion?: string | null;
  pendingInvitationCount?: number;
  isOwnerAccount?: boolean;
  subscriptionTier?: string | null;
  subscriptionExpiresAt?: string | null;
  trialEndsAt?: string | null;
  pendingPlan?: string | null;
  hasPendingSubmission?: boolean;
}

export type BusinessRole = 'owner' | 'manager' | 'sales_staff' | 'accountant' | 'viewer';
export type InvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'revoked';

export type PermissionKey =
  | 'sales.create' | 'sales.read' | 'sales.update' | 'sales.delete' | 'sales.import'
  | 'expenses.create' | 'expenses.read' | 'expenses.update' | 'expenses.delete'
  | 'invoices.create' | 'invoices.read' | 'invoices.send' | 'invoices.mark_paid'
  | 'debtors.read' | 'debtors.manage'
  | 'customers.read' | 'customers.manage'
  | 'tax.read' | 'tax.calculate' | 'tax.finalize' | 'tax.pay'
  | 'payments.read'
  | 'dashboard.read'
  | 'settings.read' | 'settings.update'
  | 'team.manage'
  | 'business.delete'
  | 'wallet.read' | 'wallet.withdraw'
  | 'statements.download'
  | 'reminders.read'
  | 'ai.use';

export interface BusinessMember {
  id: string;
  businessId: string;
  userId: string;
  role: BusinessRole;
  permissions?: Record<string, boolean> | null;
  isActive: boolean;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    fullName?: string | null;
    phone?: string | null;
    isVerified: boolean;
    lastLoginAt?: string | null;
  };
}

export interface TeamInvitation {
  id: string;
  businessId?: string;
  email: string;
  fullName?: string | null;
  role: BusinessRole;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  business?: {
    id: string;
    businessName: string;
    ownerName: string;
    logoUrl?: string | null;
  };
}

export interface TeamCap {
  maxInvitedMembers: number;
  activeInvitedCount: number;
  pendingCount: number;
  remainingSlots: number;
}

export interface ValidateInviteResponse {
  valid: boolean;
  accountExists?: boolean;
  reason?: 'not_found' | 'revoked' | 'already_used' | 'expired' | 'account_already_registered' | 'account_not_eligible' | string;
  email?: string;
  fullName?: string | null;
  role?: BusinessRole;
  business?: {
    id: string;
    businessName: string;
    ownerName: string;
    logoUrl?: string | null;
  };
  expiresAt?: string;
}

export interface AcceptOnboardingPayload {
  token: string;
  password: string;
}

export interface Business {
  id: string;
  userId: string;
  merchantId: string;
  businessName: string;
  ownerName: string;
  taxId?: string;
  businessType: string;
  address?: string;
  city?: string;
  state?: string;
  defaultProfitMargin?: number;
  taxReminderDay?: number;
  paystackCustomerCode?: string;
  virtualAccountNumber?: string;
  virtualAccountBank?: string;
  paystackSubaccountCode?: string;
  settlementBankCode?: string;
  settlementBankName?: string;
  settlementAccountNumber?: string;
  settlementAccountName?: string;
  platformCommissionPct?: number;
  settlementConnectedAt?: string;
  voucherBonusPct?: number;
  logoUrl?: string | null;
  logoPublicId?: string | null;
  createdAt: string;
  updatedAt: string;
  myRole?: BusinessRole;
  myPermissions?: Record<string, boolean>;
  memberCount?: number;
}


export interface SaleLineItem {
  id?: string;
  saleId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  sortOrder?: number;
}

export interface SalesTransaction {
  id: string;
  businessId: string;
  amount: number;
  source: string;
  status: string;
  referenceId?: string;
  description?: string;
  customerName?: string;
  customerHint?: string;
  customerId?: string | null;
  finalClassification?: string;
  needsVerification?: boolean;
  verifiedAt?: string;
  dvaOrigin?: boolean;
  isTaxable?: boolean;
  transactionDate: string;
  createdAt: string;
  updatedAt?: string;
  items?: SaleLineItem[];
  itemsCount?: number;
  /**
   * Accrual links. A sale carrying any of these had its revenue recognised at
   * invoicing / credit issuance, so it cannot be moved to another business.
   * Absent (undefined) on payloads that don't include the relations.
   */
  invoice?: { id: string; invoiceNumber: string } | null;
  creditOrigin?: { id: string } | null;
  creditPayment?: { id: string } | null;
  /** Derived server-side from the relations above. */
  accrualLinked?: boolean;
}

export interface Expense {
  id: string;
  businessId: string;
  category: string;
  description?: string;
  /** Free-text detail captured when category = 'other' */
  categoryDetail?: string | null;
  amount: number;
  quantity?: number;
  unitPrice?: number | null;
  expenseDate: string;
  receiptUrl?: string;
  isDeductible: boolean;
  linkedCreditId?: string | null;
  createdAt: string;
}

export interface TaxReport {
  id: string;
  businessId: string;
  taxMonth: string;
  totalSales: number;
  totalExpenses: number;
  grossProfit: number;
  taxRate: number;
  taxPayable: number;
  profitMargin: number;
  paymentStatus: PaymentStatus;
  isFinalized: boolean;
  isLocked: boolean;
  lockedAt?: string | null;
  isNilReturn?: boolean;
  latestPayment?: TaxPayment | null;
  payments?: TaxPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface TaxPayment {
  id: string;
  businessId: string;
  taxReportId: string;
  amountPaid: number;
  paymentMethod: string;
  transactionReference: string;
  paymentStatus: PaymentStatus;
  paymentDate?: string;
  createdAt: string;
  remittanceStatus?: RemittanceStatus;
  firsRemittanceRef?: string | null;
  firsReceiptUrl?: string | null;
}

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';

export type RemittanceStatus = 'collected' | 'remitting' | 'remitted';

// ─── Invoices ───────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export type InvoicePaymentMethod =
  | 'cash'
  | 'bank_transfer'
  | 'pos'
  | 'card'
  | 'mobile_money'
  | 'cheque'
  | 'online'
  | 'other';

export const INVOICE_PAYMENT_METHODS: ReadonlyArray<{
  value: InvoicePaymentMethod;
  label: string;
}> = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'pos', label: 'POS' },
  { value: 'card', label: 'Card' },
  { value: 'mobile_money', label: 'Mobile Money' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'online', label: 'Online' },
  { value: 'other', label: 'Other' },
];

export function invoicePaymentMethodLabel(m: InvoicePaymentMethod | null | undefined): string | null {
  if (!m) return null;
  return INVOICE_PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;
}

export interface InvoiceLine {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  sortOrder?: number;
}

export interface Invoice {
  id: string;
  businessId: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  sentAt: string | null;
  paidAt: string | null;
  paymentMethod: InvoicePaymentMethod | null;

  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerTaxId: string | null;

  subtotal: number;
  vatRate: number;
  vatAmount: number;
  discount: number;
  total: number;
  currency: string;

  notes: string | null;
  paymentTerms: string | null;

  linkedSaleId: string | null;
  linkedSale?: SalesTransaction | null;

  lines?: InvoiceLine[];
  _count?: { lines: number };

  createdAt: string;
  updatedAt: string;
}

export interface CreateInvoicePayload {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerTaxId?: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  vatRate?: number;
  discount?: number;
  currency?: string;
  notes?: string;
  paymentTerms?: string;
  lines: Array<Pick<InvoiceLine, 'description' | 'quantity' | 'unitPrice'>>;
}

export type UpdateInvoicePayload = Partial<CreateInvoicePayload>;

export interface InvoiceListQuery {
  page?: number;
  limit?: number;
  status?: InvoiceStatus;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export interface MarkInvoicePaidPayload {
  paymentMethod: InvoicePaymentMethod;
  paymentDate?: string;
}

export interface SendInvoiceWhatsAppResult {
  invoice: Invoice;
  /** wa.me URL the frontend should open in a new tab as desktop fallback. */
  waUrl: string;
  /** Pre-composed message body — used as the share text on mobile and the
   *  wa.me text param on desktop. */
  message: string;
  /** Public PDF URL (token-protected). Used on mobile as the file source for
   *  Web Share API, and on desktop as the link inside the WA message. */
  pdfUrl: string;
  /** E.164-style normalized phone the message will be addressed to — surfaced
   *  for analytics / debugging only; the wa.me link already encodes it. */
  to: string;
  /** The actual PDF file as a Blob for direct attachment in WhatsApp */
  pdfBlob: Blob | null;
  /** Filename for the PDF */
  filename: string;
}

export interface SendInvoiceEmailResult {
  invoice: Invoice;
  delivered: boolean;
  to: string;
}

// ─── Customer CRM & Virtual Store Cards ──────────────────────

export interface CustomerCardLedger {
  id: string;
  cardId: string;
  type: 'top_up' | 'change_credit' | 'sale_debit' | 'adjustment';
  amount: number;
  bonusAmount?: number | null;
  bonusPct?: number | null;
  balanceBefore: number;
  balanceAfter: number;
  receiptNumber?: string | null;
  linkedSaleId?: string | null;
  performedBy?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface CustomerCard {
  id: string;
  businessId: string;
  customerId: string;
  cardCode: string;
  balance: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  ledgers?: CustomerCardLedger[];
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  voucherBonusPct?: number | null;
  card?: CustomerCard | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuickCreateCustomerPayload {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface TopUpCustomerCardPayload {
  amount: number;
  bonusPct?: number;
  notes?: string;
  receiptDate?: string;
}

export interface CreditCustomerChangePayload {
  amount: number;
  receiptNumber?: string;
  linkedSaleId?: string;
  notes?: string;
  receiptDate?: string;
}

export interface AdjustCustomerCardPayload {
  amount: number;
  reason: string;
  receiptDate?: string;
}

export interface CustomerStats {
  totalCustomers: number;
  totalCards: number;
  circulatingBalance: number;
  monthChangeCredited: number;
  monthRedeemed: number;
  monthBonusGiven?: number;
}

export interface CustomerCardActivity {
  id: string;
  cardId: string;
  cardCode: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  type: 'top_up' | 'change_credit' | 'sale_debit' | 'adjustment';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  receiptNumber?: string | null;
  linkedSaleId?: string | null;
  performedBy?: string | null;
  performerName: string;
  performerEmail?: string | null;
  notes?: string | null;
  createdAt: string;
}

// ─── Sales Import ───────────────────────────────────────────

export type SalesImportRowStatus =
  | 'valid'
  | 'invalid'
  | 'duplicate_in_file'
  | 'duplicate_in_db'
  | 'locked';

export interface SalesImportPreviewRow {
  rowNumber: number;
  status: SalesImportRowStatus;
  data?: {
    transactionDate: string;
    amount: number;
    source: string;
    customerName?: string;
    description?: string;
    referenceId?: string;
  };
  errors?: Array<{ field: string; message: string }>;
}

export interface SalesImportSummary {
  total: number;
  valid: number;
  invalid: number;
  duplicateInFile: number;
  duplicateInDb: number;
  locked: number;
}

export interface SalesImportPreview {
  fileToken: string;
  summary: SalesImportSummary;
  rows: SalesImportPreviewRow[];
}

export interface SalesImportCommitResult {
  imported: number;
  skippedRaceDuplicates: number;
  skippedLockedAtCommit: number;
  invalidCount: number;
  duplicateInFileCount: number;
  duplicateInDbCount: number;
  lockedMonthCount: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: Pagination;
}

// Admin types
export interface AdminDashboardStats {
  totalUsers: number;
  totalBusinesses: number;
  totalTaxReports: number;
  totalRevenueProcessed: number;
  recentSignups: { id: string; email: string; createdAt: string }[];
  withdrawalSla?: {
    pendingCount: number;
    breachedCount: number;
    oldestPendingHours: number;
  };
  unverifiedInflows?: {
    count: number;
  };
  pendingSubscriptionsCount?: number;
}

export interface AdminUser {
  id: string;
  email: string;
  phone?: string;
  role: string;
  isVerified: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { businesses: number };
  autoPayoutEnabled?: boolean;
  subscriptionTier?: string | null;
  subscriptionExpiresAt?: string | null;
  trialEndsAt?: string | null;
}

export interface SubscriptionSubmission {
  id: string;
  userId?: string | null;
  businessId?: string | null;
  customerName: string;
  email: string;
  phone?: string | null;
  businessName?: string | null;
  plan: string;
  billingCycle: string;
  amount: number | string;
  notes?: string | null;
  receiptUrl?: string | null;
  receiptFileName?: string | null;
  receiptMime?: string | null;
  receiptPath?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    email: string;
    fullName?: string | null;
    phone?: string | null;
    subscriptionTier?: string | null;
    subscriptionExpiresAt?: string | null;
  } | null;
  business?: {
    id: string;
    businessName: string;
    ownerName?: string | null;
    taxId?: string | null;
  } | null;
}

export interface UserFeedback {
  id: string;
  userId?: string | null;
  businessId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  rating: number;
  sentiment?: string | null;
  tags: string[];
  comment?: string | null;
  createdAt: string;
  user?: {
    id: string;
    email: string;
    fullName?: string | null;
    subscriptionTier?: string | null;
  } | null;
  business?: {
    id: string;
    businessName: string;
  } | null;
}

export interface AdminUserBusiness {
  id: string;
  businessName: string;
  ownerName: string;
  taxId?: string | null;
  businessType?: string | null;
  address?: string | null;
  state?: string | null;
  city?: string | null;
  virtualAccountNumber?: string | null;
  virtualAccountBank?: string | null;
  settlementAccountNumber?: string | null;
  settlementBankName?: string | null;
  settlementAccountName?: string | null;
  createdAt: string;
  _count?: {
    sales: number;
    expenses: number;
    invoices: number;
    customers: number;
  };
}

export interface AdminUserSubscriptionSubmission {
  id: string;
  plan: string;
  billingCycle: string;
  amount: number;
  receiptUrl?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  notes?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface AdminUserFeedback {
  id: string;
  rating: number;
  sentiment?: string | null;
  comment?: string | null;
  tags: string[];
  createdAt: string;
}

export interface AdminUserWalletBalance {
  balance: number;
  lockedBalance: number;
  currency: string;
}

export interface AdminUserDetail extends AdminUser {
  updatedAt?: string;
  walletBalance?: AdminUserWalletBalance | null;
  businesses: AdminUserBusiness[];
  subscriptionSubmissions?: AdminUserSubscriptionSubmission[];
  feedbacks?: AdminUserFeedback[];
}

export interface AdminBusiness {
  id: string;
  businessName: string;
  ownerName: string;
  taxId?: string;
  businessType: string;
  state?: string;
  city?: string;
  createdAt: string;
  user: { id: string; email: string };
}

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  user: { id: string; email: string } | null;
}

// ─── Tax Analytics ──────────────────────────────────────────

export interface TaxAnalyticsSeriesPoint {
  taxMonth: string; // "YYYY-MM"
  totalSales: number;
  totalExpenses: number;
  grossProfit: number;
  taxPayable: number;
  profitMargin: number;
  paymentStatus: 'none' | 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  isFinalized: boolean;
  isLocked: boolean;
  reportId: string | null;
}

export interface TaxAnalyticsYoYMonth {
  month: number; // 1..12
  current: number | null;
  prior: number | null;
  deltaPct: number | null;
}

export interface TaxAnalyticsResponse {
  window: { from: string; to: string; monthsInRange: number };
  kpis: {
    totalTaxPaid: number;
    totalTaxOwed: number;
    reportsFiled: number;
    averageMonthlyTax: number;
    deltas: {
      totalTaxPaidPct: number | null;
      totalTaxOwedPct: number | null;
      reportsFiledPct: number | null;
    };
  };
  series: TaxAnalyticsSeriesPoint[];
  statusDistribution: { paid: number; pending: number; failed: number };
  yoy: null | {
    currentYear: number;
    priorYear: number;
    months: TaxAnalyticsYoYMonth[];
  };
}

// ─── Reminders ─────────────────────────────────────────────
export type ReminderType =
  | 'tax_deadline'
  | 'unfiled_tax'
  | 'unfinalized_report'
  | 'unpaid_tax'
  | 'margin_warning'
  | 'invoice_overdue'
  | 'payment_successful'
  | 'payment_refunded'
  | 'dva_received'
  | 'dva_validation_failed'
  | 'transaction_needs_verification'
  | 'payout_change_permitted'
  | 'payout_requested'
  | 'payout_approved'
  | 'payout_rejected'
  | 'payout_completed'
  | 'payout_failed'
  | 'credit_overdue'
  | 'pnl_statement_ready';

export type ReminderReferenceType =
  | 'invoice'
  | 'payment'
  | 'sales_transaction'
  | 'business'
  | 'settlement_payout'
  | 'customer_credit';

export interface Reminder {
  id: string;
  businessId: string;
  reminderType: ReminderType;
  scheduledDate: string;
  message: string;
  isSent: boolean;
  sentAt: string | null;
  createdAt: string;
  referenceType: ReminderReferenceType | null;
  referenceId: string | null;
}

// Returned by `GET /api/v1/banks`. Backs the BVN-validation bank dropdown on
// the Account page. `code` is the NIBSS clearing code Paystack expects as
// `bank_code` on `/customer/:code/identification`; `slug` is the identifier
// used elsewhere (e.g. `preferred_bank` on DVA creation). Server-side cache
// in `banks` table refreshes from Paystack every 24h.
export interface Bank {
  id: string;
  code: string;
  name: string;
  slug: string;
  longCode: string | null;
  type: string | null;
  active: boolean;
}

// ─── Sales & Expenses Overview ─────────────────────────────
export type OverviewPeriodKey = '7d' | '30d' | '3m' | '6m' | '12m' | 'ytd' | 'all' | 'custom';

export interface SalesOverviewTimelinePoint {
  date: string;
  label: string;
  sales: number;
  expenses: number;
  netProfit: number;
  profitMargin: number;
  salesCount: number;
  expensesCount: number;
}

export interface SalesOverviewResponse {
  period: {
    key: OverviewPeriodKey;
    from: string;
    to: string;
    granularity: 'day' | 'month';
  };
  kpis: {
    totalSales: number;
    totalExpenses: number;
    netProfit: number;
    profitMargin: number;
    salesCount: number;
    expensesCount: number;
    deltas: {
      salesPct: number | null;
      expensesPct: number | null;
      netProfitPct: number | null;
    };
  };
  timeline: SalesOverviewTimelinePoint[];
  breakdown: {
    salesBySource: Array<{ source: string; amount: number; percentage: number }>;
    expensesByCategory: Array<{ category: string; amount: number; percentage: number }>;
  };
}

// ─── Dedicated Virtual Account (DVA) ────────────────────────
export interface DvaTransactionRow {
  id: string;
  amount: number | string;
  status: string;
  referenceId?: string | null;
  customerName?: string | null;
  customerHint?: string | null;
  transactionDate: string;
  needsVerification: boolean;
  verifiedAt?: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface DvaTransactionsResponse {
  success: boolean;
  data: DvaTransactionRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ─── Unified Financial Ledger ────────────────────────────────
export interface UnifiedLedgerRow {
  id: string;
  scope: 'dva_bank' | 'general_sales' | 'tax_outflow';
  entryType: 'credit' | 'debit';
  sourceType: 'dva_transfer' | 'manual_sale' | 'invoice_payment' | 'pos' | 'credit_sale' | 'tax_payment' | 'refund' | 'payout';
  amount: number;
  runningBalance: number;
  classification: string;
  description: string;
  reference: string;
  date: string;
  status: 'settled' | 'pending' | 'reversed' | 'refunded';
  counterparty: string;
  isTaxable: boolean;
  accrualLinked?: boolean;
  needsVerification?: boolean;
  verifiedAt?: string | null;
  dvaOrigin?: boolean;
  metadata?: Record<string, unknown> | null;
}

export interface UnifiedLedgerSummary {
  openingBalance: number;
  totalCredits: number;
  totalDebits: number;
  totalTaxDebits?: number;
  totalPayoutDebits?: number;
  totalSplitDebits?: number;
  closingBalance: number;
  breakdown?: {
    creditsBySource: {
      dva_transfer: number;
      manual_sale: number;
      pos: number;
      invoice_payment: number;
      credit_sale: number;
      other: number;
    };
    debitsByType?: {
      tax_payment: number;
      refund: number;
    };
  };
}

export interface UnifiedLedgerResponse {
  success: boolean;
  scope: 'dva_bank' | 'all_income';
  summary: UnifiedLedgerSummary;
  data: UnifiedLedgerRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ─── Admin Treasury & P&L Analytics ─────────────────────────
export interface TreasuryKPIs {
  totalGrossInflows: number;
  totalInflowFeesAbsorbed: number;
  totalGrossOutflows: number;
  totalWithdrawalFeesCollected: number;
  totalDisbursementCost: number;
  netPlatformMargin: number;
  isProfitable: boolean;
}

export interface TransferMarginItem {
  id: string;
  date: string;
  type: 'inflow' | 'outflow';
  businessId: string;
  businessName: string;
  reference: string;
  status: string;
  grossAmount: number;
  feeCollected: number;
  gatewayCost: number;
  netMargin: number;
}

export interface TreasuryAnalyticsData {
  kpis: TreasuryKPIs;
  transfers: TransferMarginItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ─── Admin Transactions (platform-wide real-wallet-money feed) ─
export interface AdminTransactionRow {
  id: string;
  sourceType: 'inflow' | 'withdrawal' | 'tax';
  direction: 'in' | 'out';
  date: string;
  businessId: string;
  businessName: string;
  merchantId: string;
  userEmail: string;
  reference: string;
  status: string;
  amount: number;
  fee: number;
  netAmount: number;
  counterparty: string | null;
  description: string | null;
  needsVerification: boolean;
  destinationBankName: string | null;
  destinationAccountNum: string | null;
  failureReason: string | null;
}

export interface AdminTransactionsSummary {
  totalIn: number;
  totalOut: number;
  net: number;
}

export interface PlatformFeeConfig {
  withdrawalFeePct: number;
  withdrawalFeeCap: number;
  minWithdrawalAmount: number;
  updatedAt?: string;
  updatedBy?: string | null;
}

export interface TransferFinancials {
  grossAmount: number;
  customerCredit?: number;
  customerDebit?: number;
  amountDisbursed?: number;
  platformFeeCollected: number;
  paystackInflowFeeAbsorbed?: number;
  paystackTransferFee?: number;
  federalStampDuty: number;
  totalGatewayCost: number;
  netMargin: number;
  isProfit: boolean;
}

export interface SiblingBusinessOption {
  id: string;
  businessName: string;
  merchantId: string;
}

export interface AdminUnverifiedInflowRow {
  id: string;
  businessId: string;
  amount: number;
  source: string;
  status: string;
  referenceId: string | null;
  customerHint: string | null;
  customerName: string | null;
  description: string | null;
  transactionDate: string;
  needsVerification: boolean;
  createdAt: string;
  business: {
    id: string;
    businessName: string;
    merchantId: string;
    user: {
      id: string;
      email: string;
    };
  };
  invoice?: { id: string; invoiceNumber: string } | null;
  creditOrigin?: { id: string } | null;
  creditPayment?: { id: string } | null;
  /** Revenue was recognised at invoicing/credit issuance — reassignment is refused. */
  accrualLinked: boolean;
  siblingBusinesses: SiblingBusinessOption[];
}

export interface TransferDetailBreakdown {
  id: string;
  type: 'inflow' | 'outflow';
  reference: string;
  date: string;
  createdAt?: string;
  completedAt?: string | null;
  status: string;
  business: {
    id: string;
    name: string;
    owner: string;
    email: string;
  };
  assignedBusiness?: {
    id: string;
    businessName: string;
    merchantId: string;
  };
  siblingBusinesses: SiblingBusinessOption[];
  /** Inflows only: revenue recognised at invoice/credit issuance — reassignment refused. */
  accrualLinked?: boolean;
  financials: TransferFinancials;
  routing: {
    channel: string;
    provider?: string;
    destinationBank?: string;
    destinationBankCode?: string;
    destinationAccountNum?: string;
    destinationAccountName?: string;
    paystackTransferCode?: string | null;
    adminApprovedBy?: string | null;
    adminApprovedAt?: string | null;
    customerName?: string;
    description?: string;
    narration?: string | null;
    failureReason?: string | null;
  };
}

export interface RegulatoryMeta {
  companyLegalName: string;
  platformRole: string;
  partnerPSP: string;
  partnerPSPLicense: string;
  partnerBanks: string;
  governingLaw: string;
  nonCustodialNotice: string;
  termsVersion: string;
}

// ─── Customer Credits / Debtors ───────────────────────────
export type CreditStatus = 'unpaid' | 'partially_paid' | 'paid' | 'written_off' | 'overdue';

export interface CreditPayment {
  id: string;
  creditId: string;
  amount: number;
  paymentDate: string;
  paymentType: string;
  isFullPayment: boolean;
  notes?: string | null;
  linkedSaleId?: string | null;
  createdAt: string;
}

export interface CreditLineItem {
  id?: string;
  creditId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  sortOrder?: number;
  createdAt?: string;
}

export interface CustomerCredit {
  id: string;
  businessId: string;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  description: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  issueDate: string;
  dueDate: string;
  reminderDate?: string | null;
  lastReminderSentAt?: string | null;
  status: CreditStatus;
  guarantorName?: string | null;
  guarantorPhone?: string | null;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  payments?: CreditPayment[];
  items?: CreditLineItem[];
}

export interface CreditSummary {
  totalOutstanding: number;
  overdueAmount: number;
  activeDebtors: number;
  recoveredThisMonth: number;
}

export interface CreateCreditPayload {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  description?: string;
  totalAmount?: number;
  items?: Array<{ name: string; quantity: number; unitPrice: number }>;
  issueDate: string;
  dueDate: string;
  reminderDate?: string;
  customerId?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  notes?: string;
}

export interface RecordCreditPaymentPayload {
  amount: number;
  paymentDate: string;
  paymentType: 'cash' | 'bank_transfer' | 'pos' | 'manual' | 'online_store' | 'paycode';
  notes?: string;
}

export interface UpdateCreditPayload {
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  description?: string;
  dueDate?: string;
  reminderDate?: string;
  guarantorName?: string;
  guarantorPhone?: string;
  notes?: string;
  items?: Array<{ name: string; quantity: number; unitPrice: number; lineTotal?: number }>;
  totalAmount?: number;
}

export interface WriteOffCreditPayload {
  reason: string;
}

export interface CreditListQuery {
  page?: number;
  limit?: number;
  status?: CreditStatus | '';
  search?: string;
}

export interface SendCreditWhatsAppResult {
  waUrl: string;
  phone: string;
  customerName: string;
  balance: number;
  dueDate: string;
  message: string;
}

export interface PlatformTaxConfig {
  id: string;
  autoFinalizeDay: number;
  autoFinalizeEnabled: boolean;
  updatedAt: string;
  updatedBy?: string | null;
}

