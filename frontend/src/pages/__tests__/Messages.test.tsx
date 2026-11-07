import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Messages from '../Messages.tsx';
import api from '@/lib/axios.ts';
import { useMessageStore } from '@/stores/message.store.ts';

const mockMessages = [
  {
    id: 'msg-1',
    userId: 'user-123',
    broadcastId: 'bc-1',
    title: 'Welcome to WallX Enterprise',
    body: 'Your business profile is now active with all reporting capabilities enabled.',
    isRead: false,
    readAt: null,
    createdAt: '2026-10-14T08:00:00.000Z',
  },
  {
    id: 'msg-2',
    userId: 'user-123',
    broadcastId: 'bc-2',
    title: 'FIRS Monthly Deadline Reminder',
    body: 'Reminder to finalize and remit your monthly VAT reports before the 21st.',
    isRead: true,
    readAt: '2026-10-14T09:00:00.000Z',
    createdAt: '2026-10-13T10:00:00.000Z',
  },
];

describe('Messages Inbox Page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useMessageStore.getState().clear();

    vi.spyOn(api, 'get').mockImplementation((url: string) => {
      if (url === '/messages/unread-count') {
        return Promise.resolve({
          data: { success: true, count: 1 },
        }) as any;
      }
      if (url === '/messages') {
        return Promise.resolve({
          data: {
            success: true,
            data: mockMessages,
            pagination: {
              page: 1,
              limit: 15,
              total: 2,
              totalPages: 1,
              hasPrev: false,
              hasNext: false,
            },
          },
        }) as any;
      }
      return Promise.resolve({ data: { success: true } }) as any;
    });

    vi.spyOn(api, 'patch').mockResolvedValue({
      data: { success: true },
    } as any);
  });

  it('renders messages and handles expanding and marking as read', async () => {
    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Messages')).toBeInTheDocument();
      expect(screen.getByText('Welcome to WallX Enterprise')).toBeInTheDocument();
      expect(screen.getByText('FIRS Monthly Deadline Reminder')).toBeInTheDocument();
    });

    // Click on unread message in list to select and mark as read
    const unreadMessageButton = screen.getAllByText('Welcome to WallX Enterprise')[0].closest('button');
    if (unreadMessageButton) {
      fireEvent.click(unreadMessageButton);
    }

    await waitFor(() => {
      expect(api.patch).toHaveBeenCalledWith('/messages/msg-1/read');
    });
  });

  it('filters by unread tab', async () => {
    render(
      <MemoryRouter>
        <Messages />
      </MemoryRouter>,
    );

    const unreadTab = screen.getByRole('button', { name: /unread/i });
    fireEvent.click(unreadTab);

    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith('/messages', expect.objectContaining({
        params: expect.objectContaining({ unread: true }),
      }));
    });
  });
});
