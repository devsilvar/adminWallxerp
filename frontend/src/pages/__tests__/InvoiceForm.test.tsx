import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InvoiceForm from '../InvoiceForm.tsx';
import api from '@/lib/axios.ts';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useInvoiceStore } from '@/stores/invoice.store.ts';
import type { Business, Invoice } from '@/types/index.ts';

const mockBiz: Partial<Business> = {
  id: 'biz-test-123',
  businessName: 'Acme Enterprises',
  currency: 'NGN',
  role: 'owner',
};

describe('InvoiceForm - Tax Policy Enforcement (TAX-07 / Phase 4)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useBusinessStore.setState({
      activeBusiness: mockBiz as Business,
      businesses: [mockBiz as Business],
    });
  });

  it('disables VAT input, sets value to 0, and displays exemption reason when business is VAT exempt', async () => {
    const apiGetSpy = vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/tax-policy')) {
        return {
          data: {
            data: {
              source: 'PROFILE',
              vat: {
                chargeable: false,
                rate: 0,
                reason: 'VAT exempt — small company turnover under ₦25M',
              },
              incomeTax: { type: 'CIT', rate: 0, devLevyRate: 0 },
            },
          },
        } as any;
      }
      return { data: { data: null } } as any;
    });

    render(
      <MemoryRouter initialEntries={['/invoices/new']}>
        <Routes>
          <Route path="/invoices/new" element={<InvoiceForm />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(apiGetSpy).toHaveBeenCalledWith('/businesses/biz-test-123/tax-policy');
    });

    const vatInput = await screen.findByLabelText(/VAT Rate \(%\)/i) as HTMLInputElement;
    expect(vatInput).toBeDisabled();
    expect(vatInput.value).toBe('0');

    expect(
      screen.getByText('VAT exempt — small company turnover under ₦25M')
    ).toBeInTheDocument();
  });

  it('keeps VAT input enabled, seeds rate from policy, and does not show exemption reason when VAT is chargeable', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/tax-policy')) {
        return {
          data: {
            data: {
              source: 'PROFILE',
              vat: {
                chargeable: true,
                rate: 7.5,
                reason: null,
              },
              incomeTax: { type: 'CIT', rate: 30, devLevyRate: 4 },
            },
          },
        } as any;
      }
      return { data: { data: null } } as any;
    });

    render(
      <MemoryRouter initialEntries={['/invoices/new']}>
        <Routes>
          <Route path="/invoices/new" element={<InvoiceForm />} />
        </Routes>
      </MemoryRouter>
    );

    const vatInput = await screen.findByLabelText(/VAT Rate \(%\)/i) as HTMLInputElement;
    await waitFor(() => {
      expect(vatInput.value).toBe('7.5');
    });

    expect(vatInput).not.toBeDisabled();
    expect(screen.queryByText(/VAT exempt/i)).toBeNull();
  });

  it('defaults to 7.5 and leaves input enabled when tax-policy request fails', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/tax-policy')) {
        throw new Error('Network error');
      }
      return { data: { data: null } } as any;
    });

    render(
      <MemoryRouter initialEntries={['/invoices/new']}>
        <Routes>
          <Route path="/invoices/new" element={<InvoiceForm />} />
        </Routes>
      </MemoryRouter>
    );

    const vatInput = await screen.findByLabelText(/VAT Rate \(%\)/i) as HTMLInputElement;
    expect(vatInput).not.toBeDisabled();
    expect(vatInput.value).toBe('7.5');
    expect(screen.queryByText(/VAT exempt/i)).toBeNull();
  });

  it('retains stored invoice VAT rate in edit mode even if policy indicates exempt', async () => {
    const mockInvoice: Partial<Invoice> = {
      id: 'inv-123',
      invoiceNumber: 'INV-001',
      status: 'draft',
      customerName: 'Test Client',
      customerEmail: 'test@example.com',
      issueDate: '2026-03-01T00:00:00.000Z',
      dueDate: '2026-03-15T00:00:00.000Z',
      vatRate: 7.5,
      discount: 0,
      lines: [
        {
          id: 'line-1',
          invoiceId: 'inv-123',
          description: 'Consulting Service',
          quantity: 1,
          unitPrice: 100000,
          amount: 100000,
        },
      ],
    };

    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/tax-policy')) {
        return {
          data: {
            data: {
              source: 'PROFILE',
              vat: {
                chargeable: false,
                rate: 0,
                reason: 'VAT exempt — turnover under ₦25M',
              },
              incomeTax: { type: 'CIT', rate: 0, devLevyRate: 0 },
            },
          },
        } as any;
      }
      return { data: { data: null } } as any;
    });

    vi.spyOn(useInvoiceStore.getState(), 'fetchInvoice').mockResolvedValue(mockInvoice as Invoice);

    const updateInvoiceSpy = vi
      .spyOn(useInvoiceStore.getState(), 'updateInvoice')
      .mockResolvedValue({ id: 'inv-123' } as any);

    render(
      <MemoryRouter initialEntries={['/invoices/inv-123/edit']}>
        <Routes>
          <Route path="/invoices/:id/edit" element={<InvoiceForm />} />
        </Routes>
      </MemoryRouter>
    );

    // In edit mode, stored invoice has vatRate 7.5
    await waitFor(() => {
      const customerInput = screen.getByDisplayValue('Test Client');
      expect(customerInput).toBeInTheDocument();
    });

    const vatInput = screen.getByLabelText(/VAT Rate \(%\)/i) as HTMLInputElement;
    expect(vatInput.value).toBe('7.5');

    // The edit must reach the API carrying the stored rate, not a zeroed one
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(updateInvoiceSpy).toHaveBeenCalledTimes(1);
    });

    const payload = updateInvoiceSpy.mock.calls[0][2];
    expect(payload.vatRate).toBe(7.5);
  });

  it('computes 0 VAT amount and sends vatRate 0 on submit when VAT is disabled', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/tax-policy')) {
        return {
          data: {
            data: {
              source: 'PROFILE',
              vat: {
                chargeable: false,
                rate: 0,
                reason: 'VAT exempt — turnover under ₦25M',
              },
              incomeTax: { type: 'CIT', rate: 0, devLevyRate: 0 },
            },
          },
        } as any;
      }
      return { data: { data: null } } as any;
    });

    const createInvoiceSpy = vi.spyOn(useInvoiceStore.getState(), 'createInvoice').mockResolvedValue({
      id: 'inv-new',
      invoiceNumber: 'INV-NEW-001',
    } as any);

    render(
      <MemoryRouter initialEntries={['/invoices/new']}>
        <Routes>
          <Route path="/invoices/new" element={<InvoiceForm />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/VAT exempt/i)).toBeInTheDocument();
    });

    // Fill customer name
    const customerInput = screen.getByLabelText(/Customer Name/i);
    fireEvent.change(customerInput, { target: { value: 'Customer A' } });

    // Fill line item: quantity 2, price 50000 -> subtotal 100,000
    const descInput = screen.getByPlaceholderText(/Consulting services/i);
    fireEvent.change(descInput, { target: { value: 'Widgets' } });

    const priceInput = screen.getByLabelText(/Unit price/i);
    fireEvent.change(priceInput, { target: { value: '50000' } });

    const qtyInput = screen.getByDisplayValue('1');
    fireEvent.change(qtyInput, { target: { value: '2' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Create as draft/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createInvoiceSpy).toHaveBeenCalledTimes(1);
    });

    const payload = createInvoiceSpy.mock.calls[0][1];
    expect(payload.customerName).toBe('Customer A');
    expect(payload.vatRate).toBe(0);
    expect(payload.lines[0]).toEqual({
      description: 'Widgets',
      quantity: 2,
      unitPrice: 50000,
    });
  });
});
