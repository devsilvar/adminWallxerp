import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TaxAssessmentModal from '../TaxAssessmentModal.tsx';
import TaxProfileCard from '../TaxProfileCard.tsx';
import api from '@/lib/axios.ts';

// Mock API
vi.mock('@/lib/axios.ts', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getErrorMessage: (err: any) => err?.message || 'Error occurred',
}));

// Mock toast
vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock useSubscriptionStatus
vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => ({
    canWrite: true,
    expiresAt: null,
  }),
}));

describe('Tax Assessment Wizard & Profile Card (NTA 2025)', () => {
  const businessId = 'biz-test-123';
  const businessName = 'Acme Trading Ventures';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TaxAssessmentModal', () => {
    it('renders Step 1 (Legal Structure) with options and legal context', () => {
      render(
        <TaxAssessmentModal
          isOpen={true}
          onClose={vi.fn()}
          businessId={businessId}
          businessName={businessName}
        />
      );

      expect(screen.getByText(/Statutory Tax Profile Assessment/i)).toBeInTheDocument();
      expect(screen.getByText(/Question 1 of 10/i)).toBeInTheDocument();
      expect(screen.getByText(/How is your business registered in Nigeria\?/i)).toBeInTheDocument();
      expect(screen.getByText(/Limited Liability Company \(LTD \/ LLC\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Registered Business Name/i)).toBeInTheDocument();
    });

    it('navigates through questions on clicking Next', async () => {
      render(
        <TaxAssessmentModal
          isOpen={true}
          onClose={vi.fn()}
          businessId={businessId}
          businessName={businessName}
        />
      );

      // Question 1 -> Question 2
      const nextBtn = screen.getByRole('button', { name: /next/i });
      fireEvent.click(nextBtn);

      await waitFor(() => {
        expect(screen.getByText(/Question 2 of 10/i)).toBeInTheDocument();
        expect(screen.getByText(/What is your estimated annual turnover/i)).toBeInTheDocument();
      });
    });

    it('evaluates answers and posts to backend API on completion', async () => {
      (api.post as any).mockResolvedValue({
        data: {
          success: true,
          data: {
            id: 'prof-123',
            businessId,
          },
        },
      });

      render(
        <TaxAssessmentModal
          isOpen={true}
          onClose={vi.fn()}
          businessId={businessId}
          businessName={businessName}
        />
      );

      // Navigate to Question 10
      for (let i = 1; i < 10; i++) {
        fireEvent.click(screen.getByRole('button', { name: /next/i }));
      }

      await waitFor(() => {
        expect(screen.getByText(/Question 10 of 10/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /submit & evaluate/i })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /submit & evaluate/i }));

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith(`/businesses/${businessId}/tax-profile`, expect.any(Object));
        expect(screen.getByText(/Tax Profile Assessment Complete/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
      });
    });
  });

  describe('TaxProfileCard', () => {
    it('renders call-to-action prompt when business has not taken assessment', async () => {
      (api.get as any).mockResolvedValue({
        data: {
          data: null,
        },
      });

      render(<TaxProfileCard businessId={businessId} businessName={businessName} />);

      await waitFor(() => {
        expect(screen.getByText(/Statutory Tax Assessment \(NTA 2025\)/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /start 2-min assessment/i })).toBeInTheDocument();
      });
    });

    it('renders statutory status chips and download button when profile exists', async () => {
      (api.get as any).mockResolvedValue({
        data: {
          data: {
            id: 'prof-123',
            businessId,
            completedAt: '2026-10-24T12:00:00Z',
            needsManualReview: false,
            reviewReasons: [],
            quizAnswers: {
              legalStructure: 'LLC',
              annualTurnover: 'UNDER_25M',
              fixedAssetsValue: 'UNDER_250M',
              businessType: 'STANDARD',
            },
            computedConfig: {
              vatExempt: true,
              mustChargeVat: false,
              isCorporate: true,
              incomeTaxType: 'CIT',
              citRate: 0,
              devLevyRate: 0,
              mustDeductPAYE: false,
              primaryTaxAuthority: 'NRS_FEDERAL',
            },
          },
        },
      });

      render(<TaxProfileCard businessId={businessId} businessName={businessName} />);

      await waitFor(() => {
        expect(screen.getByText(/Tax Profile & Statutory Classification/i)).toBeInTheDocument();
        expect(screen.getByText(/0% Small Company CIT/i)).toBeInTheDocument();
        expect(screen.getByText(/Exempt \(< ₦25M\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Federal NRS/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /download pdf report/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /retake quiz/i })).toBeInTheDocument();
      });
    });
  });
});
