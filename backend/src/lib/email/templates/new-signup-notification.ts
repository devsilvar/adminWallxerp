/**
 * Internal New Sign-Up Notification Template — WallX ERP
 *
 * Sent to the WallX internal recipient list (config.signupNotifications.recipients)
 * by the signup-notifications cron, roughly five minutes after a merchant
 * registers. Not a customer-facing email — it is an operational heads-up for the
 * growth/support team, so the layout is denser than the customer templates.
 *
 * OWNER CONSTRAINT (binding): This is the ONLY email file changed by the
 * full-name feature. Do NOT touch lib/email/index.ts, email-dispatch.service.ts,
 * or config/index.ts.
 */

import { escapeHtml } from '../escape';

export interface NewSignupNotificationData {
  userEmail: string;
  fullName: string | null;
  phone: string | null;
  userId: string;
  signedUpAt: string;
  acquisitionSource: string | null;
}

function detailRow(label: string, value: string): string {
  return `
                <tr>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px; width: 132px; vertical-align: top;">${label}</td>
                  <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 14px; font-weight: 600; word-break: break-word;">${value}</td>
                </tr>`;
}

/** Subject line helper */
export function generateNewSignupNotificationSubject(data: NewSignupNotificationData): string {
  const name = data.fullName?.trim() || data.userEmail;
  return `New WallX ERP account — ${escapeHtml(name)}`;
}

export function generateNewSignupNotificationHtml(data: NewSignupNotificationData): string {
  const safeFullName = data.fullName?.trim() ? escapeHtml(data.fullName.trim()) : 'Not provided';
  const safeEmail = escapeHtml(data.userEmail);
  const safePhone = data.phone?.trim() ? escapeHtml(data.phone.trim()) : 'Not provided';
  const safeSignedUpAt = escapeHtml(data.signedUpAt);
  const safeAcquisition = data.acquisitionSource?.trim() ? escapeHtml(data.acquisitionSource.trim()) : 'Direct';
  const safeUserId = escapeHtml(data.userId);

  const bannerDisplayName = data.fullName?.trim() ? escapeHtml(data.fullName.trim()) : safeEmail;

  const rows = [
    detailRow('Email', safeEmail),
    detailRow('Full name', safeFullName),
    detailRow('Phone', safePhone),
    detailRow('Signed up', safeSignedUpAt),
    detailRow('Acquisition', safeAcquisition),
    detailRow('User ID', safeUserId),
  ].join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Sign-Up — WallX ERP</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f8fafc; color: #334155;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">

          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; background-color: #0f172a;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700; letter-spacing: -0.5px;">
                WallX ERP
              </h1>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding: 24px 32px; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                New Account Created
              </p>
              <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 20px; font-weight: 800; letter-spacing: -0.4px;">
                ${bannerDisplayName}
              </h2>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 28px 32px 32px;">
              <p style="margin: 0 0 18px; color: #475569; font-size: 14px; line-height: 1.6;">
                A new merchant just registered on <strong>WallX ERP</strong>. Details below.
              </p>

              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                ${rows}
              </table>

              <p style="margin: 24px 0 0; color: #334155; font-size: 13px; line-height: 1.6;">
                — WallX Product
              </p>
              <p style="margin: 8px 0 0; color: #94a3b8; font-size: 11px; line-height: 1.6;">
                You are receiving this because you are on the WallX internal sign-up notification list.
                WallX ERP, Lagos, Nigeria.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

export function generateNewSignupNotificationText(data: NewSignupNotificationData): string {
  const name = data.fullName?.trim() || 'Not provided';
  const phone = data.phone?.trim() || 'Not provided';
  const source = data.acquisitionSource?.trim() || 'Direct';

  return [
    'WALLX ERP — NEW SIGN-UP',
    '',
    `Email: ${data.userEmail}`,
    `Full name: ${name}`,
    `Phone: ${phone}`,
    `Signed up: ${data.signedUpAt}`,
    `Acquisition: ${source}`,
    `User ID: ${data.userId}`,
    '',
    '— WallX Product',
    'You are receiving this because you are on the WallX internal sign-up notification list.',
  ].join('\n');
}
