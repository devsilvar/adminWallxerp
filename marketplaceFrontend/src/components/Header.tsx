import { 
  Search, 
  PlusCircle, 
  Menu, 
  X,
  ExternalLink
} from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  cartItemCount?: number;
}

export default function Header({ cartItemCount: _cartItemCount = 0 }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const appUrl = import.meta.env.PUBLIC_APP_URL || '';
  const merchantPortalUrl = import.meta.env.PUBLIC_MERCHANT_PORTAL_URL || import.meta.env.PUBLIC_APP_URL || '';

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/products?search=${encodeURIComponent(searchQuery.trim())}`;
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200/70 bg-white/96 backdrop-blur-md shadow-[0_1px_3px_0_rgba(0,0,0,0.06)]">
      {/* ── Inner shell: max-w-[1152px] centred — 82% at 1400px wide ── */}
      <div className="mx-auto max-w-[1152px] px-5 sm:px-8 flex h-16 items-center gap-4">

        {/* ── Real WallX Logo (same component as marketing Nav.tsx) ── */}
        <a href="/" className="flex items-center gap-2.5 shrink-0 group" aria-label="WallX Marketplace Home">
          <picture>
            <source
              type="image/webp"
              srcSet="/images-optimized/logo-48.webp 48w, /images-optimized/logo-64.webp 64w, /images-optimized/logo-96.webp 96w"
              sizes="40px"
            />
            <img
              src="/logo.png"
              alt="WallX"
              width={40}
              height={40}
              className="h-9 w-auto"
              fetchPriority="high"
            />
          </picture>
          <div className="flex flex-col leading-none">
            <span className="text-[15px] font-extrabold tracking-tight text-gray-900" style={{ fontFamily: "'Montserrat', sans-serif" }}>
              WallX <span className="text-[#352778]">Market</span>
            </span>
            <span className="text-[9.5px] font-bold text-gray-400 uppercase tracking-widest mt-px">
              Verified Nigeria Directory
            </span>
          </div>
        </a>

        {/* ── Search Bar (Desktop) ── */}
        <form
          onSubmit={handleSearchSubmit}
          className="hidden md:flex flex-1 max-w-[520px] items-center rounded-full border-2 border-[#352778] bg-white overflow-hidden"
        >
          <Search className="ml-4 h-[18px] w-[18px] text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="What are you looking for?"
            className="w-full bg-transparent pl-3 pr-4 py-[10px] text-[13.5px] text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <button
            type="submit"
            className="bg-[#352778] px-6 py-[10px] text-[13px] font-bold text-white hover:bg-[#2a1f5e] transition-colors"
          >
            Search
          </button>
        </form>

        {/* ── Right: Nav links + CTA ── */}
        <div className="hidden md:flex items-center gap-5 ml-auto">
          <nav className="flex items-center gap-6">
            <a
              href="/products"
              className="text-[13.5px] font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              All Products
            </a>
            <a
              href="/products?category=electronics"
              className="text-[13.5px] font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              Electronics
            </a>
            <a
              href="/products?category=fashion"
              className="text-[13.5px] font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              Fashion
            </a>
          </nav>

          <a
            href={`${merchantPortalUrl}/inventory?src=marketplace`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <button className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#352778] to-[#7c3aed] px-4 py-2 text-[13px] font-bold text-white shadow-sm hover:shadow-md hover:-translate-y-px transition-all duration-200 active:scale-[0.98]">
              <PlusCircle className="h-3.5 w-3.5" />
              Sell on WallX
            </button>
          </a>
        </div>

        {/* ── Mobile hamburger ── */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="ml-auto md:hidden rounded-xl p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* ── Mobile Drawer ── */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white px-5 py-5 space-y-4 shadow-lg">
          <form onSubmit={handleSearchSubmit} className="flex items-center rounded-full border-2 border-[#352778] bg-white overflow-hidden">
            <Search className="ml-3.5 h-4 w-4 text-gray-400 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="What are you looking for?"
              className="w-full bg-transparent pl-2.5 pr-3 py-2 text-sm focus:outline-none"
            />
            <button
              type="submit"
              className="bg-[#352778] px-4 py-2 text-xs font-bold text-white hover:bg-[#2a1f5e] transition-colors"
            >
              Search
            </button>
          </form>

          <nav className="flex flex-col gap-1">
            <a
              href="/products"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              All Products
            </a>
            <a
              href="/products?category=electronics"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Electronics
            </a>
            <a
              href="/products?category=fashion"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Fashion
            </a>
            <a
              href={`${merchantPortalUrl}/inventory?src=marketplace`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-between rounded-xl bg-gradient-to-r from-[#352778] to-[#7c3aed] px-4 py-3 text-sm font-bold text-white"
            >
              <span>Sell on WallX (Merchant Portal)</span>
              <ExternalLink className="h-4 w-4 opacity-80" />
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
