# Vercel Environment Variables Setup

## Problem
Products are not showing on your deployed Vercel site because the environment variables are missing.

## Solution
Add these environment variables to your Vercel project:

### Step-by-Step Instructions

1. **Go to Vercel Dashboard**
   - Visit: https://vercel.com/dashboard
   - Find and click your **marketplaceFrontend** project

2. **Navigate to Settings**
   - Click the **Settings** tab at the top
   - Click **Environment Variables** in the left sidebar

3. **Add Each Variable**

#### Variable 1: Backend API URL
```
Name:        PUBLIC_API_URL
Value:       https://paymy-tax.onrender.com
Environments: ✓ Production  ✓ Preview  ✓ Development
```
*Click "Add"*

#### Variable 2: Site Name
```
Name:        PUBLIC_SITE_NAME
Value:       WallX Marketplace
Environments: ✓ Production  ✓ Preview  ✓ Development
```
*Click "Add"*

#### Variable 3: Site URL (Update with your actual Vercel URL)
```
Name:        PUBLIC_SITE_URL
Value:       https://your-project-name.vercel.app
Environments: ✓ Production  ✓ Preview  ✓ Development
```
*Replace `your-project-name` with your actual Vercel URL*
*Click "Add"*

4. **Redeploy Your Site**
   - Go to the **Deployments** tab
   - Find your latest deployment
   - Click the three dots menu (⋯) on the right
   - Click **Redeploy**
   - Wait for the deployment to complete (~2-3 minutes)

5. **Verify**
   - Visit your Vercel URL
   - Products should now display correctly!

## Why This Happens

- `.env` files are NOT uploaded to Vercel (they're in `.gitignore`)
- Vercel needs environment variables added through their dashboard
- Without `PUBLIC_API_URL`, your frontend can't fetch products from the backend

## Alternative: Using Vercel CLI

If you prefer command line:

```bash
# Navigate to project
cd "c:\Users\pc\Desktop\tax by wallx\marketplaceFrontend"

# Add environment variables (will prompt for values)
vercel env add PUBLIC_API_URL production
# Enter: https://paymy-tax.onrender.com

vercel env add PUBLIC_SITE_NAME production
# Enter: WallX Marketplace

vercel env add PUBLIC_SITE_URL production
# Enter: https://your-project-name.vercel.app

# Pull to local (optional)
vercel env pull

# Redeploy
vercel --prod
```

## Quick Check

After redeploying, open your browser console on the Vercel site and check:
- Does it show API errors?
- What URL is it trying to fetch from?

Press F12 → Console tab to see any errors.
