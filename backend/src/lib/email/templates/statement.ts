/**
 * Statement Delivery Email Template
 *
 * Dispatched when an official financial ledger or DVA statement is sent to a recipient.
 * Matches the design language of Welcome Aboard & Tax Payment Confirmed templates.
 */

export interface StatementEmailData {
  businessName: string;
  merchantId: string;
  statementRef: string;
  scopeLabel: string;
  generatedDate: string;
  filename: string;
}

export function generateStatementHtml(data: StatementEmailData): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Official Financial Statement - WallX ERP</title>
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
                Official Financial Statement
              </p>
            </td>
          </tr>

          <!-- Statement Banner -->
          <tr>
            <td style="padding: 28px 32px 20px; text-align: center; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
              <p style="margin: 0; color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                Verified Business Ledger
              </p>
              <h2 style="margin: 8px 0 0; color: #0f172a; font-size: 22px; font-weight: 700; letter-spacing: -0.5px;">
                ${data.businessName}
              </h2>
              <p style="margin: 6px 0 0; color: #6d28d9; font-size: 13px; font-weight: 500; font-family: monospace;">
                Ref: ${data.statementRef}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              <p style="margin: 0 0 16px; color: #0f172a; font-size: 15px; line-height: 1.5;">
                Dear Customer,
              </p>
              
              <p style="margin: 0 0 24px; color: #475569; font-size: 14px; line-height: 1.6;">
                Attached is your requested <strong>${data.scopeLabel}</strong> for <strong>${data.businessName}</strong> generated directly from your WallX ERP financial records.
              </p>

              <!-- Statement Details Box -->
              <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Merchant ID</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${data.merchantId}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Statement Ref</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right; font-family: monospace;">${data.statementRef}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Reporting Scope</td>
                  <td style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.scopeLabel}</td>
                </tr>
                <tr>
                  <td style="padding: 12px 16px; color: #64748b; font-size: 13px;">Generated Date</td>
                  <td style="padding: 12px 16px; color: #0f172a; font-size: 13px; font-weight: 600; text-align: right;">${data.generatedDate}</td>
                </tr>
              </table>

              <!-- Attachment Note -->
              <div style="background-color: #faf5ff; border: 1px solid #f3e8ff; border-left: 4px solid #7c3aed; border-radius: 6px; padding: 14px 18px; margin-bottom: 24px;">
                <p style="margin: 0; color: #4c1d95; font-size: 13px; line-height: 1.5;">
                  📎 <strong>PDF Statement Attached:</strong> The complete statement (<strong>${data.filename}</strong>) has been generated with official compliance verification and attached to this email.
                </p>
              </div>

              <p style="margin: 0; color: #64748b; font-size: 12px; line-height: 1.5;">
                This is a system-generated financial document with official compliance cryptographic verification.
              </p>
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

export function generateStatementText(data: StatementEmailData): string {
  return `
WALLX ERP - FINANCIAL STATEMENT
==================================================

Dear Customer,

Attached is your requested ${data.scopeLabel} for ${data.businessName}.

STATEMENT SUMMARY:
- Business: ${data.businessName}
- Merchant ID: ${data.merchantId}
- Statement Reference: ${data.statementRef}
- Scope: ${data.scopeLabel}
- Generated Date: ${data.generatedDate}
- File Attached: ${data.filename}

This is a system-generated financial document with official compliance cryptographic verification.

Best regards,
The WallX ERP Team
support@wallxerp.com
  `.trim();
}
