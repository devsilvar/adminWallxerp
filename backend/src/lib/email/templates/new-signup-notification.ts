/**
 * Internal New Sign-Up Notification Template
 *
 * Sent to the WallX internal recipient list (config.signupNotifications.recipients)
 * by the signup-notifications cron, roughly five minutes after a merchant
 * registers. Not a customer-facing email — it is an operational heads-up for the
 * growth/support team, so the layout is denser than the customer templates.
 */

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

export function generateNewSignupNotificationHtml(data: NewSignupNotificationData): string {
  const rows = [
    detailRow('Email', data.userEmail),
    detailRow('Full name', data.fullName ?? 'Not provided'),
    detailRow('Phone', data.phone ?? 'Not provided'),
    detailRow('Signed up', data.signedUpAt),
    detailRow('Acquisition', data.acquisitionSource ?? 'Direct'),
    detailRow('User ID', data.userId),
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
              <p style="margin: 6px 0 0; color: #c084fc; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Internal Sign-Up Alert
              </p>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding: 24px 32px; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                New Account Created
              </p>
              <h2 style="margin: 6px 0 0; color: #0f172a; font-size: 20px; font-weight: 800; letter-spacing: -0.4px;">
                ${data.userEmail}
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

              <p style="margin: 24px 0 0; color: #94a3b8; font-size: 12px; line-height: 1.6;">
                Automated message from the sign-up notification job. Sent roughly five minutes after registration.
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
  return [
    'WALLX ERP — NEW SIGN-UP',
    '',
    `Email: ${data.userEmail}`,
    `Full name: ${data.fullName ?? 'Not provided'}`,
    `Phone: ${data.phone ?? 'Not provided'}`,
    `Signed up: ${data.signedUpAt}`,
    `Acquisition: ${data.acquisitionSource ?? 'Direct'}`,
    `User ID: ${data.userId}`,
    '',
    'Automated message from the sign-up notification job.',
  ].join('\n');
}
