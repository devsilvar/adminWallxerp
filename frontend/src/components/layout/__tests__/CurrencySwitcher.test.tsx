import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CurrencySwitcher from '../CurrencySwitcher';
import { useCurrencyStore } from '@/stores/currency.store';

describe('CurrencySwitcher component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useCurrencyStore.setState({
      code: 'NGN',
      rates: { USD: 1350, GBP: 1750 },
      stale: false,
      fetchedAt: Date.now(),
      loading: false,
      switching: false,
      error: null,
    });
  });

  it('renders trigger button displaying the active currency symbol and code', () => {
    render(<CurrencySwitcher />);
    const trigger = screen.getByRole('button', { name: /change display currency/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('₦');
    expect(trigger).toHaveTextContent('NGN');
  });

  it('opens menu on click and displays 5 display currencies', () => {
    render(<CurrencySwitcher />);
    const trigger = screen.getByRole('button', { name: /change display currency/i });
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: /display currency/i });
    expect(menu).toBeInTheDocument();

    const items = screen.getAllByRole('menuitemradio');
    expect(items).toHaveLength(5);
  });

  it('marks active currency with aria-checked="true"', () => {
    render(<CurrencySwitcher />);
    fireEvent.click(screen.getByRole('button', { name: /change display currency/i }));

    const ngnItem = screen.getByRole('menuitemradio', { name: /nigerian naira/i });
    expect(ngnItem).toHaveAttribute('aria-checked', 'true');

    const usdItem = screen.getByRole('menuitemradio', { name: /us dollar/i });
    expect(usdItem).toHaveAttribute('aria-checked', 'false');
  });

  it('disables currencies that have no available rates', () => {
    render(<CurrencySwitcher />);
    fireEvent.click(screen.getByRole('button', { name: /change display currency/i }));

    // USD and GBP have rates in store
    const usdItem = screen.getByRole('menuitemradio', { name: /us dollar/i });
    expect(usdItem).not.toBeDisabled();

    // EUR and CAD have no rate in store (0 or undefined)
    const eurItem = screen.getByRole('menuitemradio', { name: /euro/i });
    expect(eurItem).toBeDisabled();
    expect(eurItem).toHaveTextContent('Rate unavailable');
  });

  it('clicking an available currency selects it and closes the menu', async () => {
    const setCurrencySpy = vi.fn();
    useCurrencyStore.setState({ setCurrency: setCurrencySpy });

    render(<CurrencySwitcher />);
    fireEvent.click(screen.getByRole('button', { name: /change display currency/i }));

    const usdItem = screen.getByRole('menuitemradio', { name: /us dollar/i });
    fireEvent.click(usdItem);

    expect(setCurrencySpy).toHaveBeenCalledWith('USD');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes menu and returns focus on Escape key', () => {
    render(<CurrencySwitcher />);
    const trigger = screen.getByRole('button', { name: /change display currency/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes menu when clicking outside', () => {
    render(
      <div>
        <div data-testid="outside">Outside area</div>
        <CurrencySwitcher />
      </div>
    );
    const trigger = screen.getByRole('button', { name: /change display currency/i });
    fireEvent.click(trigger);

    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders stale warning when rates are marked stale', () => {
    useCurrencyStore.setState({ stale: true });
    render(<CurrencySwitcher />);
    fireEvent.click(screen.getByRole('button', { name: /change display currency/i }));

    expect(screen.getByText(/rates may be outdated/i)).toBeInTheDocument();
  });

  it('renders disclaimer in footer', () => {
    render(<CurrencySwitcher />);
    fireEvent.click(screen.getByRole('button', { name: /change display currency/i }));

    expect(screen.getByText(/display only — transactions and tax filings stay in naira/i)).toBeInTheDocument();
  });
});
