import {
  ShieldCheck,
  BadgeCheck,
  Globe2,
  Star,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { useDocumentTitle } from '@/components/marketing/useDocumentTitle.ts';
import { ScrollReveal, StaggerReveal } from '@/components/marketing/anim.tsx';
import { SectionHeader, SectionContainer } from '@/components/marketing/Section.tsx';
import FinalCta from '@/components/marketing/FinalCta.tsx';
import { testimonials } from '@/data/marketing.ts';

export default function About() {
  useDocumentTitle(
    'About WallXERP — Nigerian SME Tax Compliance & Ledger',
    'Learn how WallXERP helps Nigerian businesses track sales, handle VAT and income tax correctly, and stay FIRS/NRS compliant.',
  );

  return (
    <div className='bg-white'>
      {/* ── 1. Editorial Header & Mission Story ── */}
      <section className='pt-12 sm:pt-16 lg:pt-20 pb-12 sm:pb-16 bg-white border-b border-gray-100'>
        <div className='mx-auto max-w-4xl px-4 sm:px-6 text-center'>
          <ScrollReveal>
            <div className='inline-flex items-center gap-2 rounded-full bg-primary-50 border border-primary-200/80 px-3.5 py-1 mb-4 sm:mb-5 shadow-2xs'>
              <ShieldCheck className='h-3.5 w-3.5 text-primary-600' />
              <span className='text-xs font-semibold tracking-wide text-primary-800 uppercase'>
                Our Mission & Story
              </span>
            </div>

            <h1 className='text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight sm:leading-snug'>
              Built for Nigerian business owners, not{' '}
              <span className='text-primary-600'>tax accountants.</span>
            </h1>

            <p className='mt-6 text-base sm:text-lg text-gray-600 leading-relaxed text-left sm:text-center max-w-3xl mx-auto'>
              Running an SME in Nigeria is demanding enough without the dread of
              complex tax spreadsheets and arbitrary penalties. WallXERP was
              founded in Lagos to solve a single fundamental problem: give
              traders, retailers, and service providers an unshakeable system of
              record that calculates taxes automatically according to official
              NRS standards.
            </p>
          </ScrollReveal>
        </div>
      </section>

      {/* ── 2. The Core Philosophy (3 Pillars) ── */}
      <SectionContainer background='gray'>
        <SectionHeader
          eyebrow='Core Principles'
          title='Our commitments to Nigerian businesses.'
          accentWord='commitments'
          subtitle='Every line of code and tax formula is governed by three foundational pillars.'
        />

        <div className='grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8'>
          {[
            {
              icon: ShieldCheck,
              title: 'Correct Rates, Not One Flat Number',
              description:
                'Nigeria does not run on a single tax number: VAT is a flat 7.5%, while company income tax is charged on your chargeable profit at the rate your turnover attracts. We calculate what you actually owe from your real records — with verifiable audit trails and locked tax periods that prevent penalties.',
            },
            {
              icon: Lock,
              title: 'Non-Custodial Architecture',
              description:
                'Your capital is yours. We partner directly with CBN-licensed banks and Paystack to handle dedicated virtual accounts and tax remittance with enterprise AES-256 encryption.',
            },
            {
              icon: CheckCircle2,
              title: 'Data Always Accessible',
              description:
                'Your financial records are never held hostage. Even on our free plan or following a downgrade, your historical ledger, sales transactions, and tax reports remain 100% readable and exportable.',
            },
          ].map((pillar, i) => (
            <ScrollReveal key={pillar.title} delay={i * 60}>
              <div className='h-full flex flex-col rounded-xl border border-gray-200 bg-white p-6 sm:p-7 shadow-2xs hover:shadow-md transition-all'>
                <div className='flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700 border border-primary-100 mb-5'>
                  <pillar.icon className='h-6 w-6' />
                </div>
                <h3 className='text-lg sm:text-xl font-bold text-gray-900 mb-2'>
                  {pillar.title}
                </h3>
                <p className='text-sm text-gray-600 leading-relaxed'>
                  {pillar.description}
                </p>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </SectionContainer>

      {/* ── 3. Why Businesses Trust Us (Trust & Security) ── */}
      <SectionContainer background='white'>
        <SectionHeader
          eyebrow='Security & Compliance'
          eyebrowIcon={<BadgeCheck className='h-3.5 w-3.5 text-primary-600' />}
          title='Enterprise-grade infrastructure designed for SMEs.'
          accentWord='Enterprise-grade'
          subtitle='Reliable technology that protects your balance sheets and guarantees regulatory accuracy.'
        />

        <div className='grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl mx-auto'>
          {[
            {
              title: 'Precise Tax Calculation',
              description:
                'NRS-compliant VAT and profit-tax calculations with automated deduction tracking, month-lock enforcement, and complete audit logs.',
              imgSm: '/images-optimized/step-3-file-tax-sm.webp',
              imgMd: '/images-optimized/step-3-file-tax-md.webp',
              fallback: '/images/step-3-file-tax.jpg',
            },
            {
              title: 'Bank-Level Security',
              description:
                'AES-256 encryption at rest and TLS 1.3 in transit. Payments processed through Paystack PCI-DSS Level 1 certified infrastructure.',
              imgSm: '/images-optimized/compliance-secure-sm.webp',
              imgMd: '/images-optimized/compliance-secure-md.webp',
              fallback: '/images/compliance-secure.jpg',
            },
            {
              title: 'Smart Analytics & KPIs',
              description:
                'Real-time financial visibility with gross profit margins, revenue growth breakdowns, and AI-driven expense leak warnings.',
              imgSm: '/images-optimized/analytics-feature-sm.webp',
              imgMd: '/images-optimized/analytics-feature-md.webp',
              fallback: '/images/analytics-feature.jpg',
            },
            {
              title: 'Automated Remittance & Inflow Capture',
              description:
                'Dedicated Virtual Accounts automatically turn customer bank transfers into reconciled sales with verifiable PDF receipts.',
              imgSm: '/images-optimized/step-2-transactions-sm.webp',
              imgMd: '/images-optimized/step-2-transactions-md.webp',
              fallback: '/images/step-2-transactions.jpg',
            },
          ].map((card, i) => (
            <ScrollReveal key={card.title} delay={i * 50}>
              <div className='flex items-center gap-4 sm:gap-5 bg-white border border-gray-200/90 rounded-xl overflow-hidden p-3.5 sm:p-4 shadow-2xs hover:shadow-md transition-all'>
                <div className='shrink-0 w-20 sm:w-24 h-20 sm:h-24 rounded-lg overflow-hidden bg-gray-100'>
                  <picture>
                    <source type='image/webp' srcSet={`${card.imgSm} 640w, ${card.imgMd} 768w`} />
                    <img
                      src={card.fallback}
                      alt={card.title}
                      className='w-full h-full object-cover'
                      loading='lazy'
                    />
                  </picture>
                </div>
                <div className='min-w-0 flex-1'>
                  <h3 className='text-base font-bold text-gray-900 mb-1 leading-snug'>
                    {card.title}
                  </h3>
                  <p className='text-xs sm:text-sm text-gray-600 leading-relaxed'>
                    {card.description}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </SectionContainer>

      {/* ── 4. Showcase Gallery (Real Operations Across Nigeria) ── */}
      <SectionContainer background='gray'>
        <SectionHeader
          eyebrow='Operational Showcase'
          eyebrowIcon={<Globe2 className='h-3.5 w-3.5 text-primary-600' />}
          title='Trusted by growing businesses across Nigeria.'
          accentWord='Nigeria.'
          subtitle='From bustling retail stores in Lagos to distribution hubs in Kano and Abuja.'
        />

        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'>
          {[
            {
              imageName: 'workspace',
              title: 'Professional Setup',
              subtitle: 'Clean workspace, clear daily ledgers',
            },
            {
              imageName: 'team-efficiency',
              title: 'Team Efficiency',
              subtitle: 'Collaborative permissions for sales staff & accountants',
            },
            {
              imageName: 'mobile-interface',
              title: 'On-The-Go Tracking',
              subtitle: 'Log sales from markets, counters, or meetings',
            },
            {
              imageName: 'business-growth',
              title: 'Growth Metrics',
              subtitle: 'Track profit margins and seasonal demand',
            },
            {
              imageName: 'dashboard-hero',
              title: 'Real-Time Insights',
              subtitle: 'Live unified financial balances',
            },
            {
              imageName: 'compliance-secure',
              title: 'Audit & Compliance',
              subtitle: 'FIRS & NRS statement generation',
            },
          ].map((item, i) => (
            <ScrollReveal key={item.title} delay={i * 40}>
              <div className='group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xs hover:shadow-md transition-all'>
                <div className='h-48 overflow-hidden bg-gray-100'>
                  <picture>
                    <source
                      type='image/webp'
                      srcSet={`/images-optimized/${item.imageName}-sm.webp 640w, /images-optimized/${item.imageName}-md.webp 768w`}
                    />
                    <img
                      src={`/images/${item.imageName}.jpg`}
                      alt={item.title}
                      className='w-full h-full object-cover transition-transform duration-500 group-hover:scale-105'
                      loading='lazy'
                    />
                  </picture>
                </div>
                <div className='p-4'>
                  <h3 className='text-base font-bold text-gray-900 mb-0.5'>
                    {item.title}
                  </h3>
                  <p className='text-xs text-gray-600'>{item.subtitle}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </SectionContainer>

      {/* ── 5. Full Testimonials Roster ── */}
      <SectionContainer background='white'>
        <SectionHeader
          eyebrow='Founder Testimonials'
          eyebrowIcon={<Star className='h-3.5 w-3.5 text-primary-600' />}
          title='What Nigerian founders say about WallXERP.'
          accentWord='WallXERP.'
          subtitle='Real feedback from businesses managing daily transactions and filing compliance reports.'
        />

        <StaggerReveal
          staggerDelay={60}
          className='grid grid-cols-1 md:grid-cols-3 gap-6'
        >
          {testimonials.map((t) => (
            <div
              key={t.name}
              className='h-full flex flex-col justify-between rounded-xl border border-gray-200 bg-white p-6 shadow-2xs hover:shadow-md transition-all'
            >
              <div>
                <div className='flex gap-1 mb-4 text-amber-500'>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className='h-4 w-4 fill-amber-400 text-amber-400'
                    />
                  ))}
                </div>
                <p className='text-sm text-gray-700 leading-relaxed italic'>
                  "{t.quote}"
                </p>
              </div>

              <div className='mt-6 pt-4 border-t border-gray-100 flex items-center gap-3'>
                <div className='flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white font-bold text-sm'>
                  {t.avatar}
                </div>
                <div>
                  <div className='text-sm font-bold text-gray-900'>{t.name}</div>
                  <div className='text-xs text-gray-500'>{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </StaggerReveal>
      </SectionContainer>

      {/* ── 6. Final CTA ── */}
      <FinalCta
        title='Experience effortless tax compliance for your business.'
        accentWord='compliance'
        subtitle='Join Nigerian business owners who have simplified their accounting and eliminated tax stress.'
        buttonText='Start Free Account'
        buttonLink='/register'
      />
    </div>
  );
}
