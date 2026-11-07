import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop
 *
 * Ensures that navigating between routes in the dashboard (and throughout the application)
 * always resets the scroll position to the top (0, 0), eliminating the issue where
 * navigating to a new route displays the middle or bottom of that page.
 *
 * Handles:
 * 1. The window and documentElement (for standard layout pages)
 * 2. Layout <main> scroll containers (AppLayout dashboard & AdminLayout)
 * 3. Browser history scrollRestoration set to 'manual' to prevent native browser fight
 * 4. Respects hash anchors (e.g. #faq, #features) if explicitly provided in URL
 */
export default function ScrollToTop() {
  const { pathname, search, hash } = useLocation();
  const tab = new URLSearchParams(search).get('tab');

  useLayoutEffect(() => {
    // Disable native browser scroll restoration fighting with SPA navigation
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }

    // If an anchor hash is present, let the browser scroll to that specific element
    if (hash) {
      const id = hash.replace(/^#/, '');
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }

    // 1. Reset standard window & document body scrolling
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    // 2. Reset all layout main containers (AppLayout, AdminLayout, etc.)
    const mainContainers = document.querySelectorAll('main');
    mainContainers.forEach((el) => {
      el.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      el.scrollTop = 0;
    });
  }, [pathname, tab, hash]);

  return null;
}
