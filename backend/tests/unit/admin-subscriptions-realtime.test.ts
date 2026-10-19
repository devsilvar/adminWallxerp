import { describe, test, expect, jest, beforeEach } from '@jest/globals';

const mockEmitToAdmins = jest.fn();
jest.mock('../../src/services/admin/realtime-admin.helper', () => ({
  emitToAdmins: mockEmitToAdmins,
}));

const mockSendEmail = jest.fn();
jest.mock('../../src/lib/email', () => ({
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

jest.mock('../../src/services/email-dispatch.service', () => ({
  dispatchSubscriptionApprovedEmail: jest.fn<any>().mockResolvedValue(undefined),
  dispatchSubscriptionRejectedEmail: jest.fn<any>().mockResolvedValue(undefined),
  dispatchAccountDeactivatedEmail: jest.fn<any>().mockResolvedValue(undefined),
}));

import { processPaymentProof } from '@/services/subscription.service';
import { approveSubscription, rejectSubscription } from '@/services/admin/admin.service';
import prisma from '@/lib/prisma';
import * as auditModule from '@/lib/audit';

describe('Admin Subscriptions Realtime SSE Unit Suite (Step 5)', () => {
  const mockAdminId = 'usr-admin-sub-001';
  const mockUserId = 'usr-client-sub-001';
  const mockSubmissionId = 'sub-proof-sse-999';

  beforeEach(() => {
    jest.resetAllMocks();
    mockEmitToAdmins.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue({ id: 'mock-email-id' });
    jest.spyOn(auditModule, 'logAudit').mockReturnValue(undefined as any);
  });

  describe('processPaymentProof (SME payment proof submission -> emitToAdmins subscription_submitted)', () => {
    test('emits subscription_submitted to admins upon successful proof creation', async () => {
      const mockCreatedSubmission = {
        id: mockSubmissionId,
        userId: mockUserId,
        customerName: 'Adebayo Stores',
        plan: 'Starter',
        amount: 5000,
        status: 'pending',
        email: 'adebayo@example.com',
      };

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: mockUserId,
        fullName: 'Adebayo Ogunlesi',
        email: 'adebayo@example.com',
        phone: '08012345678',
      } as any);

      jest.spyOn(prisma.subscriptionSubmission, 'create').mockResolvedValue(mockCreatedSubmission as any);

      const input = {
        userId: mockUserId,
        name: 'Adebayo Ogunlesi',
        email: 'adebayo@example.com',
        phone: '08012345678',
        businessName: 'Adebayo Stores',
        plan: 'Starter',
        amount: 5000,
        notes: 'Bank transfer Zenith Bank',
      };

      const result = await processPaymentProof(input);

      expect(result.delivered).toBe(true);
      expect(result.submissionId).toBe(mockSubmissionId);

      expect(mockEmitToAdmins).toHaveBeenCalledTimes(1);
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription_submitted',
          submissionId: mockSubmissionId,
          customerName: 'Adebayo Ogunlesi',
          plan: 'Starter',
          amount: 5000,
        })
      );
    });

    test('adversarial: missing email throws AppError 400 and suppresses admin emission', async () => {
      const invalidInput = {
        name: 'No Email User',
        plan: 'Growth',
        amount: 15000,
      };

      await expect(processPaymentProof(invalidInput as any)).rejects.toThrow();
      expect(mockEmitToAdmins).not.toHaveBeenCalled();
    });

    test('adversarial: SSE emitToAdmins rejection does not fail payment proof submission', async () => {
      mockEmitToAdmins.mockRejectedValue(new Error('SSE connection failure'));

      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue(null as any);
      jest.spyOn(prisma.subscriptionSubmission, 'create').mockResolvedValue({
        id: mockSubmissionId,
        customerName: 'Resilient Merchant',
        plan: 'Growth',
        amount: 15000,
      } as any);

      const input = {
        name: 'Resilient Merchant',
        email: 'resilient@example.com',
        plan: 'Growth',
        amount: '15,000',
      };

      const result = await processPaymentProof(input);
      expect(result.delivered).toBe(true);
      expect(mockEmitToAdmins).toHaveBeenCalled();
    });
  });

  describe('approveSubscription (Admin approval -> emitToAdmins subscription_status_changed approved)', () => {
    test('emits subscription_status_changed with status: approved to admins upon approval', async () => {
      const mockSubmission = {
        id: mockSubmissionId,
        userId: mockUserId,
        customerName: 'Adebayo Ogunlesi',
        email: 'adebayo@example.com',
        plan: 'Growth',
        billingCycle: 'monthly',
        amount: 15000,
        status: 'pending',
        user: {
          id: mockUserId,
          subscriptionTier: 'free',
          subscriptionExpiresAt: null,
        },
      };

      const mockUpdatedSubmission = {
        ...mockSubmission,
        status: 'approved',
        reviewedBy: mockAdminId,
      };

      jest.spyOn(prisma.subscriptionSubmission, 'findUnique').mockResolvedValue(mockSubmission as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          subscriptionSubmission: {
            update: jest.fn<any>().mockResolvedValue(mockUpdatedSubmission),
          },
          user: {
            update: jest.fn<any>().mockResolvedValue({ id: mockUserId }),
          },
        };
        return callback(tx);
      });

      const res = await approveSubscription(mockSubmissionId, mockAdminId, {
        tier: 'growth',
        durationDays: 30,
      });

      expect(res.status).toBe('approved');
      expect(mockEmitToAdmins).toHaveBeenCalledTimes(1);
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription_status_changed',
          submissionId: mockSubmissionId,
          status: 'approved',
          plan: 'Growth',
        })
      );
    });

    test('adversarial: cannot approve an already approved subscription (409 ALREADY_APPROVED) and does not emit', async () => {
      const alreadyApproved = {
        id: mockSubmissionId,
        status: 'approved',
        plan: 'Growth',
      };

      jest.spyOn(prisma.subscriptionSubmission, 'findUnique').mockResolvedValue(alreadyApproved as any);

      await expect(
        approveSubscription(mockSubmissionId, mockAdminId, { tier: 'growth' })
      ).rejects.toThrow();

      expect(mockEmitToAdmins).not.toHaveBeenCalled();
    });

    test('adversarial: SSE emitToAdmins rejection does not fail subscription approval transaction', async () => {
      mockEmitToAdmins.mockRejectedValue(new Error('SSE network disconnect'));

      const mockSubmission = {
        id: mockSubmissionId,
        userId: mockUserId,
        customerName: 'Adebayo Ogunlesi',
        email: 'adebayo@example.com',
        plan: 'Starter',
        billingCycle: 'monthly',
        amount: 5000,
        status: 'pending',
        user: { id: mockUserId, subscriptionTier: 'free' },
      };

      jest.spyOn(prisma.subscriptionSubmission, 'findUnique').mockResolvedValue(mockSubmission as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          subscriptionSubmission: { update: jest.fn<any>().mockResolvedValue({ ...mockSubmission, status: 'approved' }) },
          user: { update: jest.fn<any>().mockResolvedValue({ id: mockUserId }) },
        };
        return callback(tx);
      });

      const res = await approveSubscription(mockSubmissionId, mockAdminId, { tier: 'starter' });
      expect(res.status).toBe('approved');
      expect(mockEmitToAdmins).toHaveBeenCalled();
    });
  });

  describe('rejectSubscription (Admin rejection -> emitToAdmins subscription_status_changed rejected)', () => {
    test('emits subscription_status_changed with status: rejected to admins upon rejection', async () => {
      const mockSubmission = {
        id: mockSubmissionId,
        customerName: 'Suspicious Submitter',
        email: 'suspicious@example.com',
        plan: 'Enterprise',
        amount: 100000,
        status: 'pending',
      };

      const mockUpdatedSubmission = {
        ...mockSubmission,
        status: 'rejected',
        rejectionReason: 'Invalid transfer receipt with mismatched sender name',
        reviewedBy: mockAdminId,
      };

      jest.spyOn(prisma.subscriptionSubmission, 'findUnique').mockResolvedValue(mockSubmission as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          subscriptionSubmission: {
            update: jest.fn<any>().mockResolvedValue(mockUpdatedSubmission),
          },
        };
        return callback(tx);
      });

      const res = await rejectSubscription(
        mockSubmissionId,
        mockAdminId,
        'Invalid transfer receipt with mismatched sender name'
      );

      expect(res.status).toBe('rejected');
      expect(mockEmitToAdmins).toHaveBeenCalledTimes(1);
      expect(mockEmitToAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'subscription_status_changed',
          submissionId: mockSubmissionId,
          status: 'rejected',
          plan: 'Enterprise',
        })
      );
    });

    test('adversarial: cannot reject an already approved subscription (409 ALREADY_APPROVED) and does not emit', async () => {
      const approvedSubmission = {
        id: mockSubmissionId,
        status: 'approved',
        plan: 'Growth',
      };

      jest.spyOn(prisma.subscriptionSubmission, 'findUnique').mockResolvedValue(approvedSubmission as any);

      await expect(
        rejectSubscription(mockSubmissionId, mockAdminId, 'Late rejection attempt')
      ).rejects.toThrow();

      expect(mockEmitToAdmins).not.toHaveBeenCalled();
    });

    test('adversarial: SSE emitToAdmins rejection does not fail subscription rejection transaction', async () => {
      mockEmitToAdmins.mockRejectedValue(new Error('SSE network disconnect'));

      const mockSubmission = {
        id: mockSubmissionId,
        customerName: 'Tester',
        email: 'test@example.com',
        plan: 'Starter',
        status: 'pending',
      };

      jest.spyOn(prisma.subscriptionSubmission, 'findUnique').mockResolvedValue(mockSubmission as any);
      jest.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) => {
        const tx = {
          subscriptionSubmission: { update: jest.fn<any>().mockResolvedValue({ ...mockSubmission, status: 'rejected' }) },
        };
        return callback(tx);
      });

      const res = await rejectSubscription(mockSubmissionId, mockAdminId, 'Receipt illegible');
      expect(res.status).toBe('rejected');
      expect(mockEmitToAdmins).toHaveBeenCalled();
    });
  });
});
