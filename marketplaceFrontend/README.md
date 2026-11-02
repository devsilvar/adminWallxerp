# Marketplace Frontend - Astro Boilerplate

A modern, production-ready Astro boilerplate for building marketplace applications with React, TypeScript, and Tailwind CSS.

## 🚀 Quick Start

### Prerequisites

- **Node.js**: v22.23.4 or higher
- **npm**: v10.x or higher

### Installation

1. **Install dependencies:**

```bash
cd marketplaceFrontend
npm install
```

2. **Set up environment variables:**

```bash
# Copy the example env file
copy .env.example .env

# Edit .env with your configuration
```

3. **Start the development server:**

```bash
npm run dev
```

The application will be available at `http://localhost:5175`

## 📦 Project Structure

```
marketplaceFrontend/
├── public/              # Static assets (favicon, images, etc.)
├── src/
│   ├── components/      # Reusable components
│   │   ├── ui/         # Base UI components (Button, Card, Input)
│   │   ├── Header.tsx  # Site header with navigation
│   │   ├── Footer.tsx  # Site footer
│   │   └── ProductCard.tsx  # Product display card
│   ├── layouts/        # Page layouts
│   │   └── Layout.astro  # Main layout wrapper
│   ├── lib/            # Utilities and helpers
│   │   ├── api.ts      # API client and utilities
│   │   └── utils.ts    # General utility functions
│   ├── pages/          # File-based routing
│   │   └── index.astro # Homepage
│   ├── styles/         # Global styles
│   │   └── globals.css # Global CSS with variables
│   └── types/          # TypeScript type definitions
│       └── index.ts    # Shared types
├── astro.config.mjs    # Astro configuration
├── tailwind.config.mjs # Tailwind CSS configuration
├── tsconfig.json       # TypeScript configuration
└── package.json        # Dependencies and scripts
```

## 🛠️ Available Commands

| Command              | Description                                    |
| :------------------- | :--------------------------------------------- |
| `npm install`        | Install all dependencies                       |
| `npm run dev`        | Start development server at `localhost:5175`   |
| `npm run build`      | Build production site (with type checking)     |
| `npm run preview`    | Preview production build locally               |
| `npm run typecheck`  | Run TypeScript type checking                   |

## 🎨 Tech Stack

- **Framework**: [Astro 7.4.2](https://astro.build/) - Fast, content-focused web framework
- **UI Library**: [React 18.3.1](https://react.dev/) - For interactive components
- **Styling**: [Tailwind CSS 3.4.15](https://tailwindcss.com/) - Utility-first CSS framework
- **Language**: [TypeScript 5.7.2](https://www.typescriptlang.org/) - Type-safe JavaScript
- **Icons**: [Lucide React](https://lucide.dev/) - Beautiful icon library
- **Class Management**: clsx + tailwind-merge - Conditional class names

## 📝 Key Features

### Pre-built Components

- **UI Components**: Button, Card, Input with variants
- **Layout Components**: Header with navigation, Footer with links
- **Product Components**: ProductCard for displaying items

### Utilities

- **API Client**: Type-safe API client with error handling
- **Class Utilities**: `cn()` function for merging Tailwind classes
- **Type Definitions**: Shared TypeScript types for products, cart, orders

### Configuration

- **Tailwind Theme**: Custom color palette with CSS variables
- **TypeScript**: Path aliases configured (`@/` for `src/`)
- **Astro**: Optimized for static site generation

## 🎯 Usage Examples

### Creating a New Page

Create a new file in `src/pages/`:

```astro
---
import Layout from '@/layouts/Layout.astro';
---

<Layout title="About Us">
  <div class="container py-12">
    <h1 class="text-4xl font-bold">About Us</h1>
    <p class="mt-4 text-muted-foreground">Welcome to our marketplace!</p>
  </div>
</Layout>
```

### Using Components

```tsx
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardTitle } from '@/components/ui/Card';

export default function MyComponent() {
  return (
    <Card>
      <CardContent>
        <CardTitle>Hello World</CardTitle>
        <Button variant="default" size="lg">
          Click Me
        </Button>
      </CardContent>
    </Card>
  );
}
```

### Making API Calls

```typescript
import { apiFetch } from '@/lib/api';
import type { Product } from '@/types';

// Fetch products
const products = await apiFetch<Product[]>('/api/products');

// Create a product
const newProduct = await apiFetch<Product>('/api/products', {
  method: 'POST',
  body: JSON.stringify({ name: 'New Product', price: 99.99 }),
});
```

## 🎨 Styling Guide

This boilerplate uses Tailwind CSS with a custom design system based on CSS variables.

### Colors

- `primary` - Main brand color
- `secondary` - Secondary actions
- `destructive` - Destructive actions
- `muted` - Muted backgrounds and text
- `accent` - Accent highlights

### Using Colors

```tsx
<div className="bg-primary text-primary-foreground">Primary</div>
<div className="bg-secondary text-secondary-foreground">Secondary</div>
<div className="text-muted-foreground">Muted text</div>
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
PUBLIC_API_URL=http://localhost:3000
PUBLIC_SITE_NAME=Marketplace
PUBLIC_SITE_URL=http://localhost:5175
```

### Tailwind Customization

Edit `tailwind.config.mjs` to customize the design system.

### TypeScript Path Aliases

Configured in `tsconfig.json`:

- `@/*` → `./src/*`
- `@/components/*` → `./src/components/*`
- `@/layouts/*` → `./src/layouts/*`
- `@/lib/*` → `./src/lib/*`
- `@/types/*` → `./src/types/*`

## 📚 Learn More

- [Astro Documentation](https://docs.astro.build)
- [React Documentation](https://react.dev)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [TypeScript Documentation](https://www.typescriptlang.org/docs)

## 🤝 Contributing

This is a boilerplate template. Feel free to customize it for your project needs!

## 📄 License

MIT License - feel free to use this boilerplate for your projects.

