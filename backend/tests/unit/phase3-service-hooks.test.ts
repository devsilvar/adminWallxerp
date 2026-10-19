import bcrypt from 'bcrypt';
import prisma from '@/lib/prisma';
import { eventBus } from '@/core/events';
import * as emailDispatch from '@/services/email-dispatch.service';
import { adminRejectWithdrawal } from '@/modules/wallet/services/admin-payout.service';
import { toggleUserStatus } from '@/services/admin/admin.service';
import { setupPin, changePin, verifyPin } from '@/services/settlement/pin.service';
import { WalletService } from '@/services/wallet.service';

jest.mock('@/lib/audit', () => ({
  logAudit: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/reminder/reminder-generation.service', () => ({
  createReminderOnce: jest.fn().mockResolvedValue({ created: true }),
}));

describe('Phase 3 — Service Hooks & PIN Lockout Reset Fix', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('adminRejectWithdrawal', () => {
    it('emits payout.failed with isRejection: true after releasing locked funds', async () => {
      jest.spyOn(prisma.settlementPayout, 'findUnique').mockResolvedValue({
        id: 'payout-reject-1',
        businessId: 'biz-1',
        amount: 75000,
        fee: 0,
        status: 'pending',
        transferReference: 'WDR-REJ-001',
        business: { userId: 'user-1' },
      } as any);

      jest.spyOn(prisma.settlementPayout, 'updateMany').mockResolvedValue({ count: 1 });
      jest.spyOn(WalletService, 'releaseLockedFunds').mockResolvedValue(undefined as any);
      const emitSpy = jest.spyOn(eventBus, 'emit');

      const res = await adminRejectWithdrawal('admin-1', 'payout-reject-1', 'Account name mismatch');

      expect(res).toEqual({ id: 'payout-reject-1', status: 'failed' });
      expect(emitSpy).toHaveBeenCalledWith('payout.failed', {
        userId: 'user-1',
        payoutId: 'payout-reject-1',
        amount: 75000,
        reference: 'WDR-REJ-001',
        reason: 'Account name mismatch',
        isRejection: true,
      });
    });
  });

  describe('toggleUserStatus', () => {
    it('dispatches account deactivated email when an active user is deactivated outside a transaction', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-target-1',
        email: 'target@wallx.co',
        role: 'user',
        isActive: true,
      } as any);

      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'user-target-1',
        email: 'target@wallx.co',
        isActive: false,
      } as any);

      const dispatchSpy = jest
        .spyOn(emailDispatch, 'dispatchAccountDeactivatedEmail')
        .mockResolvedValue(undefined);

      await toggleUserStatus('user-target-1', false, 'admin-1', undefined, 'Compliance review');

      expect(dispatchSpy).toHaveBeenCalledWith('user-target-1', 'Compliance review');
    });

    it('does NOT dispatch account deactivated email when activating a user', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-target-1',
        email: 'target@wallx.co',
        role: 'user',
        isActive: false,
      } as any);

      jest.spyOn(prisma.user, 'update').mockResolvedValue({
        id: 'user-target-1',
        email: 'target@wallx.co',
        isActive: true,
      } as any);

      const dispatchSpy = jest
        .spyOn(emailDispatch, 'dispatchAccountDeactivatedEmail')
        .mockResolvedValue(undefined);

      await toggleUserStatus('user-target-1', true, 'admin-1');

      expect(dispatchSpy).not.toHaveBeenCalled();
    });
  });

  describe('PIN Lifecycle & Lockout Bypass via Password', () => {
    beforeEach(() => {
      jest.spyOn(prisma.business, 'count').mockResolvedValue(1);
      jest.spyOn(prisma.businessMember, 'count').mockResolvedValue(0);
    });

    it('dispatches created PIN alert email on setupPin', async () => {
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-pin-1',
        passwordHash: 'hashed-pw',
        transactionPin: null,
      } as any);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'hashed-pin');
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);

      const pinEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchPinAlertEmail')
        .mockResolvedValue(undefined);

      await setupPin('user-pin-1', { pin: '4829', password: 'Password123!' }, '102.89.1.1');

      expect(pinEmailSpy).toHaveBeenCalledWith('user-pin-1', 'created', '102.89.1.1');
    });

    it('dispatches locked PIN alert email when final failed attempt locks PIN in verifyPin', async () => {
      const { config } = await import('@/config');
      const futureWindow = new Date(Date.now() + 30 * 60 * 1000);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-pin-1',
        transactionPin: 'hashed-pin',
        pinAttempts: config.pin.maxAttempts - 1,
        pinLockedUntil: null,
        pinAttemptsResetAt: futureWindow,
      } as any);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => false);
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);

      const pinEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchPinAlertEmail')
        .mockResolvedValue(undefined);

      await expect(verifyPin('user-pin-1', '0000', '102.89.1.2')).rejects.toThrow(/locked/i);
      expect(pinEmailSpy).toHaveBeenCalledWith('user-pin-1', 'locked', '102.89.1.2');
    });

    it('allows resetting a locked PIN using account password and dispatches reset PIN alert email', async () => {
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-pin-1',
        passwordHash: 'hashed-pw',
        transactionPin: 'old-hashed-pin',
        pinAttempts: 3,
        pinLockedUntil: lockedUntil,
        pinAttemptsResetAt: lockedUntil,
      } as any);
      jest.spyOn(bcrypt, 'compare').mockImplementation(async () => true);
      jest.spyOn(bcrypt, 'hash').mockImplementation(async () => 'new-hashed-pin');
      jest.spyOn(prisma.user, 'update').mockResolvedValue({} as any);

      const pinEmailSpy = jest
        .spyOn(emailDispatch, 'dispatchPinAlertEmail')
        .mockResolvedValue(undefined);

      // Should succeed because password is provided even though pinLockedUntil > now
      const res = await changePin(
        'user-pin-1',
        { password: 'Password123!', newPin: '7391' },
        '102.89.1.3'
      );

      expect(res.success).toBe(true);
      expect(pinEmailSpy).toHaveBeenCalledWith('user-pin-1', 'reset', '102.89.1.3');
    });

    it('still blocks changePin when locked if only currentPin is provided (no password)', async () => {
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000);
      jest.spyOn(prisma.user, 'findUnique').mockResolvedValue({
        id: 'user-pin-1',
        passwordHash: 'hashed-pw',
        transactionPin: 'old-hashed-pin',
        pinAttempts: 3,
        pinLockedUntil: lockedUntil,
        pinAttemptsResetAt: lockedUntil,
      } as any);

      await expect(
        changePin('user-pin-1', { currentPin: '1234', newPin: '7391' }, '102.89.1.3')
      ).rejects.toThrow(/temporarily locked/i);
    });
  });
});
