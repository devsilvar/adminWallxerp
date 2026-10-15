import { useCallback, useState } from 'react';

export function usePaginationTransition() {
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pendingPage, setPendingPage] = useState<number | null>(null);

  const start = useCallback((next: number) => {
    setPendingPage(next);
    setIsPageLoading(true);
  }, []);

  const finish = useCallback(() => {
    setPendingPage(null);
    setIsPageLoading(false);
  }, []);

  return { isPageLoading, pendingPage, start, finish, setIsPageLoading, setPendingPage };
}
