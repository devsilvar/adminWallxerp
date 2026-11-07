## ⚠️ CRITICAL: Current Issue - Wrong API URL

**The marketplace is showing zero products because the `PUBLIC_API_URL` in Vercel is pointing to the wrong server!**

Current (WRONG): `https://paymy-tax.onrender.com/api/v1`  
Correct: `https://paymaytax-api-production.up.railway.app/api/v1`

The Render URL returns HTML error pages instead of JSON, causing the marketplace to fail silently.

---

# Vercel Environment Variables Setup

## ⚠️ IMPORTANT: Required Environment Variables

The marketplace "Sell on WallX" button currently points to `localhost:5174` because the environment variable is not set in Vercel.

## Environment Variables Explained

### Separate URLs for Different Purposes:

1. **`PUBLIC_API_URL`** - Backend API (Railway)
   - Used for: Fetching products, listings, etc.
   - Example: `https://paymaytax-api-production.up.railway.app/api/v1`

2. **`PUBLIC_SITE_URL`** - Marketplace frontend (this site)
   - Used for: SEO, canonical URLs, social sharing
   - Example: `https://marketplace-frontend-self-sigma.vercel.app`

3. **`PUBLIC_APP_URL`** - Main WallXERP Dashboard (for customers/SMEs)
   - Used by: Backend to generate links back to the main app
   - Example: `https://wallx-tax.vercel.app`

4. **`PUBLIC_MERCHANT_PORTAL_URL`** - Admin/Merchant Portal (for sellers)
   - Used by: "Sell on WallX" button to direct merchants to inventory management
   - Example: `https://admin-dashboard.vercel.app`

## Step-by-Step Setup

### 1. Go to Vercel Dashboard
Visit: https://vercel.com/yusf/marketplace-frontend/settings/environment-variables

### 2. Add These Environment Variables

Click **"Add New"** and add each variable:

| Variable Name | Value | Environment | Purpose |
|--------------|-------|-------------|---------|
| `PUBLIC_API_URL` | `https://paymaytax-api-production.up.railway.app/api/v1` | All | Backend API |
| `PUBLIC_SITE_NAME` | `WallX Marketplace` | All | Site branding |
| `PUBLIC_SITE_URL` | `https://marketplace-frontend-self-sigma.vercel.app` | Production | Marketplace URL |
| `PUBLIC_APP_URL` | `https://wallx-tax.vercel.app` | All | Main WallXERP Dashboard |
| `PUBLIC_MERCHANT_PORTAL_URL` | **[YOUR ADMIN DASHBOARD URL]** | All | Merchant/Seller Portal |

### 3. What is PUBLIC_MERCHANT_PORTAL_URL?

This is the URL to your **Admin/Merchant Dashboard** (the `adminFrontend` app) where sellers:
- Manage their inventory at `/inventory`
- Post new ads/products
- View their sales
- Update listings

The "Sell on WallX" button links to: `${PUBLIC_MERCHANT_PORTAL_URL}/inventory?src=marketplace`

**This is DIFFERENT from `PUBLIC_APP_URL`:**
- `PUBLIC_APP_URL` = Main app for customers/SMEs (tax management, invoices, etc.)
- `PUBLIC_MERCHANT_PORTAL_URL` = Admin panel for marketplace sellers

### 4. After Adding Variables

You have 2 options:

**Option A: Redeploy via CLI** (Recommended)
```bash
cd marketplaceFrontend
vercel --prod
```

**Option B: Via Dashboard**
1. Go to: https://vercel.com/yusf/marketplace-frontend
2. Click the latest deployment
3. Click the **⋯** menu → **"Redeploy"**
4. ✅ Check **"Use existing Build Cache"**
5. Click **"Redeploy"**

## Verification

After redeployment, check:
1. Visit: https://marketplace-frontend-self-sigma.vercel.app
2. Click the **"Sell on WallX"** button in the header
3. It should open your admin dashboard at `/inventory`, NOT localhost

## Current Issue

Right now, clicking "Sell on WallX" tries to open `http://localhost:5174/inventory` which:
- ❌ Doesn't work in production
- ❌ Confuses users
- ❌ Looks unprofessional

After setting `PUBLIC_MERCHANT_PORTAL_URL`, it will open:
- ✅ `https://your-admin-url.vercel.app/inventory?src=marketplace`
- ✅ Tracks that users came from marketplace
- ✅ Works correctly in production

---

## Admin Frontend Deployment (If Not Done Yet)

If your `adminFrontend` is not deployed:

```bash
cd adminFrontend
vercel --prod
```

Then use that Vercel URL for `PUBLIC_MERCHANT_PORTAL_URL`.

---

## Quick Reference

```bash
# Local development
PUBLIC_API_URL=http://localhost:3000
PUBLIC_SITE_URL=http://localhost:5175
PUBLIC_APP_URL=http://localhost:5173
PUBLIC_MERCHANT_PORTAL_URL=http://localhost:5174

# Production
PUBLIC_API_URL=https://paymaytax-api-production.up.railway.app/api/v1
PUBLIC_SITE_URL=https://marketplace-frontend-self-sigma.vercel.app
PUBLIC_APP_URL=https://wallx-tax.vercel.app
PUBLIC_MERCHANT_PORTAL_URL=https://your-admin-dashboard.vercel.app
```
