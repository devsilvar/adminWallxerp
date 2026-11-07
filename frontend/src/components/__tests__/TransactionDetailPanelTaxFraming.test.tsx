import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import TransactionDetailPanel, { type TransactionDetailData } from '../TransactionDetailPanel.tsx';

describe('Task 7.3: TransactionDetailPanel Tax Framing Removal vs Sales Neutrality', () => {
  it('displays wallet-centric "Verification Required" copy for dva_inflow', () => {
    const dvaTransaction: TransactionDetailData = {
      id: 'dva-txn-1',
      type: 'dva_inflow',
      amount: 100000,
      status: 'confirmed',
      date: '2026-10-23T10:00:00Z',
      needsVerification: true,
      businessId: 'biz-1',
    };

    render(
      <BrowserRouter>
        <TransactionDetailPanel
          isOpen={true}
          onClose={vi.fn()}
          transaction={dvaTransaction}
        />
      </BrowserRouter>
    );

    // 1. Heading must be "Verification Required"
    expect(screen.getByRole('heading', { name: /verification required/i })).toBeInTheDocument();
    expect(screen.queryByText(/tax revenue review required/i)).not.toBeInTheDocument();

    // 2. Paragraph must contain wallet-centric and advance-neutral copy
    expect(
      screen.getByText(
        /This transfer was captured automatically\. Verify and attach it to a sale when ready\. The advance \(if any\) does not affect sales classification\./i
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/is taxable sales income or non-taxable funds/i)).not.toBeInTheDocument();

    // 3. CTA buttons remain present
    expect(screen.getByRole('button', { name: /go to unverified inflow/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quick confirm sale/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reclassify non-taxable/i })).toBeInTheDocument();
  });

  it('preserves "Tax Revenue Review Required" for sales_transaction (regression check)', () => {
    const salesTransaction: TransactionDetailData = {
      id: 'sale-txn-1',
      type: 'sales_transaction',
      amount: 45000,
      status: 'confirmed',
      date: '2026-10-23T11:00:00Z',
      needsVerification: true,
      businessId: 'biz-1',
    };

    render(
      <BrowserRouter>
        <TransactionDetailPanel
          isOpen={true}
          onClose={vi.fn()}
          transaction={salesTransaction}
        />
      </BrowserRouter>
    );

    // 1. Heading remains "Tax Revenue Review Required" for sales
    expect(screen.getByRole('heading', { name: /tax revenue review required/i })).toBeInTheDocument();

    // 2. Original paragraph remains intact
    expect(
      screen.getByText(
        /This transfer was captured automatically\. Confirm if this is taxable sales income or non-taxable funds/i
      )
    ).toBeInTheDocument();
  });
});
