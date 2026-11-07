export const PATH_CHUNKS: Record<string, readonly (() => Promise<unknown>)[]> = {
  '/': [() => import('@/pages/marketing/Home.tsx')],
  '/about': [() => import('@/pages/marketing/About.tsx')],
  '/pricing': [() => import('@/pages/marketing/Pricing.tsx')],
  '/contact': [() => import('@/pages/marketing/Contact.tsx')],
  '/login': [() => import('@/pages/Login.tsx')],
  '/register': [() => import('@/pages/Register.tsx')],
  '/dashboard': [() => import('@/pages/Dashboard.tsx')],
  '/sales': [() => import('@/pages/Sales.tsx')],
  '/expenses': [() => import('@/pages/Expenses.tsx')],
  '/invoices': [
    () => import('@/pages/Invoices.tsx'),
    () => import('@/pages/InvoiceForm.tsx'),
    () => import('@/pages/InvoiceDetail.tsx'),
  ],
  '/debtors': [
    () => import('@/pages/Debtors.tsx'),
    () => import('@/pages/DebtorDetail.tsx'),
  ],
  '/customers': [() => import('@/pages/Customers.tsx')],
  '/inventory': [() => import('@/pages/Inventory.tsx')],
  '/ai': [() => import('@/pages/AIAssistant.tsx')],
  '/tax': [() => import('@/pages/TaxReports.tsx')],
  '/transactions': [() => import('@/pages/Transactions.tsx')],
  '/settlement': [() => import('@/pages/Settlement.tsx')],
  '/account': [() => import('@/pages/Account.tsx')],
  '/subscription': [() => import('@/pages/Subscription.tsx')],
  '/settings': [() => import('@/pages/Settings.tsx')],
};

const prefetchCache = new Map<string, Promise<void>>();

export function prefetchRoute(path: string): Promise<void> {
  const loaders = PATH_CHUNKS[path];
  if (!loaders || loaders.length === 0) {
    return Promise.resolve();
  }

  let cached = prefetchCache.get(path);
  if (!cached) {
    cached = Promise.allSettled(loaders.map((load) => load())).then(() => {});
    prefetchCache.set(path, cached);
  }

  return cached;
}

/**
 * Attaches an IntersectionObserver to an element to prefetch a route when visible.
 * Disconnects automatically once triggered to prevent duplicate work or memory leaks.
 * Safe in test/SSR environments without IntersectionObserver.
 */
export function observePrefetch(
  element: HTMLElement | null,
  path: string,
  rootMargin = '100px',
): (() => void) | undefined {
  if (!element || typeof IntersectionObserver === 'undefined') {
    return undefined;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          void prefetchRoute(path);
          observer.disconnect();
          break;
        }
      }
    },
    { rootMargin },
  );

  observer.observe(element);
  return () => observer.disconnect();
}

export function _clearPrefetchCacheForTesting(): void {
  prefetchCache.clear();
}
