/**
 * MobileStickyContact — fixed bottom bar on mobile only.
 * Appears on the product detail page.
 * Provides permanent thumb-reach access to WhatsApp and Call.
 * Hidden on md+ screens where the sticky sidebar already handles this.
 */
import { MessageCircle, Phone } from 'lucide-react';
import { useState, useEffect } from 'react';
import { recordListingEvent } from '@/lib/api';

interface MobileStickyContactProps {
  productId?: string;
  whatsappUrl: string | null;
  callUrl: string | null;
  price: string;
}

export default function MobileStickyContact({
  productId,
  whatsappUrl,
  callUrl,
  price,
}: MobileStickyContactProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!whatsappUrl && !callUrl) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/95 backdrop-blur-md border-t border-gray-200 shadow-[0_-4px_24px_0_rgba(0,0,0,0.12)] transition-transform duration-300 ${
        mounted ? 'translate-y-0' : 'translate-y-full'
      }`}
    >
      {/* Safe area padding for iPhone home bar */}
      <div className="px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-2">
          {/* Price reminder */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Price</p>
            <p
              className="text-[1.1rem] font-extrabold text-[#352778] leading-none"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              {price}
            </p>
          </div>

          {/* Call — secondary */}
          {callUrl && (
            <a
              href={callUrl}
              className="shrink-0"
              onClick={() => {
                if (productId) {
                  recordListingEvent(productId, 'call_click', 'mobile_sticky');
                }
              }}
            >
              <button className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-[#352778] px-4 py-2.5 text-[13px] font-bold text-[#352778] hover:bg-[#352778] hover:text-white transition-all active:scale-[0.97]">
                <Phone className="h-4 w-4 shrink-0" />
                Call
              </button>
            </a>
          )}

          {/* WhatsApp — primary CTA */}
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 flex-1"
            >
              <button className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 text-[13.5px] font-bold text-white shadow-sm transition-all active:scale-[0.97]">
                <MessageCircle className="h-4 w-4 shrink-0" />
                Chat on WhatsApp
              </button>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
