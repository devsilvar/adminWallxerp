import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminSidebar from '../../components/layout/AdminSidebar';
import { useAuthStore } from '../../stores/auth.store';
import { useAdminStatsStore } from '../../stores/admin.stats.store';

describe('AdminSidebar Logout-Before-Switch Integration (Amend. B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: {
        id: 'admin-1',
        email: 'admin@paymytax.com',
        role: 'admin',
      } as any,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('renders Switch to SME Portal as a logout-gated button, NOT a NavLink to /dashboard', () => {
    const { container } = render(
      <MemoryRouter>
        <AdminSidebar isOpen={true} />
      </MemoryRouter>
    );

    // Verify no NavLink/anchor points to /dashboard
    const dashboardAnchor = container.querySelector('a[href="/dashboard"]');
    expect(dashboardAnchor).toBeNull();

    // Verify button exists
    const switchBtns = screen.getAllByRole('button', { name: /switch to sme portal/i });
    expect(switchBtns.length).toBeGreaterThan(0);
  });

  it('clears admin stores and redirects to SME portal login on click', () => {
    const originalLocation = window.location;
    delete (window as any).location;
    (window as any).location = { href: '' };

    const clearStatsSpy = vi.spyOn(useAdminStatsStore.getState(), 'clear');
    const logoutSpy = vi.spyOn(useAuthStore.getState(), 'logout');

    render(
      <MemoryRouter>
        <AdminSidebar isOpen={true} />
      </MemoryRouter>
    );

    const switchBtn = screen.getAllByRole('button', { name: /switch to sme portal/i })[0];
    fireEvent.click(switchBtn);

    expect(clearStatsSpy).toHaveBeenCalled();
    expect(logoutSpy).toHaveBeenCalled();
    expect(window.location.href).toContain('/login');

    (window as any).location = originalLocation;
  });
});
