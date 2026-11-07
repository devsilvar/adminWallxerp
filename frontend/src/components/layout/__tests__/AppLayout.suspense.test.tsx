import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppLayout from '../AppLayout.tsx';
import { useBusinessStore } from '@/stores/business.store.ts';
import { useAuthStore } from '@/stores/auth.store.ts';
import type { Business, User } from '@/types/index.ts';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
      i18n: { changeLanguage: () => Promise.resolve() },
    }),
  };
});

describe('AppLayout Suspense Boundary Integration', () => {
  const mockBiz = {
    id: 'biz-test-layout',
    businessName: 'Suspense Test Enterprise',
    currency: 'NGN',
    myRole: 'owner',
    userId: 'user-test-layout',
  };

  const mockUser = {
    id: 'user-test-layout',
    email: 'test@example.com',
    role: 'user',
    isOwnerAccount: true,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    HTMLElement.prototype.scrollTo = vi.fn();
    window.scrollTo = vi.fn();
    useBusinessStore.setState({
      activeBusiness: mockBiz as unknown as Business,
      businesses: [mockBiz as unknown as Business],
    });
    useAuthStore.setState({
      user: mockUser as unknown as User,
      isAuthenticated: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps header and sidebar mounted while content suspends, then shows resolved content', async () => {
    let resolveSuspension!: () => void;
    let isSuspended = true;
    const pendingPromise = new Promise<void>((resolve) => {
      resolveSuspension = resolve;
    });

    function SuspendingChild() {
      if (isSuspended) {
        throw pendingPromise;
      }
      return <div data-testid="resolved-content">Child View Loaded</div>;
    }

    render(
      <MemoryRouter initialEntries={['/sales']}>
        <AppLayout>
          <SuspendingChild />
        </AppLayout>
      </MemoryRouter>,
    );

    // Header and navigation must remain mounted during suspension
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { level: 2, name: 'Sales' })).toBeInTheDocument();

    // Verify main tag has the relative class for containing block correctness
    const mainEl = document.querySelector('main');
    expect(mainEl).toBeInTheDocument();
    expect(mainEl?.className).toContain('relative');
    expect(mainEl?.className).toContain('flex-1');

    // Before 40ms, flicker guard prevents loader from rendering
    expect(screen.queryByRole('status')).toBeNull();

    // Advance 40ms to trigger the transition veil
    act(() => {
      vi.advanceTimersByTime(40);
    });

    const veil = screen.getByRole('status');
    expect(veil).toBeInTheDocument();
    expect(screen.getByText('Loading Sales')).toBeInTheDocument();

    // Shell header & navigation are STILL mounted with the veil active
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0);

    // Now resolve the child component
    isSuspended = false;
    resolveSuspension();

    await act(async () => {
      await pendingPromise;
    });

    // Loader veil is unmounted; resolved child is visible
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByTestId('resolved-content')).toBeInTheDocument();
    expect(screen.getByText('Child View Loaded')).toBeInTheDocument();

    // Shell header and navigation remain intact after resolution
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main navigation' }).length).toBeGreaterThan(0);
  });
});
