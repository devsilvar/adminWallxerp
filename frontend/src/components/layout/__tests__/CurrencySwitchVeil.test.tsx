import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import CurrencySwitchVeil from '../CurrencySwitchVeil';
import { useCurrencyStore } from '@/stores/currency.store';

describe('CurrencySwitchVeil component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useCurrencyStore.setState({ switching: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when switching is false', () => {
    render(<CurrencySwitchVeil />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('delays appearance by 150ms flicker guard when switching is true', () => {
    useCurrencyStore.setState({ switching: true });
    render(<CurrencySwitchVeil />);

    // At t=0, flicker guard active; not rendered
    expect(screen.queryByRole('status')).toBeNull();

    // Advance 140ms - still not visible
    act(() => {
      vi.advanceTimersByTime(140);
    });
    expect(screen.queryByRole('status')).toBeNull();

    // Advance 10ms to reach 150ms
    act(() => {
      vi.advanceTimersByTime(10);
    });

    const veil = screen.getByRole('status');
    expect(veil).toBeInTheDocument();
    expect(veil).toHaveTextContent(/changing currency/i);
  });

  it('does not display veil if switching finishes before 150ms', () => {
    const { rerender } = render(<CurrencySwitchVeil />);

    // Start switching
    act(() => {
      useCurrencyStore.setState({ switching: true });
    });
    rerender(<CurrencySwitchVeil />);

    // Fast network completes in 50ms
    act(() => {
      vi.advanceTimersByTime(50);
      useCurrencyStore.setState({ switching: false });
    });
    rerender(<CurrencySwitchVeil />);

    // Advance past 150ms
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByRole('status')).toBeNull();
  });
});
