// Intl instances are built once at module scope. Constructing them inside
// .map() on every render was the dominant cost of the old treasury table
// (20 rows × 3 formatters × every keystroke).
const nairaFmt = new Intl.NumberFormat('en-NG', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const countFmt = new Intl.NumberFormat('en-NG');

const signupFmt = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const transferFmt = new Intl.DateTimeFormat('en-NG', {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const stampFmt = new Intl.DateTimeFormat('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const dateFmt = new Intl.DateTimeFormat('en-NG', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export const formatNaira = (n: number) => `₦${nairaFmt.format(Number(n))}`;

/** Always carries an explicit sign. ASCII '-' keeps `tabular-nums` columns aligned. */
export function formatSignedNaira(n: number) {
  const v = Number(n);
  return `${v < 0 ? '-' : '+'}₦${nairaFmt.format(Math.abs(v))}`;
}

export const formatCount = (n: number) => countFmt.format(Number(n));

export const formatSignupDate = (d: string) => signupFmt.format(new Date(d));

export const formatTransferStamp = (d: string) => transferFmt.format(new Date(d));

export const formatStamp = (d: string) => stampFmt.format(new Date(d));

export const formatDate = (d: string) => dateFmt.format(new Date(d));

export function timeAgo(d: string) {
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}