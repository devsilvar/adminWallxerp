interface OptimizedLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl'; // Maps to 48, 64, 96, 128px
  alt?: string;
  loading?: 'lazy' | 'eager';
  fetchPriority?: 'high' | 'low' | 'auto';
}

const SIZE_MAP = {
  sm: 48,
  md: 64,
  lg: 96,
  xl: 128,
};

/**
 * OptimizedLogo - Renders the WallXERP logo in optimized WebP format
 *
 * @example
 * <OptimizedLogo size="md" className="h-8" />
 */
export default function OptimizedLogo({
  className = 'h-8 w-auto',
  size = 'md',
  alt = 'WallXERP',
  loading = 'eager', // Logo is typically above the fold
  fetchPriority = 'high',
}: OptimizedLogoProps) {
  const pixelSize = SIZE_MAP[size];
  const basePath = '/images-optimized';

  return (
    <picture>
      <source
        type='image/webp'
        srcSet={`
          ${basePath}/logo-48.webp 48w,
          ${basePath}/logo-64.webp 64w,
          ${basePath}/logo-96.webp 96w,
          ${basePath}/logo-128.webp 128w
        `}
        sizes={`${pixelSize}px`}
      />
      {/* Fallback to PNG */}
      <img
        src='/logo.png'
        alt={alt}
        width={pixelSize}
        height={pixelSize}
        className={className}
        loading={loading}
        fetchPriority={fetchPriority}
      />
    </picture>
  );
}
