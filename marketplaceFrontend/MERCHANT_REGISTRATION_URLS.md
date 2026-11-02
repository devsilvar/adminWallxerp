# Merchant Registration URLs Configuration

## Overview

The marketplace footer contains links that redirect users to the main WallXERP application for merchant registration, dashboard access, and other platform features. These URLs are now configurable via environment variables.

## Environment Variable

### `PUBLIC_APP_URL`

**Purpose**: Base URL for the main WallXERP application (merchant dashboard)

**Default**: `http://localhost:5173` (for local development)

**Production Example**: `https://app.wallx.ng` or `https://wallx-erp.onrender.com`

### Configuration

Add to your `.env` file (copy from `.env.example`):

```env
# Main Application URL (WallXERP Dashboard)
PUBLIC_APP_URL=http://localhost:5173
```

For production deployment:

```env
PUBLIC_APP_URL=https://your-production-domain.com
```

## Links Using This Variable

The following footer links now use `PUBLIC_APP_URL`:

### For Merchants Column:
- **List Your Products**: `${PUBLIC_APP_URL}/inventory`
- **WallXERP Dashboard**: `${PUBLIC_APP_URL}`
- **Create Free Account**: `${PUBLIC_APP_URL}/register`

### Platform Column:
- **About WallX**: `${PUBLIC_APP_URL}/about`
- **Pricing & Plans**: `${PUBLIC_APP_URL}/pricing`
- **Contact Us**: `${PUBLIC_APP_URL}/contact`

## Implementation Details

The Footer component (`src/components/Footer.tsx`) reads the environment variable:

```tsx
const appUrl = import.meta.env.PUBLIC_APP_URL || 'http://localhost:5173';
```

All merchant-related links use this variable:

```tsx
{ label: 'Create Free Account', href: `${appUrl}/register`, external: true }
```

## Deployment Checklist

When deploying to production:

1. ✅ Set `PUBLIC_APP_URL` to your production domain
2. ✅ Ensure the domain includes the protocol (`https://`)
3. ✅ No trailing slash in the URL
4. ✅ Rebuild the application after changing environment variables
5. ✅ Test all footer links to verify they point to the correct domain

## Development vs Production

| Environment | PUBLIC_APP_URL | Description |
|-------------|----------------|-------------|
| **Local Dev** | `http://localhost:5173` | Frontend dev server |
| **Staging** | `https://staging.wallx.ng` | Staging environment |
| **Production** | `https://app.wallx.ng` | Production domain |

## Why This Matters

Without this configuration:
- ❌ Hardcoded localhost links wouldn't work in production
- ❌ Users would see broken registration links
- ❌ Merchant onboarding would fail

With environment variables:
- ✅ Same codebase works in dev and production
- ✅ Easy to update domains without code changes
- ✅ Proper merchant registration flow
- ✅ Seamless cross-domain navigation

## Troubleshooting

**Issue**: Links still point to localhost in production

**Solution**: 
1. Check that `PUBLIC_APP_URL` is set in your production environment
2. Rebuild the application (Astro bakes env vars at build time)
3. Clear browser cache

**Issue**: Links show "undefined" 

**Solution**: Ensure the env variable starts with `PUBLIC_` (required by Astro for client-side access)

---

**Last Updated**: October 31, 2026  
**Related Files**: 
- `src/components/Footer.tsx`
- `.env.example`
