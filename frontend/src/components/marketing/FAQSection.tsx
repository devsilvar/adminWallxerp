import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { faqs, type FAQItem } from '@/data/marketing.ts';
import { SectionHeader } from './Section.tsx';
import { ScrollReveal } from './anim.tsx';

interface FAQSectionProps {
  items?: FAQItem[];
  title?: string;
  accentWord?: string;
  subtitle?: string;
  eyebrow?: string;
  className?: string;
}

export default function FAQSection({
  items = faqs,
  title = 'Frequently asked questions',
  accentWord = 'questions',
  subtitle = 'Everything you need to know about WallXERP, tax calculation, and data privacy.',
  eyebrow = 'Got Questions?',
  className = '',
}: FAQSectionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (idx: number) => {
    setOpenIndex(openIndex === idx ? null : idx);
  };

  return (
    <section
      id='faq'
      className={`scroll-mt-20 sm:scroll-mt-24 py-16 sm:py-20 lg:py-24 bg-white ${className}`}
    >
      <div className='mx-auto max-w-4xl px-4 sm:px-6'>
        <SectionHeader
          eyebrow={eyebrow}
          eyebrowIcon={<HelpCircle className='h-3.5 w-3.5 text-primary-600' />}
          title={title}
          accentWord={accentWord}
          subtitle={subtitle}
        />

        <div className='divide-y divide-gray-200 border-y border-gray-200'>
          {items.map((item, idx) => {
            const isOpen = openIndex === idx;
            return (
              <ScrollReveal key={item.q} delay={Math.min(idx * 30, 150)}>
                <div className='py-4 sm:py-5'>
                  <button
                    onClick={() => toggle(idx)}
                    className='flex w-full items-start justify-between gap-4 text-left font-semibold text-gray-900 transition-colors hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-full p-1'
                    aria-expanded={isOpen}
                  >
                    <span className='text-base sm:text-lg leading-snug'>
                      {item.q}
                    </span>
                    <span className='ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-50 border border-gray-200 text-gray-500'>
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary-600' : ''}`}
                      />
                    </span>
                  </button>

                  {isOpen && (
                    <div className='pt-3 pb-1 pl-1 pr-8 text-sm sm:text-base text-gray-600 leading-relaxed animate-fade-in'>
                      {item.a}
                    </div>
                  )}
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
