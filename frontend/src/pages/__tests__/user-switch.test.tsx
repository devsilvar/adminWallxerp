import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import UserMenu from '../../components/layout/UserMenu';
import { useAuthStore } from '../../stores/auth.store';

// Mock react-i18next with importOriginal
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => (key === 'admin' ? 'Admin Panel' : key),
    }),
  };
});

// Mock useSubscriptionStatus
vi.mock('@/hooks/useSubscriptionStatus', () => ({
  useSubscriptionStatus: () => ({
    tier: 'scale',
    planName: 'Scale',
    badgeText: 'Scale',
    isPaid: true,
  }),
}));

describe('UserMenu Logout-Before-Switch Integration (Amend. B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 'admin-user-1',
        email: 'superadmin@paymytax.com',
        role: 'admin',
      } as any,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('calls logout and redirects to admin login instead of internal router navigation', () => {
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { href: '' };

    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>
    );

    // Open dropdown menu
    const trigger = screen.getByRole('button', { name: /open user menu/i });
    fireEvent.click(trigger);

    // Click Admin Panel
    const adminBtn = screen.getByRole('menuitem', { name: /admin panel/i });
    fireEvent.click(adminBtn);

    expect(logoutSpy).toHaveBeenCalled();
    expect(window.location.href).toContain('/admin/login');

    (window as any).location = originalLocation;
  });
});
