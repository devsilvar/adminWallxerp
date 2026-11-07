import type { ReactNode } from 'react';
import { ScrollReveal } from './anim.tsx';

interface SectionHeaderProps {
  eyebrow?: ReactNode;
  eyebrowIcon?: ReactNode;
  title: string;
  accentWord?: string;
  subtitle?: string;
  align?: 'center' | 'left';
  className?: string;
}

/**
 * Clean editorial Section Header primitive.
 * Enforces solid dark typography (no AI gradient fills) and crisp brand accents.
 */
export function SectionHeader({
  eyebrow,
  eyebrowIcon,
  title,
  accentWord,
  subtitle,
  align = 'center',
  className = '',
}: SectionHeaderProps) {
  const isCenter = align === 'center';

  // Render title with optional highlighted accent word
  const renderTitle = () => {
    if (!accentWord) return title;
    const parts = title.split(accentWord);
    if (parts.length === 1) return title;

    return (
      <>
        {parts[0]}
        <span className='text-primary-600'>{accentWord}</span>
        {parts.slice(1).join(accentWord)}
      </>
    );
  };

  return (
    <ScrollReveal
      className={`mb-10 sm:mb-14 ${isCenter ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl text-left'} ${className}`}
    >
      {eyebrow && (
        <div
          className={`inline-flex items-center gap-2 rounded-full bg-primary-50/80 border border-primary-200/60 px-3.5 py-1 mb-3.5 sm:mb-4 shadow-2xs`}
        >
          {eyebrowIcon}
          <span className='text-xs font-semibold tracking-wide text-primary-700 uppercase'>
            {eyebrow}
          </span>
        </div>
      )}

      <h2 className='text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight leading-tight sm:leading-snug'>
        {renderTitle()}
      </h2>

      {subtitle && (
        <p
          className={`mt-3 sm:mt-4 text-sm sm:text-base text-gray-600 leading-relaxed ${isCenter ? 'max-w-2xl mx-auto' : ''}`}
        >
          {subtitle}
        </p>
      )}
    </ScrollReveal>
  );
}

interface SectionContainerProps {
  id?: string;
  className?: string;
  background?: 'white' | 'gray';
  children: ReactNode;
}

/**
 * Editorial section wrapper enforcing clean, non-AI styling:
 * strictly white or gray-50 background, zero ambient color glow blobs or blur-3xl artifacts.
 */
export function SectionContainer({
  id,
  className = '',
  background = 'white',
  children,
}: SectionContainerProps) {
  const bgClass =
    background === 'gray'
      ? 'bg-gray-50 border-y border-gray-200/70'
      : 'bg-white';

  return (
    <section
      id={id}
      className={`relative py-16 sm:py-20 lg:py-24 overflow-hidden ${bgClass} ${className}`}
    >
      <div className='mx-auto max-w-7xl px-4 sm:px-6'>{children}</div>
    </section>
  );
}

export default SectionHeader;
