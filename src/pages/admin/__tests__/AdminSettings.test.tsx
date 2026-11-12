import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminSettings from '../AdminSettings';
import api from '@/lib/axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store';

// Mock API and toast
vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  getErrorMessage: vi.fn((err: unknown) => {
    const maybeObj = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
    return maybeObj?.response?.data?.error?.message || maybeObj?.message || 'Error occurred';
  }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('AdminSettings Page & ChangeAdminPassword Wizard (Phase 9)', () => {
  const mockUser = {
    id: 'admin-uuid-1234',
    email: 'richmond@wallx.co',
    fullName: 'Richmond WallX',
    role: 'admin' as const,
    isVerified: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: mockUser,
      isAuthenticated: true,
      hasCheckedAuth: true,
      fetchMe: vi.fn().mockResolvedValue(undefined),
      logout: vi.fn(),
    });
  });

  describe('Page Shell & Navigation Tabs', () => {
    it('renders the settings header and defaults to the Security tab [positive]', () => {
      render(
        <MemoryRouter initialEntries={['/admin/settings']}>
          <AdminSettings />
        </MemoryRouter>
      );

      expect(screen.getByText('Admin Settings')).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /security/i })).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Change Admin Password')).toBeInTheDocument();
    });

    it('switches to Profile tab and displays read-only email, role, and editable name [positive]', async () => {
      render(
        <MemoryRouter initialEntries={['/admin/settings']}>
          <AdminSettings />
        </MemoryRouter>
      );

      const profileTab = screen.getByRole('tab', { name: /profile/i });
      fireEvent.click(profileTab);

      expect(profileTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('Admin Profile Details')).toBeInTheDocument();

      const emailInput = screen.getByLabelText(/email address/i) as HTMLInputElement;
      expect(emailInput.value).toBe('richmond@wallx.co');
      expect(emailInput).toBeDisabled();

      expect(screen.getByText('Super Administrator')).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/full \/ display name/i) as HTMLInputElement;
      expect(nameInput.value).toBe('Richmond WallX');
    });

    it('updates profile display name via PATCH /auth/me and triggers store refresh [positive]', async () => {
      const user = userEvent.setup();
      vi.mocked(api.patch).mockResolvedValueOnce({
        data: { success: true, message: 'Profile updated' },
      });

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=profile']}>
          <AdminSettings />
        </MemoryRouter>
      );

      const nameInput = screen.getByLabelText(/full \/ display name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'Richmond Admin Updated');

      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveBtn);

      await waitFor(() => {
        expect(api.patch).toHaveBeenCalledWith('/auth/me', {
          fullName: 'Richmond Admin Updated',
        });
      });

      expect(toast.success).toHaveBeenCalledWith('Profile updated successfully');
      expect(useAuthStore.getState().fetchMe).toHaveBeenCalled();
    });

    it('prevents saving profile if display name is less than 2 characters [negative/boundary]', async () => {
      const user = userEvent.setup();

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=profile']}>
          <AdminSettings />
        </MemoryRouter>
      );

      const nameInput = screen.getByLabelText(/full \/ display name/i);
      await user.clear(nameInput);
      await user.type(nameInput, 'A');

      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      await user.click(saveBtn);

      expect(toast.error).toHaveBeenCalledWith('Name must be at least 2 characters');
      expect(api.patch).not.toHaveBeenCalled();
    });
  });

  describe('ChangeAdminPassword Wizard Flow', () => {
    it('Step 1 (Request): calls request-code, shows delivery note without success toast when delivered=false [boundary/edge]', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            emailHint: 'ri***@wallx.co',
            expiresInMinutes: 10,
            delivered: false,
          },
          message: 'Code generated',
        },
      });

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=security']}>
          <AdminSettings />
        </MemoryRouter>
      );

      // Verify masked email is shown
      expect(screen.getByText('r***d@wallx.co')).toBeInTheDocument();

      const sendBtn = screen.getByRole('button', { name: /send 6-digit code/i });
      await user.click(sendBtn);

      expect(api.post).toHaveBeenCalledWith('/admin/account/password/request-code');

      // Delivered is false -> should show notice and NOT show success toast
      await waitFor(() => {
        expect(
          screen.getByText(/email delivery is not configured on this server — check the server logs/i)
        ).toBeInTheDocument();
      });
      expect(toast.success).not.toHaveBeenCalled();
      expect(screen.getByText(/enter 6-digit verification code/i)).toBeInTheDocument();
    });

    it('Step 1 (Request): shows success toast and advances to Step 2 when delivered=true [positive]', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            emailHint: 'ri***@wallx.co',
            expiresInMinutes: 10,
            delivered: true,
          },
          message: 'Code sent',
        },
      });

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=security']}>
          <AdminSettings />
        </MemoryRouter>
      );

      const sendBtn = screen.getByRole('button', { name: /send 6-digit code/i });
      await user.click(sendBtn);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Verification code sent to your email');
        expect(screen.getByText(/enter 6-digit verification code/i)).toBeInTheDocument();
      });

      // Contract guard: the wizard must render the server's `emailHint`, not a
      // locally re-derived mask. If the component ever reads a field the API
      // does not send, this falls back to `r***d@wallx.co` and fails here.
      expect(screen.getByText('ri***@wallx.co')).toBeInTheDocument();
    });

    it('Step 2 (Code): auto-advances through digit inputs and handles paste [positive/UX]', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            emailHint: 'ri***@wallx.co',
            expiresInMinutes: 10,
            delivered: true,
          },
        },
      });

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=security']}>
          <AdminSettings />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /send 6-digit code/i }));

      await waitFor(() => {
        expect(screen.getByLabelText(/digit 1 of verification code/i)).toBeInTheDocument();
      });

      const digit1 = screen.getByLabelText(/digit 1 of verification code/i) as HTMLInputElement;

      // Simulate pasting 6 digits
      fireEvent.paste(digit1, {
        clipboardData: {
          getData: () => '123456',
        },
      });

      const digit6 = screen.getByLabelText(/digit 6 of verification code/i) as HTMLInputElement;
      expect(digit1.value).toBe('1');
      expect(digit6.value).toBe('6');
    });

    it('Step 2 (Code): displays remaining attempts on INVALID_CODE error [negative/boundary]', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post)
        .mockResolvedValueOnce({
          data: {
            success: true,
            data: { emailHint: 'ri***@wallx.co', expiresInMinutes: 10, delivered: true },
          },
        })
        .mockRejectedValueOnce({
          response: {
            status: 400,
            data: {
              success: false,
              error: {
                code: 'INVALID_CODE',
                message: 'Incorrect code',
                details: { remainingAttempts: 3 },
              },
            },
          },
        });

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=security']}>
          <AdminSettings />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /send 6-digit code/i }));
      await waitFor(() => screen.getByLabelText(/digit 1 of verification code/i));

      // Paste code
      fireEvent.paste(screen.getByLabelText(/digit 1 of verification code/i), {
        clipboardData: { getData: () => '999999' },
      });

      const verifyBtn = screen.getByRole('button', { name: /verify code/i });
      await user.click(verifyBtn);

      await waitFor(() => {
        expect(screen.getByText('Incorrect code. 3 attempt(s) remaining.')).toBeInTheDocument();
      });
    });

    it('Step 3 (Password): enforces real-time validation rules and keeps submit disabled until all pass [negative/boundary]', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post)
        .mockResolvedValueOnce({
          data: {
            success: true,
            data: { emailHint: 'ri***@wallx.co', expiresInMinutes: 10, delivered: true },
          },
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            data: { changeTicket: 'valid-jwt-ticket' },
          },
        });

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=security']}>
          <AdminSettings />
        </MemoryRouter>
      );

      // Advance to step 2
      await user.click(screen.getByRole('button', { name: /send 6-digit code/i }));
      await waitFor(() => screen.getByLabelText(/digit 1 of verification code/i));

      // Paste and verify
      fireEvent.paste(screen.getByLabelText(/digit 1 of verification code/i), {
        clipboardData: { getData: () => '123456' },
      });
      await user.click(screen.getByRole('button', { name: /verify code/i }));

      // Step 3 Password
      await waitFor(() => {
        expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
      });

      const submitBtn = screen.getByRole('button', { name: /update password/i });
      expect(submitBtn).toBeDisabled();

      const newPassInput = screen.getByLabelText(/^new password$/i);
      const confirmPassInput = screen.getByLabelText(/confirm new password/i);

      // Weak password: no uppercase, no number
      await user.type(newPassInput, 'weakpass');
      await user.type(confirmPassInput, 'weakpass');
      expect(submitBtn).toBeDisabled();

      // Fix uppercase, still no number
      await user.clear(newPassInput);
      await user.clear(confirmPassInput);
      await user.type(newPassInput, 'WeakPass');
      await user.type(confirmPassInput, 'WeakPass');
      expect(submitBtn).toBeDisabled();

      // Strong password, but confirm doesn't match
      await user.clear(newPassInput);
      await user.clear(confirmPassInput);
      await user.type(newPassInput, 'SuperSecret123');
      await user.type(confirmPassInput, 'Different123');
      expect(submitBtn).toBeDisabled();

      // Strong password and match -> Enabled!
      await user.clear(confirmPassInput);
      await user.type(confirmPassInput, 'SuperSecret123');
      expect(submitBtn).toBeEnabled();
    });

    it('Step 4 (Done): completes change, logs out, and redirects to /admin/login [positive/security]', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post)
        .mockResolvedValueOnce({
          data: {
            success: true,
            data: { emailHint: 'ri***@wallx.co', expiresInMinutes: 10, delivered: true },
          },
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            data: { changeTicket: 'secure-ticket-abc' },
          },
        })
        .mockResolvedValueOnce({
          data: {
            success: true,
            message: 'Admin password changed successfully',
          },
        });

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=security']}>
          <AdminSettings />
        </MemoryRouter>
      );

      // Step 1 -> Step 2
      await user.click(screen.getByRole('button', { name: /send 6-digit code/i }));
      await waitFor(() => screen.getByLabelText(/digit 1 of verification code/i));

      // Step 2 -> Step 3
      fireEvent.paste(screen.getByLabelText(/digit 1 of verification code/i), {
        clipboardData: { getData: () => '123456' },
      });
      await user.click(screen.getByRole('button', { name: /verify code/i }));

      // Step 3
      await waitFor(() => screen.getByLabelText(/^new password$/i));
      await user.type(screen.getByLabelText(/^new password$/i), 'RichmondSuperAdmin2026!');
      await user.type(screen.getByLabelText(/confirm new password/i), 'RichmondSuperAdmin2026!');

      const submitBtn = screen.getByRole('button', { name: /update password/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(api.post).toHaveBeenCalledWith('/admin/account/password/complete', {
          changeTicket: 'secure-ticket-abc',
          newPassword: 'RichmondSuperAdmin2026!',
          confirmPassword: 'RichmondSuperAdmin2026!',
        });
      });

      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining('Password changed successfully')
      );
      expect(useAuthStore.getState().logout).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/admin/login', { replace: true });
    });

    it('Cancel button resets wizard back to Step 1 and clears state [UX/security]', async () => {
      const user = userEvent.setup();
      vi.mocked(api.post).mockResolvedValueOnce({
        data: {
          success: true,
          data: { emailHint: 'ri***@wallx.co', expiresInMinutes: 10, delivered: true },
        },
      });

      render(
        <MemoryRouter initialEntries={['/admin/settings?tab=security']}>
          <AdminSettings />
        </MemoryRouter>
      );

      await user.click(screen.getByRole('button', { name: /send 6-digit code/i }));
      await waitFor(() => screen.getByText(/enter 6-digit verification code/i));

      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      await user.click(cancelBtn);

      expect(screen.getByRole('button', { name: /send 6-digit code/i })).toBeInTheDocument();
    });
  });
});
