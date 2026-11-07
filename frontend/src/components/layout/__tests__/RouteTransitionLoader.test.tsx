import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RouteTransitionLoader from '../RouteTransitionLoader.tsx';

describe('RouteTransitionLoader', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null at t=0 and t=39ms, and renders veil at t=40ms', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <RouteTransitionLoader />
      </MemoryRouter>,
    );

    // At t=0, flicker guard is active; nothing renders
    expect(screen.queryByRole('status')).toBeNull();

    // Advance to 39ms - still not armed
    act(() => {
      vi.advanceTimersByTime(39);
    });
    expect(screen.queryByRole('status')).toBeNull();

    // Advance 1ms to reach 40ms threshold
    act(() => {
      vi.advanceTimersByTime(1);
    });

    const veil = screen.getByRole('status');
    expect(veil).toBeInTheDocument();
    expect(veil).toHaveAttribute('aria-live', 'polite');
    expect(veil.className).toContain('animate-veil-in');
    expect(veil.className).not.toContain('animate-in');
    expect(veil.className).not.toContain('fade-in');
  });

  it('renders correct label for /dashboard', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <RouteTransitionLoader />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(40);
    });

    expect(screen.getByText('Loading Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Preparing secure workspace...')).toBeInTheDocument();
    expect(screen.getByText('W')).toBeInTheDocument();
  });

  it('renders correct label for /sales', () => {
    render(
      <MemoryRouter initialEntries={['/sales']}>
        <RouteTransitionLoader />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(40);
    });

    expect(screen.getByText('Loading Sales')).toBeInTheDocument();
  });

  it('resolves prefix route for nested routes e.g. /invoices/inv-123', () => {
    render(
      <MemoryRouter initialEntries={['/invoices/inv-123']}>
        <RouteTransitionLoader />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(40);
    });

    expect(screen.getByText('Loading Invoices')).toBeInTheDocument();
  });

  it('falls back to Workspace for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/unknown-path']}>
        <RouteTransitionLoader />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(40);
    });

    expect(screen.getByText('Loading Workspace')).toBeInTheDocument();
  });
});
