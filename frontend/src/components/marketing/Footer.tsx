import { Link } from 'react-router-dom';
import OptimizedLogo from '@/components/ui/OptimizedLogo.tsx';

const FOOTER_PRODUCT_LINKS = [
  { label: 'Home', to: '/' },
  { label: 'About Us', to: '/about' },
  { label: 'Pricing & Plans', to: '/pricing' },
  { label: 'Contact Support', to: '/contact' },
];

const FOOTER_ACCOUNT_LINKS = [
  { label: 'Create Account', to: '/register' },
  { label: 'Sign In', to: '/login' },
  { label: 'Dashboard', to: '/dashboard' },
  { label: 'Accept Invitation', to: '/invite' },
];

const FOOTER_LEGAL_LINKS = [
  { label: 'Help & FAQ', to: '/contact#faq' },
  { label: 'Support Desk', to: '/contact' },
  { label: 'NRS Compliance', to: '/about' },
  { label: 'Security & Privacy', to: '/about' },
];

const SOCIAL_LINKS = [
  {
    href: 'https://x.com/wallx_africa',
    label: 'X (Twitter)',
    path: 'M18.244 2H21l-6.55 7.485L22 22h-6.094l-4.77-6.232L5.6 22H2.843l7.014-8.01L2 2h6.243l4.31 5.69L18.244 2zm-1.07 18h1.69L7.93 4H6.118l11.056 16z',
  },
  {
    href: 'https://www.linkedin.com/company/wallx/home',
    label: 'LinkedIn',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.025-3.037-1.851-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.354V9h3.414v1.561h.048c.476-.9 1.637-1.851 3.37-1.851 3.6 0 4.266 2.37 4.266 5.455v6.287zM5.337 7.433a2.062 2.062 0 11.001-4.124 2.062 2.062 0 010 4.124zM7.114 20.452H3.558V9h3.556v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.226.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  {
    href: 'https://www.instagram.com/wallx.africa',
    label: 'Instagram',
    path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z',
  },
];

const LINK_STYLE =
  'text-sm text-gray-400 hover:text-white transition-colors duration-200 block py-1';

export default function Footer() {
  return (
    <footer className='bg-gray-950 text-gray-400 border-t border-gray-900'>
      <div className='mx-auto max-w-7xl px-4 sm:px-6 pt-14 sm:pt-16 lg:pt-20 pb-8 sm:pb-10 lg:pb-12'>
        <div className='grid grid-cols-1 gap-8 sm:gap-10 md:grid-cols-2 lg:grid-cols-5'>
          {/* Brand block */}
          <div className='lg:col-span-2'>
            <Link
              to='/'
              aria-label='WallXERP by WallX — home'
              className='inline-block rounded-xs opacity-90 transition-opacity duration-200 hover:opacity-100'
            >
              <OptimizedLogo
                size='md'
                className='h-8 sm:h-9 w-auto brightness-0 invert'
                loading='lazy'
              />
            </Link>
            <p className='mt-4 sm:mt-5 max-w-sm text-sm sm:text-base leading-relaxed text-gray-400'>
              The dedicated financial engine and tax calculation platform for
              Nigerian SMEs. Real-time sales tracking, automated debtor
              management, and verified NRS compliance.
            </p>

            {/* Social icons */}
            <div className='mt-6 flex items-center gap-3'>
              {SOCIAL_LINKS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target='_blank'
                  rel='noopener noreferrer'
                  aria-label={s.label}
                  className='flex h-10 w-10 items-center justify-center rounded-lg border border-gray-800 text-gray-400 transition-all duration-200 hover:border-gray-700 hover:bg-gray-900 hover:text-white'
                >
                  <svg
                    className='h-4 w-4'
                    viewBox='0 0 24 24'
                    fill='currentColor'
                    aria-hidden='true'
                  >
                    <path d={s.path} />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Product links */}
          <div>
            <h3 className='text-xs sm:text-sm font-semibold uppercase tracking-wider text-gray-200 mb-4 sm:mb-5'>
              Pages
            </h3>
            <div className='space-y-1.5'>
              {FOOTER_PRODUCT_LINKS.map((item) => (
                <Link key={item.to} to={item.to} className={LINK_STYLE}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Account links */}
          <div>
            <h3 className='text-xs sm:text-sm font-semibold uppercase tracking-wider text-gray-200 mb-4 sm:mb-5'>
              Account
            </h3>
            <div className='space-y-1.5'>
              {FOOTER_ACCOUNT_LINKS.map((item) => (
                <Link key={item.label} to={item.to} className={LINK_STYLE}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Support / Legal */}
          <div>
            <h3 className='text-xs sm:text-sm font-semibold uppercase tracking-wider text-gray-200 mb-4 sm:mb-5'>
              Support & Trust
            </h3>
            <div className='space-y-1.5'>
              {FOOTER_LEGAL_LINKS.map((item) => (
                <Link key={item.label} to={item.to} className={LINK_STYLE}>
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className='mt-12 sm:mt-16 pt-6 sm:pt-8 border-t border-gray-850 flex flex-col items-center gap-4 sm:flex-row sm:justify-between'>
          <p className='text-xs sm:text-sm text-gray-500 text-center sm:text-left'>
            © {new Date().getFullYear()} WallXERP by WallX. All rights reserved.
          </p>
          <p className='flex items-center gap-1.5 text-xs sm:text-sm text-gray-400'>
            <span>Built for Nigerian SMEs in Lagos, Nigeria</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
