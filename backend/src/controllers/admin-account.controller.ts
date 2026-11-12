import { Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { asyncHandler } from '@/middleware/errorHandler';
import { AuthenticatedRequest } from '@/types';
import { config } from '@/config';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';
import { AppError } from '@/middleware/errorHandler';
import { BCRYPT_ROUNDS } from '@/services/auth/auth.service';
import {
  issueCode,
  verifyCode,
  consumeCode,
} from '@/services/auth/account-code.service';
import {
  dispatchAdminPasswordCodeEmail,
  dispatchPasswordChangedEmail,
} from '@/services/email-dispatch.service';
import {
  adminVerifyPasswordCodeSchema,
  adminCompletePasswordChangeSchema,
} from '@/validators/admin-account.validator';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * Initiates an admin password change by dispatching a 6-digit one-time code
 * to the verified administrator email.
 */
export const requestPasswordCode = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user?.email) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const { code, expiresAt } = await issueCode(
      userId,
      'admin_password_change',
      req.ip
    );

    const dispatchResult = await dispatchAdminPasswordCodeEmail(userId, code, {
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    await logAudit({
      userId,
      action: 'admin.password_code_requested',
      resourceType: 'user',
      resourceId: userId,
      newData: {
        purpose: 'admin_password_change',
        requestIp: req.ip,
        expiresAt: expiresAt.toISOString(),
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    // SECURITY: The code is NEVER exposed in the HTTP response.
    res.status(200).json({
      success: true,
      data: {
        emailHint: maskEmail(user.email),
        expiresInMinutes: 10,
        delivered: dispatchResult.delivered,
      },
      message: 'Verification code sent to registered admin email',
    });
  }
);

/**
 * Validates the one-time code and issues a signed, short-lived change ticket JWT.
 */
export const verifyPasswordCode = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const { code } = adminVerifyPasswordCodeSchema.parse(req.body);

    const { codeId } = await verifyCode(userId, 'admin_password_change', code);

    const changeTicket = jwt.sign(
      {
        sub: userId,
        purpose: 'admin_password_change',
        jti: codeId,
      },
      config.jwt.accessSecret,
      { expiresIn: '10m' }
    );

    await logAudit({
      userId,
      action: 'admin.password_code_verified',
      resourceType: 'user',
      resourceId: userId,
      newData: { codeId },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    res.status(200).json({
      success: true,
      data: { changeTicket },
      message: 'Code verified successfully',
    });
  }
);

/**
 * Consumes the single-use change ticket, hashes the new password outside
 * the transaction, revokes all active sessions, and updates passwordHash.
 */
export const completePasswordChange = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.userId;
    const { changeTicket, newPassword } = adminCompletePasswordChangeSchema.parse(req.body);

    let decoded: any;
    try {
      decoded = jwt.verify(changeTicket, config.jwt.accessSecret);
    } catch {
      throw new AppError(401, 'Invalid or expired change ticket', 'INVALID_TICKET');
    }

    if (
      !decoded ||
      decoded.purpose !== 'admin_password_change' ||
      decoded.sub !== userId ||
      !decoded.jti
    ) {
      throw new AppError(401, 'Invalid or expired change ticket', 'INVALID_TICKET');
    }

    // Single-use token consumption check
    await consumeCode(decoded.jti, userId);

    // CRITICAL: Hash password BEFORE the database transaction to prevent locking connection poolers
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    const sessionsRevoked = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash },
      });

      const updateRes = await tx.session.updateMany({
        where: { userId, isRevoked: false },
        data: { isRevoked: true },
      });

      await logAudit(
        {
          userId,
          action: 'admin.password_changed',
          resourceType: 'user',
          resourceId: userId,
          newData: {
            method: 'email_code',
            sessionsRevoked: updateRes.count,
          },
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
        tx
      );

      return updateRes.count;
    });

    // Notify user of completed change asynchronously
    void dispatchPasswordChangedEmail(userId, 'changed');

    res.status(200).json({
      success: true,
      data: {
        signedOut: true,
        sessionsRevoked,
      },
      message: 'Password changed. Please sign in again.',
    });
  }
);
