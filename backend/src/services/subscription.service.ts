/**
 * Subscription Service — WallXERP
 * Handles manual bank transfer payment proof ingestion, database persistence,
 * resilient receipt streaming (Cloudinary / Disk fallback), and email notifications.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { Prisma } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import config from '@/config';
import logger from '@/lib/logger';
import { sendEmail } from '@/lib/email';
import { prisma } from '@/lib/prisma';
import { toNumber } from '@/shared/helpers';
import { AppError } from '@/middleware/errorHandler';
import { emitToAdmins } from '@/services/admin/realtime-admin.helper';

export interface SubmitPaymentProofInput {
  userId?: string;
  businessId?: string;
  name?: string;
  email?: string;
  phone?: string;
  businessName?: string;
  plan: string;
  amount: number | string;
  notes?: string;
  file?: {
    originalname: string;
    buffer: Buffer;
    mimetype: string;
    size: number;
  };
}

export async function processPaymentProof(input: SubmitPaymentProofInput) {
  let subscriberName = input.name;
  let subscriberEmail = input.email;
  let subscriberPhone = input.phone;
  let businessTitle = input.businessName;

  if (input.userId) {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { fullName: true, email: true, phone: true },
    });
    if (user) {
      subscriberName = subscriberName || user.fullName || user.email.split('@')[0];
      subscriberEmail = subscriberEmail || user.email;
      subscriberPhone = subscriberPhone || user.phone || 'Not provided';
    }

    if (!businessTitle && input.businessId) {
      const biz = await prisma.business.findUnique({
        where: { id: input.businessId },
        select: { businessName: true },
      });
      if (biz) businessTitle = biz.businessName;
    } else if (!businessTitle) {
      const biz = await prisma.business.findFirst({
        where: { userId: input.userId },
        select: { businessName: true },
      });
      if (biz) businessTitle = biz.businessName;
    }
  }

  // Graceful fallbacks
  subscriberName = subscriberName || 'Valued Subscriber';
  subscriberPhone = subscriberPhone || 'Not provided';
  businessTitle = businessTitle || 'Not specified';

  if (!subscriberEmail || !subscriberEmail.includes('@')) {
    throw new AppError(
      400,
      'A valid email address is required to process and confirm your subscription proof.',
      'MISSING_FIELDS',
    );
  }

  // Sanitize numeric amount (strip commas from toLocaleString e.g. "5,000")
  const rawAmountStr =
    typeof input.amount === 'string'
      ? input.amount.replace(/,/g, '').trim()
      : String(input.amount || 0);
  const parsedNumericAmount = toNumber(rawAmountStr);

  // Normalize billing cycle
  let billingCycle = 'monthly';
  const planLower = (input.plan || '').toLowerCase();
  if (planLower.includes('annual') || planLower.includes('scale')) {
    billingCycle = 'annual';
  } else if (planLower.includes('quarter') || planLower.includes('business')) {
    billingCycle = 'quarterly';
  }

  logger.info('Processing subscription payment proof', {
    userId: input.userId,
    email: subscriberEmail,
    plan: input.plan,
    billingCycle,
    amount: parsedNumericAmount,
  });

  // Handle receipt storage: Cloudinary stream or Disk fallback
  const submissionId = randomUUID();
  let receiptUrl: string | null = null;
  let receiptPath: string | null = null;
  const originalFileName = input.file?.originalname || 'payment-receipt.jpg';
  const mimeType = input.file?.mimetype || 'image/jpeg';

  if (input.file) {
    const isCloudinaryConfigured = Boolean(
      config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret,
    );

    if (isCloudinaryConfigured) {
      try {
        const uploadResult = await new Promise<{ secure_url: string; public_id: string }>(
          (resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'paymytax/subscriptions/receipts',
                resource_type: 'auto',
              },
              (err, res) => {
                if (err || !res) return reject(err || new Error('Cloudinary returned empty result'));
                resolve({ secure_url: res.secure_url, public_id: res.public_id });
              },
            );
            Readable.from(input.file!.buffer).pipe(uploadStream);
          },
        );
        receiptUrl = uploadResult.secure_url;
      } catch (uploadErr) {
        logger.warn('Cloudinary receipt upload failed, falling back to disk storage', {
          error: uploadErr,
        });
      }
    }

    // Disk fallback if Cloudinary not configured or failed
    if (!receiptUrl) {
      const sanitizedName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const diskFileName = `${submissionId}-${sanitizedName}`;
      const uploadsDir = path.join(process.cwd(), 'uploads', 'receipts');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const targetPath = path.join(uploadsDir, diskFileName);
      fs.writeFileSync(targetPath, input.file.buffer);
      receiptPath = targetPath;
      receiptUrl = `/api/v1/admin/subscriptions/${submissionId}/receipt`;
    }
  }

  // Create submission record in database
  const submission = await prisma.subscriptionSubmission.create({
    data: {
      id: submissionId,
      userId: input.userId || null,
      businessId: input.businessId || null,
      customerName: subscriberName,
      email: subscriberEmail,
      phone: subscriberPhone,
      businessName: businessTitle,
      plan: input.plan,
      billingCycle,
      amount: new Prisma.Decimal(parsedNumericAmount),
      notes: input.notes || null,
      receiptUrl,
      receiptFileName: originalFileName,
      receiptMime: mimeType,
      receiptPath,
      status: 'pending',
    },
  });

  void emitToAdmins({
    type: 'subscription_submitted',
    submissionId: submission.id,
    customerName: subscriberName,
    plan: input.plan,
    amount: parsedNumericAmount,
    timestamp: new Date().toISOString(),
  }).catch((err) =>
    logger.warn('Failed to emit subscription_submitted to admins', { submissionId: submission.id, err })
  );

  const attachments = input.file
    ? [
        {
          filename: input.file.originalname || 'payment-proof.jpg',
          content: input.file.buffer,
          contentType: input.file.mimetype,
        },
      ]
    : undefined;

  // 1. Send notification to subscription@wallx.co
  const adminEmailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #6b21a8; margin-top: 0;">New Subscription Payment Proof Received</h2>
      <p style="color: #374151; font-size: 15px;">A user has submitted proof of payment for a subscription to WallXERP.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Submission ID:</td>
          <td style="padding: 10px 0; color: #111827; font-family: monospace;">${submission.id}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Customer Name:</td>
          <td style="padding: 10px 0; color: #111827;">${subscriberName}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Email Address:</td>
          <td style="padding: 10px 0; color: #111827;"><a href="mailto:${subscriberEmail}">${subscriberEmail}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Phone / WhatsApp:</td>
          <td style="padding: 10px 0; color: #111827;"><a href="tel:${subscriberPhone}">${subscriberPhone}</a></td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Business Name:</td>
          <td style="padding: 10px 0; color: #111827;">${businessTitle}</td>
        </tr>
        ${
          input.userId
            ? `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">User ID:</td>
          <td style="padding: 10px 0; color: #6b7280; font-family: monospace; font-size: 12px;">${input.userId}</td>
        </tr>
        `
            : ''
        }
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Selected Plan:</td>
          <td style="padding: 10px 0; color: #6b21a8; font-weight: bold;">${input.plan} (${billingCycle.toUpperCase()})</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Amount Paid:</td>
          <td style="padding: 10px 0; color: #111827; font-weight: bold;">₦${parsedNumericAmount.toLocaleString()}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Receiving Account:</td>
          <td style="padding: 10px 0; color: #111827;">Zenith Bank Plc — 1214382269 (WallX Africa Limited)</td>
        </tr>
        ${
          input.notes
            ? `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 0; font-weight: bold; color: #4b5563;">Notes / Ref:</td>
          <td style="padding: 10px 0; color: #111827;">${input.notes}</td>
        </tr>
        `
            : ''
        }
      </table>

      <div style="background-color: #f9fafb; padding: 16px; border-radius: 6px; margin-top: 20px; font-size: 13px; color: #6b7280;">
        <p style="margin: 0;">Proof of payment is attached to this email and recorded in the <strong>Admin Subscriptions Desk</strong>. You can verify and activate it directly from the Admin Portal.</p>
      </div>
    </div>
  `;

  await sendEmail({
    to: 'subscription@wallx.co',
    subject: `[Subscription Payment] ${input.plan} Plan - ${businessTitle || subscriberName}`,
    html: adminEmailHtml,
    replyTo: subscriberEmail,
    attachments,
  });

  // 2. Send acknowledgment to the user
  if (subscriberEmail) {
    const userEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #6b21a8; margin-top: 0;">Payment Proof Received!</h2>
        <p style="color: #374151; font-size: 15px;">Hello ${subscriberName},</p>
        <p style="color: #374151; font-size: 15px;">We have received your proof of payment for the <strong>${input.plan} Plan</strong>.</p>
        <p style="color: #374151; font-size: 15px;">Our billing team is currently verifying the transfer to <strong>Zenith Bank Plc (1214382269)</strong>. Your subscription will be activated shortly.</p>
        
        <div style="background-color: #f5f3ff; border: 1px solid #ddd6fe; padding: 16px; border-radius: 6px; margin: 24px 0;">
          <h4 style="margin: 0 0 8px 0; color: #5b21b6;">Need Faster Activation?</h4>
          <p style="margin: 0 0 12px 0; color: #4c1d95; font-size: 14px;">You can notify our priority support team directly on WhatsApp with your proof of payment:</p>
          <a href="https://wa.me/2348147490832?text=Hello%20WallXERP,%20I%20have%20submitted%20proof%20of%20payment%20for%20my%20${encodeURIComponent(
            input.plan,
          )}%20subscription.%20Email:%20${encodeURIComponent(subscriberEmail)}" 
             style="display: inline-block; background-color: #059669; color: white; padding: 10px 18px; border-radius: 9999px; text-decoration: none; font-weight: bold; font-size: 14px;">
            Chat on WhatsApp (+234 814 749 0832)
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">Thank you for choosing WallXERP by WallX Africa.</p>
      </div>
    `;

    void sendEmail({
      to: subscriberEmail,
      subject: `Proof of Payment Received - WallXERP ${input.plan} Plan`,
      html: userEmailHtml,
    })?.catch((err) => {
      logger.warn('Failed to dispatch user subscription confirmation email', { err });
    });
  }

  return {
    delivered: true,
    submissionId: submission.id,
    message:
      'Proof of payment submitted successfully. A confirmation email has been sent and our billing team will activate your subscription shortly.',
  };
}

export async function startFreeTrial(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, subscriptionTier: true, trialEndsAt: true },
  });
  if (!user) throw new AppError(404, 'User not found', 'USER_NOT_FOUND');

  const tier = (user.subscriptionTier || 'free').toLowerCase();
  if (tier !== 'free') {
    throw new AppError(409, 'Only free-tier users can start a trial', 'TRIAL_NOT_AVAILABLE');
  }
  if (user.trialEndsAt && new Date(user.trialEndsAt).getTime() > Date.now()) {
    throw new AppError(409, 'Trial is already active', 'TRIAL_ALREADY_ACTIVE');
  }

  const trialEndsAt = new Date(Date.now() + config.subscription.trialDays * 24 * 60 * 60 * 1000);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { trialEndsAt } });
    await tx.subscriptionSubmission.updateMany({
      where: { userId, status: 'pending' },
      data: { status: 'rejected', rejectionReason: 'User opted for free trial' },
    });
  });

  return { trialEndsAt };
}
