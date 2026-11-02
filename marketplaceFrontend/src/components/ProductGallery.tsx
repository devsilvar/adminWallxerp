import { useState } from 'react';
import { Package, ChevronLeft, ChevronRight } from 'lucide-react';

interface ProductGalleryProps {
  images: string[];
  productName: string;
  categoryLabel?: string;
}

export default function ProductGallery({
  images,
  productName,
  categoryLabel = 'Product',
}: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const validImages = images && images.length > 0 ? images : [];
  const currentImage = validImages[selectedIndex] || validImages[0];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIndex((prev) => (prev > 0 ? prev - 1 : validImages.length - 1));
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIndex((prev) => (prev < validImages.length - 1 ? prev + 1 : 0));
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero Display */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-gray-200 bg-gray-50/70 group">
        {currentImage ? (
          <img
            src={currentImage}
            alt={`${productName} - View ${selectedIndex + 1}`}
            className="h-full w-full object-contain p-3 transition-all duration-200"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent) {
                const placeholder = parent.querySelector('.gallery-fallback');
                if (placeholder) {
                  (placeholder as HTMLElement).style.display = 'flex';
                }
              }
            }}
          />
        ) : null}

        {/* Carousel Prev/Next Buttons (only if multiple images) */}
        {validImages.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous image"
              className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-md border border-gray-200 text-gray-700 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-white hover:text-gray-900 cursor-pointer"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next image"
              className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-md border border-gray-200 text-gray-700 opacity-90 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-white hover:text-gray-900 cursor-pointer"
            >
              <ChevronRight className="h-5 w-5" />
            </button>

            {/* Image counter pill */}
            <div className="absolute bottom-3 right-3 rounded-full bg-black/60 backdrop-blur-xs px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs">
              {selectedIndex + 1} / {validImages.length}
            </div>
          </>
        )}

        <div
          className={`gallery-fallback h-full w-full items-center justify-center bg-gradient-to-br from-purple-50 to-purple-100/40 text-purple-300 ${
            currentImage ? 'hidden' : 'flex'
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <Package className="h-14 w-14 stroke-[1] opacity-40 text-[#7c3aed]" />
            <span className="text-xs uppercase tracking-wider text-gray-400 font-bold">
              {categoryLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Thumbnails */}
      {validImages.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
          {validImages.map((img, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSelectedIndex(idx)}
              className={`relative h-18 w-18 shrink-0 overflow-hidden rounded-xl border-2 transition-all cursor-pointer ${
                selectedIndex === idx
                  ? 'border-[#352778] ring-2 ring-purple-200 scale-102 shadow-xs'
                  : 'border-gray-200 opacity-60 hover:opacity-100 hover:border-gray-300'
              }`}
            >
              <img
                src={img}
                alt={`${productName} thumbnail ${idx + 1}`}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
