import { useState } from 'react';
import Button from '@/components/ui/Button.tsx';
import {
  Lightbulb,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Edit2,
  Package,
} from 'lucide-react';
import type { MarketplaceProduct } from '@/types/index.ts';

type ListingOptimizationPanelProps = {
  products: MarketplaceProduct[];
  onEditProduct: (product: MarketplaceProduct) => void;
};

export default function ListingOptimizationPanel({
  products,
  onEditProduct,
}: ListingOptimizationPanelProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Filter for active listings with listing score < 70 or with tips
  const needsAttention = products.filter(
    (p) =>
      p.status !== 'archived' &&
      p.listingScore &&
      (p.listingScore.score < 70 || (p.listingScore.tips && p.listingScore.tips.length > 0))
  );

  if (needsAttention.length === 0) {
    return null;
  }

  return (
    <div
      data-testid="listing-optimization-panel"
      className="bg-amber-50/80 border border-amber-200 rounded-xl overflow-hidden transition-all shadow-sm"
    >
      <div className="p-4 sm:p-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 rounded-lg text-amber-700 mt-0.5 flex-shrink-0">
            <Lightbulb className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-amber-900">
                Why isn't this selling? Optimize your listings first
              </h3>
              <span className="text-[11px] font-semibold bg-amber-200/70 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {needsAttention.length} {needsAttention.length === 1 ? 'listing needs' : 'listings need'} attention
              </span>
            </div>
            <p className="text-xs text-amber-800 mt-1 max-w-2xl leading-relaxed">
              Before expanding your showcase capacity, optimize your existing listings.
              Listings with a strength score of 70+ and multiple photos get up to 4× more
              buyer contacts.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-amber-700 hover:text-amber-900 p-1.5 rounded-md hover:bg-amber-100 transition-colors flex-shrink-0"
          title={isExpanded ? 'Collapse optimization recommendations' : 'Expand optimization recommendations'}
        >
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>
      </div>

      {isExpanded && (
        <div className="border-t border-amber-200/70 bg-white/70 divide-y divide-amber-100">
          {needsAttention.map((product) => {
            const score = product.listingScore?.score ?? 0;
            const tips = product.listingScore?.tips ?? [];

            return (
              <div
                key={product.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0 border border-gray-200">
                    {product.images && product.images[0] ? (
                      <img
                        src={product.images[0]}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 text-sm">
                        {product.name}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          score >= 70
                            ? 'bg-emerald-100 text-emerald-800'
                            : score >= 50
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        Score: {score}/100
                      </span>
                    </div>

                    {tips.length > 0 ? (
                      <ul className="mt-1 list-disc pl-4 space-y-0.5 text-gray-600 text-[11px]">
                        {tips.slice(0, 2).map((tip, idx) => (
                          <li key={idx}>{tip}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-gray-500 text-[11px] mt-0.5">
                        Add detailed description and product attributes to raise score.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onEditProduct(product)}
                    className="text-xs border-amber-300 text-amber-900 hover:bg-amber-100"
                  >
                    <Edit2 className="w-3.5 h-3.5 mr-1" /> Improve Listing
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
