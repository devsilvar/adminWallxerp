# UX & Frontend Design Guidelines

## 1. Design System & Typography

- **Primary Brand Color**: Purple palette (`primary-500: #7c3aed`, `primary-600: #6d28d9`, `primary-700: #5b21b6`).
- **Accent Colors**:
  - Emerald (`#10b981` / `#059669`): Successful transactions, FIRS Active badge, settled sales.
  - Amber (`#f59e0b`): Draft statuses, pending verifications, margin warnings.
  - Rose / Red (`#ef4444`): Overdue debt, locked periods, PIN attempts exhausted.
- **Typography**:
  - Headings: Montserrat (`@fontsource/montserrat`) with font weights 600–800.
  - Body & UI: Inter (`@fontsource/inter`) with font weights 400–600.
  - Numbers & Currency: Tabular figures enabled (`tabular-nums`) for currency amounts and tabular data.

---

## 2. Layout & Responsive Breakpoints

- Mobile-first approach using standard Tailwind CSS breakpoints:
  - `sm`: 640px
  - `md`: 768px
  - `lg`: 1024px
  - `xl`: 1280px
  - `2xl`: 1536px
- Desktop Navigation: Sticky route-aware navbar with authenticated user pill.
- Mobile Navigation: Slide-over drawer with backdrop blur, full touch optimization, and 44px minimum tap targets.

---

## 3. UI States Standard

Every interactive view or data grid must support four explicit states:

1. **Loading State**: Render shimmer skeleton loaders (`<Skeleton />`) matching the layout geometry of the expected content. Avoid blank white screens or plain text "Loading...".
2. **Error State**: Render clear error cards (`<ErrorState />`) explaining what failed, accompanied by an actionable "Retry" button.
3. **Empty State**: Render purposeful illustrations or icons (`<EmptyState />`) guiding users to create their first sale, invoice, or credit record.
4. **Data State**: Polished tables or cards featuring zebra striping, truncation with tooltips for long text, and localized currency formatting.

---

## 4. Protected Design Components (Design Freeze)

The following components represent user-approved signatures and **MUST NOT BE CHANGED** without explicit user consent:

1. **Homepage Hero Section (`frontend/src/pages/marketing/Home.tsx`)**:
   - The headline: *"The Toolkit for African Business Owners"* with the dual purple SVG underline.
   - The pill CTAs with sheen and hover glow (*"Start Free Today"* / *"View Tax Reports"*).
   - The interactive 3D browser mockup (`HeroDashboardPreview`) with mouse-tracking tilt, specular reflection, floating FIRS Active badge, and live revenue wave chart.
2. **Masonry Showcase Gallery (`frontend/src/pages/marketing/Home.tsx`)**:
   - The 6-card masonry grid (*"Trusted by growing businesses"*).
   - Responsive WebP picture tags, gradient overlays, hover corner accents, and hover chevrons.

---

## 5. Accessibility (a11y) & Form Standards

- **Inputs**: Always provide explicit `<label>` tags or aria-labels. Display inline validation error messages beneath inputs.
- **Modals**: Focus is trapped inside the active modal; pressing `ESC` closes the modal; body scroll is locked when open.
- **Contrast**: Text contrast ratios must meet WCAG AA standards (minimum 4.5:1 for body copy).
