import { config } from '@/config';
import { AppError } from '@/middleware/errorHandler';
import {
  PaymentProvider,
  InitializePaymentParams,
  InitializePaymentResult,
  VerifyPaymentResult,
  CreateCustomerParams,
  CreateCustomerResult,
  CreateDVAResult,
  ValidateCustomerParams,
  ValidateCustomerResult,
  BankRecord,
  RequeryDVAResult,
  ResolveAccountResult,
  CreateSubaccountParams,
  CreateSubaccountResult,
} from './types';

const BASE_URL = 'https://api.paystack.co';

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
  meta?: { nextStep?: string };
  code?: string;
  type?: string;
}

export class PaystackProvider implements PaymentProvider {
  private secretKey: string;

  constructor() {
    this.secretKey = config.paystack.secretKey;
  }

  private async request<T = any>(
    method: string,
    path: string,
    body?: Record<string, any>,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.secretKey}`,
    };
    if (body) headers['Content-Type'] = 'application/json';

    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    const responseData = await response.json() as PaystackResponse<T>;

    if (!responseData.status) {
      const message = responseData.message || 'Paystack request failed';
      const meta = responseData.meta?.nextStep ? ` ${responseData.meta.nextStep}` : '';
      throw new AppError(
        response.status >= 400 && response.status < 500 ? 400 : 502,
        `${message}${meta}`,
        'PAYSTACK_ERROR',
        { paystackCode: responseData.code, type: responseData.type },
      );
    }

    return responseData.data;
  }

  async initialize(params: InitializePaymentParams): Promise<InitializePaymentResult> {
    const data = await this.request('POST', '/transaction/initialize', {
      email: params.email,
      amount: Math.round(params.amount * 100),
      reference: params.reference,
      metadata: params.metadata,
      callback_url: params.callbackUrl,
    });

    return {
      authorizationUrl: data.authorization_url,
      accessCode: data.access_code,
      reference: data.reference,
    };
  }

  async verify(reference: string): Promise<VerifyPaymentResult> {
    const data = await this.request('GET', `/transaction/verify/${encodeURIComponent(reference)}`);

    return {
      status: data.status,
      reference: data.reference,
      amount: data.amount / 100,
      paidAt: data.paid_at,
      channel: data.channel,
      gatewayResponse: data.gateway_response,
    };
  }

  // ─── DVA Methods ────────────────────────────────────────────────────

  async createCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
    const data = await this.request('POST', '/customer', {
      email: params.email,
      first_name: params.firstName,
      last_name: params.lastName,
      phone: params.phone,
    });

    return {
      customerCode: data.customer_code,
      customerId: data.id,
    };
  }

  /**
   * Validate a Paystack customer's identity.
   *
   * Paystack deprecated the BVN-only shape (`type: 'bvn'`) in favour of the
   * bank-account-verification shape (`type: 'bank_account'`), which requires
   * a bank account number registered against the same BVN. The new shape
   * cross-references NIBSS records and is the only shape that lifts the
   * fintech "validation_required" gate on DVA creation.
   *
   * Reference: https://paystack.com/docs/identity-verification/validate-customer/
   *
   * Note `country: 'NG'` (two-letter ISO) — the validation endpoint expects
   * the ISO code, not the slug used by `GET /bank?country=nigeria`.
   */
  async validateCustomer(params: ValidateCustomerParams): Promise<ValidateCustomerResult> {
    await this.request('POST', `/customer/${params.customerCode}/identification`, {
      country: 'NG',
      type: 'bank_account',
      account_number: params.accountNumber,
      bank_code: params.bankCode,
      bvn: params.bvn,
      first_name: params.firstName,
      last_name: params.lastName,
    });

    return { validated: true };
  }

  /**
   * Fetch the list of banks Paystack supports for the given country.
   *
   * Used by `bank.service.ts` to populate the BVN-validation dropdown. Heavy
   * to call on every request — 24h cached in the `banks` table. The response
   * is paginated by Paystack but the Nigeria list is ~50 entries; we request
   * `perPage=100` and surface a single page. If the list ever exceeds 100 we
   * will need to paginate (the API supports `?next` cursors).
   */
  async listBanks(country = 'nigeria'): Promise<BankRecord[]> {
    const path = `/bank?country=${encodeURIComponent(country)}&perPage=100`;
    const data = await this.request<Array<Record<string, any>>>('GET', path);

    if (!Array.isArray(data)) {
      throw new AppError(502, 'Paystack returned unexpected bank list shape', 'PAYSTACK_ERROR');
    }

    return data.map((b) => ({
      name: b.name,
      slug: b.slug,
      code: b.code,
      longCode: b.longcode ?? null,
      country: b.country ?? country,
      currency: b.currency ?? 'NGN',
      type: b.type ?? null,
      active: b.active !== false,
    }));
  }

  /**
   * Create a Dedicated Virtual Account for a Paystack customer.
   *
   * `preferredBank` is REQUIRED and intentionally not defaulted at this layer.
   * The correct slug is mode-dependent (`test-bank` for sk_test_*, `wema-bank`
   * for live, `titan-paystack` for some live partners) and the resolution lives
   * in `config.paystack.preferredBank`. Defaulting here would silently send
   * `wema-bank` from any forgetful caller — Paystack rejects that with a 400
   * in test mode and the failure mode is "DVA never sets up locally" which is
   * exactly what bit us before. Pass `config.paystack.preferredBank`.
   */
  async createDedicatedAccount(
    customerCode: string,
    preferredBank: string,
    subaccount?: string,
  ): Promise<CreateDVAResult> {
    if (!preferredBank) {
      throw new AppError(
        500,
        'preferredBank is required for createDedicatedAccount — pass config.paystack.preferredBank',
        'PAYSTACK_CONFIG_ERROR',
      );
    }

    const data = await this.request('POST', '/dedicated_account', {
      customer: customerCode,
      preferred_bank: preferredBank,
      ...(subaccount ? { subaccount } : {}),
    });

    // DVA creation can be synchronous or async depending on Paystack
    const account = data?.dedicated_account || data;

    return {
      accountNumber: account?.account_number || null,
      bankName: account?.bank?.name || null,
      bankId: account?.bank?.id || 0,
    };
  }

  /**
   * Requery a Dedicated Virtual Account to refresh transactions.
   * Useful when webhooks are missed or delayed.
   */
  async requeryDVA(accountNumber: string, providerSlug: string): Promise<RequeryDVAResult> {
    const path = `/dedicated_account/requery?account_number=${encodeURIComponent(accountNumber)}&provider_slug=${encodeURIComponent(providerSlug)}`;
    const data = await this.request<any>('GET', path);

    return {
      accountNumber: data.account_number || accountNumber,
      transactions: data.transactions || [],
    };
  }

  /**
   * Resolve account - name enquiry to verify bank account ownership
   */
  async resolveAccount(accountNumber: string, bankCode: string): Promise<ResolveAccountResult> {
    const data = await this.request(
      'GET',
      `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    );

    return {
      accountNumber: data.account_number,
      accountName: data.account_name,
      bankCode: data.bank_code || bankCode,
    };
  }

  /**
   * Create subaccount for split-settlement
   */
  async createSubaccount(params: CreateSubaccountParams): Promise<CreateSubaccountResult> {
    const data = await this.request('POST', '/subaccount', {
      business_name: params.businessName,
      bank_code: params.bankCode,
      account_number: params.accountNumber,
      percentage_charge: params.percentageCharge,
    });

    return {
      subaccountCode: data.subaccount_code,
    };
  }
}