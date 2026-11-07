import { useState, useEffect, useRef, type ReactNode, type Ref } from 'react';

/* ─── High-Performance Shared Scroll Observer ─── */
let sharedObserver: IntersectionObserver | null = null;
const observerCallbacks = new Map<Element, () => void>();

export function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined') return null;
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const cb = observerCallbacks.get(entry.target);
            if (cb) {
              cb();
              observerCallbacks.delete(entry.target);
            }
            sharedObserver?.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.05, rootMargin: '120px 0px 80px 0px' },
    );
  }
  return sharedObserver;
}

export function useScrollAnimation<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Immediately reveal if already in/near viewport on mount
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight + 120 && rect.bottom > -80) {
      setIsVisible(true);
      return;
    }

    const observer = getSharedObserver();
    if (!observer) {
      setIsVisible(true);
      return;
    }

    observerCallbacks.set(element, () => setIsVisible(true));
    observer.observe(element);

    return () => {
      observerCallbacks.delete(element);
      observer?.unobserve(element);
    };
  }, []);

  return { ref, isVisible };
}

/* ─── Fast & Crisp Scroll Reveal Components ─── */
export function ScrollReveal({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, isVisible } = useScrollAnimation();
  const effectiveDelay = Math.min(delay, 120);

  return (
    <div
      ref={ref as Ref<HTMLDivElement>}
      className={`transition-[opacity,transform] duration-300 ease-out will-change-[opacity,transform] ${className}`}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
        transitionDelay: `${effectiveDelay}ms`,
      }}
    >
      {children}
    </div>
  );
}

export function StaggerReveal({
  children,
  className = '',
  staggerDelay = 35,
}: {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  const { ref, isVisible } = useScrollAnimation();
  const childArray = Array.isArray(children) ? children : [children];

  return (
    <div ref={ref as Ref<HTMLDivElement>} className={className}>
      {childArray.map((child, i) => (
        <div
          key={i}
          className='transition-[opacity,transform] duration-300 ease-out will-change-[opacity,transform]'
          style={{
            opacity: isVisible ? 1 : 0,
            transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
            transitionDelay: isVisible
              ? `${Math.min(i * staggerDelay, 180)}ms`
              : '0ms',
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
