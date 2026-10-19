/**
 * HTML Entity Escaping Utility for Email Templates — WallX ERP
 *
 * Sanitizes user-supplied free-text fields (customer names, descriptions, business names)
 * before interpolation into HTML email templates to prevent XSS / HTML injection.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_UNSAFE_REGEX = /[&<>"']/g;

/**
 * Escapes characters with special meaning in HTML (&, <, >, ", ').
 * Returns an empty string if null, undefined, or empty.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (str === null || str === undefined) return '';
  return String(str).replace(HTML_UNSAFE_REGEX, (match) => HTML_ESCAPE_MAP[match] || match);
}
