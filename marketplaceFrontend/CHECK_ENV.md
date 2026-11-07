# Environment Variable Debugging

## Issue: Products Not Showing

The marketplace shows "No Approved Products" even though 2 products exist and are approved in the database.

## Root Cause

During Vercel build, `import.meta.env.PUBLIC_API_URL` is undefined or incorrect, causing:
1. API calls to fail during SSR/pre-rendering
2. Empty products array `[]` 
3. "No products" message displayed

## Verified Working

Both API endpoints return the 2 products correctly:
- ✅ Render: `https://paymy-tax.onrender.com/api/v1/marketplace/products` → 2 products
- ✅ Railway: `https://paymaytax-api-production.up.railway.app/api/v1/marketplace/products` → 2 products

## Fix Steps

1. Go to: https://vercel.com/yusf/marketplace-frontend/settings/environment-variables

2. Find `PUBLIC_API_URL` variable

3. **CRITICAL**: Make sure it's checked for ALL THREE environments:
   - ✅ Production
   - ✅ Preview
   - ✅ Development

4. Value should be: `https://paymy-tax.onrender.com/api/v1` (or Railway URL)

5. If not checked for all environments, EDIT the variable and check all boxes

6. Save and redeploy: `vercel --prod`

## Why This Happens

Astro pre-renders pages during the BUILD step. The build might use Development/Preview environment variables, not Production ones. If `PUBLIC_API_URL` is only set for Production, the build fails to fetch products.

## Test After Fix

```bash
# After redeploying, products should appear
curl https://marketplace-frontend-self-sigma.vercel.app/ | grep -i "leather"
```

You should see the product names in the HTML.
