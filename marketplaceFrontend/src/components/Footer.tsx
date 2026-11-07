export default function Footer() {
  const year = new Date().getFullYear();
  const appUrl = import.meta.env.PUBLIC_APP_URL || '';

  return (
    <footer className="border-t border-gray-200 bg-gray-900 text-gray-300">
      <div className="mx-auto max-w-[1152px] px-5 sm:px-8 py-12 sm:py-14">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">

          {/* ── Brand Column ── */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <picture>
                <source
                  type="image/webp"
                  srcSet="/images-optimized/logo-48.webp 48w, /images-optimized/logo-64.webp 64w"
                  sizes="36px"
                />
                <img src="/logo.png" alt="WallX" width={36} height={36} className="h-8 w-auto brightness-150" />
              </picture>
              <div className="leading-none">
                <span className="text-[14px] font-extrabold text-white tracking-tight" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                  WallX <span style={{ color: '#a855f7' }}>Market</span>
                </span>
              </div>
            </div>
            <p className="text-[13px] leading-relaxed text-gray-400 max-w-[220px]">
              Nigeria's verified SME product directory. Connect buyers and sellers directly — no commission, no middlemen.
            </p>
            <div className="mt-5 flex items-center gap-2 text-[11.5px] text-gray-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span>Powered by WallXERP</span>
            </div>
          </div>

          {/* ── Browse Column ── */}
          <div>
            <h3 className="mb-4 text-[10.5px] font-bold uppercase tracking-widest text-gray-500">Browse</h3>
            <ul className="space-y-2.5 text-[13px]">
              {[
                { label: 'All Products', href: '/products' },
                { label: 'Fashion & Bags', href: '/products?category=fashion' },
                { label: 'Electronics', href: '/products?category=electronics' },
                { label: 'Food & Groceries', href: '/products?category=food' },
                { label: 'Furniture', href: '/products?category=furniture' },
                { label: 'Services', href: '/products?category=services' },
                { label: 'Books', href: '/products?category=books' },
              ].map(({ label, href }) => (
                <li key={label}>
                  <a href={href} className="text-gray-400 hover:text-white transition-colors">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ── For Merchants Column ── */}
          <div>
            <h3 className="mb-4 text-[10.5px] font-bold uppercase tracking-widest text-gray-500">For Merchants</h3>
            <ul className="space-y-2.5 text-[13px]">
              {[
                { label: 'List Your Products', href: `${appUrl}/inventory?src=marketplace`, external: true },
                { label: 'WallXERP Dashboard', href: `${appUrl}?src=marketplace`, external: true },
                { label: 'Create Free Account', href: `${appUrl}/register?src=marketplace`, external: true },
              ].map(({ label, href, external }) => (
                <li key={label}>
                  <a
                    href={href}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Platform Column ── */}
          <div>
            <h3 className="mb-4 text-[10.5px] font-bold uppercase tracking-widest text-gray-500">Platform</h3>
            <ul className="space-y-2.5 text-[13px]">
              {[
                { label: 'Safe Shopping Guide', href: '#' },
                { label: 'About WallX', href: `${appUrl}/about`, external: true },
                { label: 'Pricing & Plans', href: `${appUrl}/pricing`, external: true },
                { label: 'Contact Us', href: `${appUrl}/contact`, external: true },
                { label: 'Privacy Notice', href: '#' },
              ].map(({ label, href, external }) => (
                <li key={label}>
                  <a
                    href={href}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* ── Bottom strip ── */}
        <div className="mt-10 border-t border-gray-800 pt-7 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[12px] text-gray-600">
            &copy; {year} WallXERP. All rights reserved. Built for Nigerian SMEs.
          </p>
          <p className="text-[11.5px] text-gray-600">
            Marketplace listings are independently operated by verified Nigerian businesses.
          </p>
        </div>
      </div>
    </footer>
  );
}
