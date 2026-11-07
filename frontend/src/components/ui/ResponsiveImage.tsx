
interface ResponsiveImageProps {
  src: string; // Base filename without extension (e.g., 'team-efficiency')
  alt: string;
  className?: string;
  sizes?: string; // CSS sizes attribute (e.g., '(max-width: 768px) 100vw, 50vw')
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}

/**
 * ResponsiveImage - Renders optimized WebP images with responsive sizing
 * 
 * Automatically serves appropriately sized images based on viewport:
 * - sm (640px) for mobile
 * - md (768px) for tablets
 * - lg (1024px) for desktop
 * 
 * Falls back to original JPG/PNG for browsers without WebP support.
 * 
 * @example
 * <ResponsiveImage 
 *   src="team-efficiency" 
 *   alt="Team Efficiency"
 *   sizes="(max-width: 768px) 100vw, 50vw"
 *   loading="lazy"
 * />
 */
export default function ResponsiveImage({
  src,
  alt,
  className = '',
  sizes = '100vw',
  loading = 'lazy',
  fetchPriority = 'auto',
}: ResponsiveImageProps) {
  // Determine if this is a profile image (smaller) or feature image
  const isProfile = src.startsWith('nigerian');
  const basePath = '/images-optimized';

  if (isProfile) {
    // Profile images: only 2 sizes (sm=32px, md=48px)
    return (
      <picture>
        <source
          type="image/webp"
          srcSet={`${basePath}/${src}-sm.webp 32w, ${basePath}/${src}-md.webp 48w`}
          sizes={sizes}
        />
        {/* Fallback to original */}
        <img
          src={`/assets/${src}.jfif`}
          alt={alt}
          className={className}
          loading={loading}
          fetchPriority={fetchPriority}
        />
      </picture>
    );
  }

  // Feature/hero images: 3 responsive sizes
  return (
    <picture>
      <source
        type="image/webp"
        srcSet={`
          ${basePath}/${src}-sm.webp 640w,
          ${basePath}/${src}-md.webp 768w,
          ${basePath}/${src}-lg.webp 1024w
        `}
        sizes={sizes}
      />
      {/* Fallback to original JPG */}
      <img
        src={`/images/${src}.jpg`}
        alt={alt}
        className={className}
        loading={loading}
        fetchPriority={fetchPriority}
      />
    </picture>
  );
}
