import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Nav from './Nav.tsx';
import Footer from './Footer.tsx';

/**
 * Marketing site shell for public editorial pages (Home, About, Pricing, Contact).
 * Provides fixed header, route-aware navigation, and shared footer.
 */
export default function MarketingLayout({
  children,
}: {
  children?: React.ReactNode;
} = {}) {
  const { pathname } = useLocation();

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className='min-h-screen bg-white text-gray-900 flex flex-col font-sans antialiased selection:bg-primary-100 selection:text-primary-900'>
      <Nav />
      <main className='flex-1 pt-14 sm:pt-16'>
        {children || <Outlet />}
      </main>
      <Footer />
    </div>
  );
}
