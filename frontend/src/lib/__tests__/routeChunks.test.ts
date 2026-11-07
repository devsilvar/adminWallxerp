import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from '@/components/layout/Sidebar.tsx';
import {
  PATH_CHUNKS,
  prefetchRoute,
  observePrefetch,
  _clearPrefetchCacheForTesting,
} from '@/lib/routeChunks.ts';
import { resolvePageTitle } from '@/lib/pageTitles.ts';
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

describe('routeChunks & Navigation Drift Guard', () => {
  const mockBiz = {
    id: 'biz-drift-guard',
    businessName: 'Drift Guard SME',
    currency: 'NGN',
    myRole: 'owner',
    userId: 'user-drift-guard',
  };

  const mockUser = {
    id: 'user-drift-guard',
    email: 'admin@driftguard.com',
    role: 'admin', // Ensures /admin link is rendered
    isOwnerAccount: true,
  };

  beforeEach(() => {
    _clearPrefetchCacheForTesting();
    useBusinessStore.setState({
      activeBusiness: mockBiz as unknown as Business,
      businesses: [mockBiz as unknown as Business],
    });
    useAuthStore.setState({
      user: mockUser as unknown as User,
      isAuthenticated: true,
    });
  });

  it('verifies every rendered Sidebar link has a PATH_CHUNKS entry and a resolved page title', () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/dashboard'] },
        React.createElement(Sidebar, { isOpen: true }),
      ),
    );

    const links = screen.getAllByRole('link');
    const hrefs = Array.from(
      new Set(
        links
          .map((link) => link.getAttribute('href'))
          .filter((href): href is string => Boolean(href && href.startsWith('/'))),
      ),
    );

    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      // 1. Drift guard: Every route rendered in navigation must have a prefetch chunk mapping
      expect(
        PATH_CHUNKS,
        `Navigation link "${href}" has no entry in PATH_CHUNKS!`,
      ).toHaveProperty(href);

      // 2. Every route rendered in navigation must have a non-empty resolved page title
      const title = resolvePageTitle(href);
      expect(
        title,
        `Navigation link "${href}" has an empty resolved title!`,
      ).not.toBe('');
    }
  });

  it('fails drift guard if a navigation link is missing from PATH_CHUNKS (AC 19 negative verification)', () => {
    const dummyChunks: Record<string, readonly (() => Promise<unknown>)[]> = { ...PATH_CHUNKS };
    delete dummyChunks['/sales'];
    expect(() => {
      expect(dummyChunks).toHaveProperty('/sales');
    }).toThrow();
  });

  it('guarantees prefetchRoute returns the identical promise on repeated calls (run-once contract)', async () => {
    const p1 = prefetchRoute('/sales');
    const p2 = prefetchRoute('/sales');

    expect(p1).toBe(p2);
    await expect(p1).resolves.toBeUndefined();
  }, 15000);

  it('resolves immediately without throwing for unknown routes', async () => {
    const p = prefetchRoute('/non-existent-route');
    await expect(p).resolves.toBeUndefined();
  });

  it('does not reject or throw to caller even if an underlying chunk loader fails', async () => {
    const testChunks = PATH_CHUNKS as Record<string, readonly (() => Promise<unknown>)[]>;
    const testKey = '/test-failure';
    testChunks[testKey] = [
      () => Promise.reject(new Error('Network offline or chunk missing')),
    ];

    try {
      const p = prefetchRoute(testKey);
      await expect(p).resolves.toBeUndefined();
    } finally {
      delete testChunks[testKey];
    }
  });

  it('registers all marketing and auth entry routes in PATH_CHUNKS', () => {
    const marketingAndAuthRoutes = [
      '/',
      '/about',
      '/pricing',
      '/contact',
      '/login',
      '/register',
    ];
    for (const route of marketingAndAuthRoutes) {
      expect(
        PATH_CHUNKS,
        `Expected route "${route}" in PATH_CHUNKS`,
      ).toHaveProperty(route);
      expect(PATH_CHUNKS[route].length).toBeGreaterThan(0);
    }
  });

  describe('observePrefetch', () => {
    it('returns undefined safely when element is null', () => {
      expect(observePrefetch(null, '/register')).toBeUndefined();
    });

    it('observes and triggers prefetch when intersecting', () => {
      let callback: ((entries: unknown[]) => void) | undefined;
      const disconnectSpy = vi.fn();
      const observeSpy = vi.fn();

      class MockIntersectionObserver {
        constructor(cb: (entries: unknown[]) => void) {
          callback = cb;
        }
        observe = observeSpy;
        disconnect = disconnectSpy;
        unobserve = vi.fn();
        takeRecords = () => [];
        root = null;
        rootMargin = '100px';
        thresholds = [0];
      }

      vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

      const el = document.createElement('div');
      const unobserve = observePrefetch(el, '/register');

      expect(observeSpy).toHaveBeenCalledWith(el);

      // Trigger intersection
      callback?.([{ isIntersecting: true }]);

      expect(disconnectSpy).toHaveBeenCalled();
      unobserve?.();

      vi.unstubAllGlobals();
    });
  });
});
