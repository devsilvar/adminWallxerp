const isSimulatorEnabled = import.meta.env.VITE_ENABLE_TRANSFER_SIMULATOR === 'true';

export const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/sales': 'Sales',
  '/sales/unverified': 'Unverified Transactions',
  ...(isSimulatorEnabled ? { '/test/transfer-simulator': 'Test Transfer Simulator' } : {}),
  '/expenses': 'Expenses',
  '/invoices': 'Invoices',
  '/debtors': 'Debtors',
  '/customers': 'Customers',
  '/inventory': 'Inventory & Marketplace',
  '/tax': 'Tax Reports',
  '/payments': 'Payments',
  '/reminders': 'Reminders',
  '/account': 'Banking & Wallet',
  '/subscription': 'Subscription',
  '/settings': 'Settings',
  '/transactions': 'Transactions',
  '/settlement': 'Settlement',
  '/ai': 'AI Assistant',
};

const PREFIX_ROUTES = ['/invoices', '/debtors', '/sales', '/customers'] as const;

export function resolvePageTitle(pathname: string): string {
  if (pageTitles[pathname]) {
    return pageTitles[pathname];
  }

  for (const prefix of PREFIX_ROUTES) {
    if (pathname.startsWith(prefix + '/') || pathname === prefix) {
      return pageTitles[prefix] || '';
    }
  }

  return '';
}
