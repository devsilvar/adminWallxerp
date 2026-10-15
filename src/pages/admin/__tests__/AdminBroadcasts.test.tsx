import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import AdminBroadcasts from '../AdminBroadcasts';
import api from '@/lib/axios';

vi.mock('@/lib/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  getErrorMessage: vi.fn((err: any) => err?.message || 'Error'),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockBroadcasts = [
  {
    id: 'b-001',
    title: 'Important Tax Update',
    body: 'Please ensure your NRS reports are submitted before Friday.',
    audienceType: 'all',
    audienceUserId: null,
    createdById: 'admin-1',
    status: 'sent',
    totalRecipients: 45,
    sentEmailCount: 42,
    failedEmailCount: 3,
    createdAt: '2026-10-14T10:00:00.000Z',
    messages: [],
  },
  {
    id: 'b-002',
    title: 'Direct Notice for Enterprise',
    body: 'Your business profile requires an updated tax ID verification.',
    audienceType: 'user',
    audienceUserId: 'user-123',
    createdById: 'admin-1',
    status: 'sent',
    totalRecipients: 1,
    sentEmailCount: 1,
    failedEmailCount: 0,
    createdAt: '2026-10-14T11:00:00.000Z',
    messages: [],
  },
];

const mockStats = {
  totalBroadcasts: 2,
  totalRecipients: 46,
  sentEmailCount: 43,
  failedEmailCount: 3,
};

describe('AdminBroadcasts Desk', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (api.get as any).mockImplementation((url: string) => {
      if (url === '/admin/broadcasts') {
        return Promise.resolve({
          data: {
            success: true,
            data: mockBroadcasts,
            pagination: { page: 1, totalPages: 1, total: 2 },
            stats: mockStats,
          },
        });
      }
      if (url === '/admin/users') {
        return Promise.resolve({
          data: {
            success: true,
            data: [
              {
                id: 'user-999',
                email: 'sme@example.com',
                fullName: 'John SME',
                businesses: [{}, {}],
              },
            ],
          },
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    (api.post as any).mockResolvedValue({
      data: {
        success: true,
        data: { id: 'b-new', title: 'New Test', totalRecipients: 45 },
      },
    });
  });

  it('renders broadcasts table and KPI cards', async () => {
    render(
      <BrowserRouter>
        <AdminBroadcasts />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Broadcasts Desk')).toBeInTheDocument();
      expect(screen.getByText('Important Tax Update')).toBeInTheDocument();
      expect(screen.getByText('Direct Notice for Enterprise')).toBeInTheDocument();
    });

    expect(screen.getByText('46')).toBeInTheDocument(); // total recipients
  });

  it('disables send button until valid title and body are entered', async () => {
    render(
      <BrowserRouter>
        <AdminBroadcasts />
      </BrowserRouter>,
    );

    const sendBtn = screen.getByRole('button', { name: /send broadcast/i });
    expect(sendBtn).toBeDisabled();

    const titleInput = screen.getByLabelText(/subject \/ title/i);
    const bodyInput = screen.getByLabelText(/message body/i);

    fireEvent.change(titleInput, { target: { value: 'Hi' } }); // < 3 chars
    fireEvent.change(bodyInput, { target: { value: 'short' } }); // < 10 chars
    expect(sendBtn).toBeDisabled();

    fireEvent.change(titleInput, { target: { value: 'System Maintenance Tonight' } });
    fireEvent.change(bodyInput, { target: { value: 'The platform will undergo maintenance from 11 PM to 1 AM.' } });

    expect(sendBtn).not.toBeDisabled();

    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/admin/broadcasts', {
        title: 'System Maintenance Tonight',
        body: 'The platform will undergo maintenance from 11 PM to 1 AM.',
        audience: { type: 'all' },
      });
    });
  });
});
