/**
 * Team Invitation Email Template
 *
 * Sent when a business owner or manager invites a user to join their business team.
 *
 * @author WallX Engineering Team
 */

import { escapeHtml } from '../escape';

export interface TeamInvitationEmailData {
  inviteeEmail: string;
  businessName: string;
  inviterName: string;
  role: string;
  inviteLink: string;
  expiresInDays: number;
  existingAccount?: boolean;
}

function formatRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    manager: 'Manager',
    sales_staff: 'Sales Staff',
    accountant: 'Accountant',
    viewer: 'Viewer',
  };
  return labels[role] || role;
}

export function generateTeamInvitationHtml(data: TeamInvitationEmailData): string {
  const roleLabel = formatRoleLabel(data.role);
  const safeBusinessName = escapeHtml(data.businessName);
  const safeInviterName = escapeHtml(data.inviterName);
  const safeRoleLabel = escapeHtml(roleLabel);

  const ctaInstruction = data.existingAccount
    ? 'Sign in to your existing WallX ERP account and click below to join.'
    : 'Click the button below to accept the invitation and start collaborating.';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to Join ${safeBusinessName}</title>
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
                Team Invitation
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px 32px;">
              <p style="margin: 0 0 20px; color: #0f172a; font-size: 16px; font-weight: 600; line-height: 1.5;">
                Hi there,
              </p>

              <p style="margin: 0 0 20px; color: #334155; font-size: 15px; line-height: 1.6;">
                <strong>${safeInviterName}</strong> has invited you to join
                <strong>${safeBusinessName}</strong> on <strong>WallX ERP</strong>
                as a <strong style="color: #7c3aed;">${safeRoleLabel}</strong>.
              </p>

              <p style="margin: 0 0 24px; color: #334155; font-size: 15px; line-height: 1.6;">
                ${ctaInstruction}
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 12px 0 28px;">
                    <a href="${data.inviteLink}"
                       style="display: inline-block; padding: 14px 36px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.3);">
                      Accept Invitation &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Info Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 16px 20px; background-color: #f1f5f9; border-radius: 8px; border-left: 4px solid #7c3aed;">
                    <p style="margin: 0; color: #475569; font-size: 13px; line-height: 1.6;">
                      <strong>Role:</strong> ${safeRoleLabel}<br>
                      <strong>Business:</strong> ${safeBusinessName}<br>
                      <strong>Expires:</strong> This invitation expires in ${data.expiresInDays} days.
                    </p>
                  </td>
                </tr>
              </table>

              <p style="margin: 24px 0 0; color: #64748b; font-size: 13px; line-height: 1.5;">
                If you don't recognise this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; text-align: center; background-color: #f8fafc; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} WallX ERP &mdash; Smart Tax &amp; Compliance for African MSMEs
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function generateTeamInvitationText(data: TeamInvitationEmailData): string {
  const roleLabel = formatRoleLabel(data.role);
  const instruction = data.existingAccount
    ? 'Sign in to your existing WallX ERP account and click below to join.'
    : 'Accept the invitation: ' + data.inviteLink;

  const lines = [
    'You are Invited to Join ' + data.businessName,
    '',
    'Hi there,',
    '',
    data.inviterName + ' has invited you to join ' + data.businessName + ' on WallX ERP as a ' + roleLabel + '.',
    '',
    instruction,
    ...(data.existingAccount ? ['', data.inviteLink] : []),
    '',
    'This invitation expires in ' + data.expiresInDays + ' days.',
    '',
    'If you do not recognise this invitation, you can safely ignore this email.',
    '',
    'WallX ERP ' + new Date().getFullYear(),
  ];
  return lines.join('\n');
}
