# AGENTS.md - Marketplace Frontend

## Operating Instructions for AI Agents

This document defines operational rules for AI agents working on the **Marketplace Frontend** (Jiji.ng-style classifieds platform).

## 1. Project Type

This is a **CLASSIFIEDS MARKETPLACE**, NOT an e-commerce platform:

- Users post ads to sell items (like Craigslist, OLX, Jiji.ng)
- Buyers browse listings and contact sellers directly
- Payment happens OFFLINE (Pay on Delivery)
- No shopping cart, no online checkout
- Platform connects buyers and sellers

## 2. Technology Stack

**LOCKED VERSIONS** - Do not change without approval:

- **Astro**: 4.16.18
- **React**: 18.3.1
- **TypeScript**: 5.7.2
- **Tailwind CSS**: 3.4.15
- **Node.js**: 22.23.4+

**Key Libraries**:
- `clsx` + `tailwind-merge` for class management
- `lucide-react` for icons
- `class-variance-authority` for component variants

## 3. Development Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (port 5175) |
| `npm run build` | Production build with typecheck |
| `npm run preview` | Preview production build |
| `npm run typecheck` | Validate TypeScript |

## 4. File Structure

```
src/
├── components/
│   ├── ui/          # Base components (Button, Card, Input)
│   └── [feature]/   # Feature-specific components
├── layouts/         # Page layouts (Layout.astro)
├── lib/            # Utilities (api.ts, utils.ts)
├── pages/          # File-based routing
├── styles/         # Global CSS
└── types/          # TypeScript definitions
```

## 5. Key Rules

### Component Guidelines
- **UI Components** in `src/components/ui/` must be React components
- Use `cn()` utility for className merging
- Mark React components with `client:load` directive in Astro
- Keep components focused and reusable

### Styling Rules
- **Tailwind First**: Use utility classes
- **CSS Variables**: For theme colors (in `globals.css`)
- **Responsive**: Mobile-first design

### TypeScript Rules
- **Strict Mode**: Enabled
- **Path Aliases**: Use `@/` for `src/`
- **Type Everything**: No `any` without justification

## 6. Jiji.ng Implementation

This marketplace follows the **Jiji.ng model** (classifieds, not e-commerce):

### DO Implement
- ✅ Ad posting forms
- ✅ Listing detail pages
- ✅ Search and filters
- ✅ Seller profiles
- ✅ Direct messaging

### DO NOT Implement
- ❌ Shopping cart
- ❌ Online payment
- ❌ Checkout flow

## 7. Definition of Done

Before marking tasks complete:

1. ✅ TypeScript: No errors (`npm run typecheck`)
2. ✅ Responsive: Works on mobile, tablet, desktop
3. ✅ Styled: Consistent with design system
4. ✅ Documented: Complex logic has comments

## 8. Documentation

- **QUICKSTART.md** - Quick start guide
- **README.md** - Full project documentation
- **JIJI_IMPLEMENTATION_PLAN.md** - Complete implementation roadmap
- **Astro Docs**: https://docs.astro.build

---

**Status**: ✅ Production Ready  
**Last Updated**: October 27, 2026

