/**
 * Transaction PIN Security Alert Email Template
 *
 * Sent when a user creates, changes, resets, or locks their 4-digit Transaction PIN.
 * Matches the WallX ERP purple design system of Welcome Aboard & Tax Payment Confirmed.
 */

export interface PinAlertEmailData {
  userName: string;
  userEmail: string;
  action: 'created' | 'changed' | 'reset' | 'locked';
  actionDate: string;
  ipAddress?: string;
  securitySettingsLink: string;
}

const PIN_ACTION_META: Record<
  PinAlertEmailData['action'],
  { eyebrow: string; title: string; summary: string }
> = {
  created: {
    eyebrow: 'Transaction PIN Created',
    title: '4-Digit Transaction PIN Activated',
    summary:
      'Your 4-digit Transaction PIN has been set up on WallX ERP. It will now be required to authorize payouts, tax remittances, and sensitive security actions.',
  },
  changed: {
    eyebrow: 'Transaction PIN Changed',
    title: 'Transaction PIN Updated',
    summary:
      'Your 4-digit Transaction PIN was changed using your current PIN in Account Security Settings.',
  },
  reset: {
    eyebrow: 'Transaction PIN Reset',
    title: 'Transaction PIN Reset via Password',
    summary:
      'Your 4-digit Transaction PIN was reset using your account password in Account Security Settings.',
  },
  locked: {
    eyebrow: 'Transaction PIN Locked',
    title: 'Transaction PIN Temporarily Locked',
    summary:
      'Your Transaction PIN has been temporarily locked after multiple incorrect verification attempts. You can reset it at any time from Settings → Security using your account password.',
  },
};

export function generatePinAlertHtml(data: PinAlertEmailData): string {
  const meta = PIN_ACTION_META[data.action];

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${meta.eyebrow} - WallX ERP</title>
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
                ${meta.eyebrow}
              </p>
            </td>
          </tr>

          <!-- Banner -->
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                PIN Security Alert
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">
                ${meta.title}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500;">
                ${data.userEmail}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Hello <strong>${data.userName}</strong>,
              </p>

              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                ${meta.summary}
              </p>

              <!-- Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Account</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.userEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Event</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${meta.eyebrow}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">IP Address</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${data.ipAddress || 'Authenticated Session'}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Date &amp; Time</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.actionDate}</td>
                </tr>
              </table>

              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                <p style="margin: 0; color: #4c1d95; font-size: 13px; line-height: 1.5;">
                  <strong>Security Notice:</strong> Never share your 4-digit Transaction PIN with anyone. WallX ERP staff will never ask for your PIN.
                </p>
              </div>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 4px 0 8px;">
                    <a href="${data.securitySettingsLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Manage PIN &amp; Security &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0 0 6px; color: #64748b; font-size: 12px;">
                WallX ERP • Nigeria SME Business Management & Tax Compliance
              </p>
              <p style="margin: 0; color: #94a3b8; font-size: 11px;">
                Need assistance? Contact <a href="mailto:support@wallxerp.com" style="color: #7c3aed; text-decoration: none; font-weight: 500;">support@wallxerp.com</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export function generatePinAlertText(data: PinAlertEmailData): string {
  const meta = PIN_ACTION_META[data.action];
  return `
WALLX ERP - ${meta.eyebrow.toUpperCase()}
==================================================

Hello ${data.userName},

${meta.summary}

DETAILS:
- Account: ${data.userEmail}
- Event: ${meta.eyebrow}
- IP Address: ${data.ipAddress || 'Authenticated Session'}
- Date & Time: ${data.actionDate}

Manage your PIN & security settings:
${data.securitySettingsLink}

---
WallX ERP • Nigeria SME Business Management & Tax Compliance
support@wallxerp.com
  `.trim();
}
