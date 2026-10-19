# Resend Domain Verification Guide for wallxerp.com

## Current Status

- **Domain**: wallxerp.com
- **Email From**: WallXERP <noreply@wallxerp.com>
- **Resend API Key**: Configured (`re_REPLACE_WITH_YOUR_RESEND_KEY...`)
- **Domain Status**: ⚠️ NEEDS VERIFICATION

## Why Domain Verification is Required

Resend (and all email providers) require domain verification to:

1. Prevent email spoofing
2. Improve deliverability (avoid spam folder)
3. Enable sending from your custom domain

Without verification, emails will fail with: `"domain is not verified"`

## Step-by-Step Verification Process

### Step 1: Access Resend Dashboard

1. Go to: https://resend.com/login
2. Log in with your Resend account
3. Navigate to: **Domains** (left sidebar) or https://resend.com/domains

### Step 2: Add Your Domain

1. Click **"Add Domain"** button
2. Enter: `wallxerp.com`
3. Click **"Add"**

### Step 3: Get DNS Records

After adding the domain, Resend will provide DNS records to add. You'll typically see:

**Records you need to add:**

1. **SPF Record** (TXT)

   ```
   Type: TXT
   Name: @
   Value: v=spf1 include:_spf.resend.com ~all
   ```

2. **DKIM Records** (CNAME) - Usually 2 records

   ```
   Type: CNAME
   Name: resend._domainkey
   Value: [provided by Resend, e.g., resend._domainkey.u12345.resend.com]

   Type: CNAME
   Name: resend2._domainkey
   Value: [provided by Resend, e.g., resend2._domainkey.u12345.resend.com]
   ```

3. **DMARC Record** (TXT) - Optional but recommended
   ```
   Type: TXT
   Name: _dmarc
   Value: v=DMARC1; p=none; rua=mailto:dmarc@wallxerp.com
   ```

### Step 4: Add DNS Records

#### Where to Add DNS Records?

You need to add these records where your domain is hosted. Common providers:

**If using Cloudflare:**

1. Go to https://dash.cloudflare.com
2. Select `wallxerp.com`
3. Go to **DNS** > **Records**
4. Click **Add record**
5. Add each record provided by Resend

**If using GoDaddy:**

1. Go to https://dcc.godaddy.com/manage/dns
2. Find `wallxerp.com`
3. Manage DNS
4. Add records

**If using Namecheap:**

1. Go to Domain List
2. Click Manage next to `wallxerp.com`
3. Advanced DNS
4. Add records

**Other providers:** Check their DNS management section

#### Adding Records Example (Cloudflare):

```
Record 1:
Type: TXT
Name: @
Content: v=spf1 include:_spf.resend.com ~all
TTL: Auto
Proxy: Off (DNS only)

Record 2:
Type: CNAME
Name: resend._domainkey
Target: [value from Resend]
TTL: Auto
Proxy: Off (DNS only)

Record 3:
Type: CNAME
Name: resend2._domainkey
Target: [value from Resend]
TTL: Auto
Proxy: Off (DNS only)
```

### Step 5: Wait for Propagation

- DNS changes can take 5 minutes to 48 hours
- Usually takes 10-30 minutes
- Check status in Resend dashboard

### Step 6: Verify in Resend

1. Go back to Resend Domains page
2. Click **"Verify"** next to wallxerp.com
3. Status should change to **"Verified"** ✅

## Quick Test Option (While Waiting for Verification)

If you want to test emails immediately before domain verification completes, you can temporarily use Resend's test domain:

```bash
# In backend/.env, temporarily change:
EMAIL_FROM=WallXERP <noreply@resend.dev>

# OR use onboarding subdomain:
EMAIL_FROM=WallXERP <onboarding@resend.dev>
```

This will work immediately but emails will come from `resend.dev` domain (not ideal for production).

## Testing After Verification

Once verified, test with:

```bash
cd backend

# Test all email scenarios
npm run test:emails -- --email your-real-email@gmail.com

# Or test specific scenario
npm run test:emails -- --email your-real-email@gmail.com --scenario welcome
```

## Checking DNS Records

To verify your DNS records are set correctly:

**Online Tools:**

- https://mxtoolbox.com/spf.aspx (SPF check)
- https://mxtoolbox.com/dkim.aspx (DKIM check)
- https://mxtoolbox.com/dmarc.aspx (DMARC check)

**Command Line:**

```bash
# Check SPF
nslookup -type=txt wallxerp.com

# Check DKIM (replace with actual selector from Resend)
nslookup -type=cname resend._domainkey.wallxerp.com
nslookup -type=cname resend2._domainkey.wallxerp.com
```

## Common Issues

### Issue 1: "Domain not verified" error persists

**Solutions:**

- Wait longer (DNS propagation takes time)
- Double-check DNS records match exactly what Resend provided
- Make sure no typos in record names or values
- Try clearing DNS cache: `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (Mac)

### Issue 2: DNS records not propagating

**Check:**

- Records were added to correct domain (wallxerp.com, not subdomain)
- TTL is reasonable (auto or 300-3600 seconds)
- No conflicting existing records

### Issue 3: Verification fails in Resend

**Try:**

- Click "Verify" again after waiting 15-30 minutes
- Check DNS records are visible using online tools
- Contact Resend support if records are correct but verification fails

## Current Configuration Summary

```bash
# Updated in backend/.env:
EMAIL_FROM=WallXERP <noreply@wallxerp.com>
RESEND_API_KEY=re_placeholder_xxxxxxxxxxxxxxxxxxxx
FRONTEND_URL=http://localhost:5173,https://wallxerp.com
```

## Next Steps

1. ✅ Configuration updated to use wallxerp.com
2. 🔲 Verify wallxerp.com in Resend dashboard
3. 🔲 Add DNS records at your domain provider
4. 🔲 Wait for DNS propagation (10-30 mins)
5. 🔲 Verify domain status in Resend
6. 🔲 Run email tests: `npm run test:emails -- --email your@email.com`

## Support Resources

- **Resend Docs**: https://resend.com/docs/dashboard/domains/introduction
- **Resend Dashboard**: https://resend.com/domains
- **DNS Propagation Checker**: https://www.whatsmydns.net
- **MX Toolbox**: https://mxtoolbox.com
