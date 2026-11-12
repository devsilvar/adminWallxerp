import crypto from 'crypto';
import config from '@/config';
import prisma from '@/lib/prisma';
import { AppError } from '@/middleware/errorHandler';
import { AccountCodePurpose, Prisma } from '@prisma/client';

export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

/**
 * Generates a cryptographically secure 6-digit decimal code.
 */
export function generateCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Six digits is one million possibilities — a plain hash is reversible
 * in seconds from a database dump. The pepper is the only thing making
 * the stored value safe.
 */
export function hashCode(userId: string, purpose: AccountCodePurpose, code: string): string {
  return crypto
    .createHmac('sha256', config.security.otpPepper)
    .update(`${userId}:${purpose}:${code}`)
    .digest('hex');
}

/**
 * Issues a single active one-time security code for an account holder.
 * Automatically expires any earlier unconsumed codes for this purpose.
 */
export async function issueCode(
  userId: string,
  purpose: AccountCodePurpose,
  ip?: string
): Promise<{ code: string; expiresAt: Date }> {
  const now = new Date();

  // Expire any existing unconsumed codes for this user and purpose
  await prisma.accountSecurityCode.updateMany({
    where: {
      userId,
      purpose,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: {
      expiresAt: now,
    },
  });

  const code = generateCode();
  const codeHash = hashCode(userId, purpose, code);
  const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);

  await prisma.accountSecurityCode.create({
    data: {
      userId,
      purpose,
      codeHash,
      expiresAt,
      requestedIp: ip,
    },
  });

  return { code, expiresAt };
}

/**
 * Verifies a 6-digit candidate code against the latest unconsumed record.
 * Uses timingSafeEqual to avoid timing side-channels.
 * Enforces attempt limits (max 5) and marks consumedAt upon match.
 */
export async function verifyCode(
  userId: string,
  purpose: AccountCodePurpose,
  code: string
): Promise<{ codeId: string }> {
  const now = new Date();

  const record = await prisma.accountSecurityCode.findFirst({
    where: {
      userId,
      purpose,
      consumedAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  if (!record || record.expiresAt < now) {
    throw new AppError(400, 'Code expired. Request a new one.', 'CODE_EXPIRED');
  }

  if (record.attempts >= MAX_CODE_ATTEMPTS) {
    throw new AppError(429, 'Too many attempts. Request a new code.', 'CODE_ATTEMPTS_EXCEEDED');
  }

  const expectedHash = record.codeHash;
  const candidateHash = hashCode(userId, purpose, code);

  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const candidateBuf = Buffer.from(candidateHash, 'hex');

  const isMatch =
    expectedBuf.length === candidateBuf.length &&
    crypto.timingSafeEqual(expectedBuf, candidateBuf);

  if (!isMatch) {
    const updatedAttempts = record.attempts + 1;
    await prisma.accountSecurityCode.update({
      where: { id: record.id },
      data: { attempts: updatedAttempts },
    });

    const remainingAttempts = Math.max(0, MAX_CODE_ATTEMPTS - updatedAttempts);
    if (remainingAttempts === 0) {
      throw new AppError(429, 'Too many attempts. Request a new code.', 'CODE_ATTEMPTS_EXCEEDED');
    }

    throw new AppError(400, 'Incorrect code', 'INVALID_CODE', { remainingAttempts });
  }

  await prisma.accountSecurityCode.update({
    where: { id: record.id },
    data: { consumedAt: now },
  });

  return { codeId: record.id };
}

/**
 * Marks a verified code ticket as used. Enforces single-use consumption
 * within the valid TTL window.
 */
export async function consumeCode(
  codeId: string,
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const now = new Date();

  const record = await client.accountSecurityCode.findUnique({
    where: { id: codeId },
  });

  if (
    !record ||
    record.userId !== userId ||
    !record.consumedAt ||
    record.usedAt !== null ||
    now.getTime() - record.consumedAt.getTime() > CODE_TTL_MINUTES * 60 * 1000
  ) {
    throw new AppError(400, 'Verification expired. Start again.', 'CODE_VERIFICATION_EXPIRED');
  }

  await client.accountSecurityCode.update({
    where: { id: record.id },
    data: { usedAt: now },
  });
}
