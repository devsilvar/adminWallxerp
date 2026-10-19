# Deployment & Infrastructure Guide

## 1. Hosting Architecture & Environments

| Component | Provider / Platform | Configuration |
| :--- | :--- | :--- |
| **Backend API** | Railway / Render | Node.js Docker runtime, port 3000, autoscaling |
| **Frontend SPA** | Netlify / Vercel | Static CDN distribution with client-side SPA routing (`_redirects` / `netlify.toml`) |
| **Database** | Neon Serverless / Supabase | PostgreSQL 16+ with connection pooling (PgBouncer) |
| **Storage** | AWS S3 / Cloudinary | Presigned uploads, bucket encryption |

---

## 2. Environment Variables Specification

### Backend Environment (`backend/.env`)
```env
PORT=3000
NODE_ENV=production
DATABASE_URL="postgresql://user:password@neon.tech/paymytax?sslmode=require&pgbouncer=true"
DIRECT_URL="postgresql://user:password@neon.tech/paymytax?sslmode=require"
JWT_ACCESS_SECRET="min-32-chars-high-entropy-secret"
JWT_REFRESH_SECRET="min-32-chars-high-entropy-secret"
ENCRYPTION_KEY="32-byte-hex-key-for-aes-256-gcm-bvn-nin"
HMAC_BLIND_INDEX_KEY="32-byte-hex-key-for-blind-indices"
PAYSTACK_SECRET_KEY="sk_live_..."
PAYSTACK_PUBLIC_KEY="pk_live_..."
FRONTEND_URL="https://app.paymytax.com"
RESEND_API_KEY="re_..."
AWS_ACCESS_KEY_ID="..."
AWS_SECRET_ACCESS_KEY="..."
AWS_REGION="eu-west-1"
AWS_S3_BUCKET="paymytax-receipts-prod"
SENTRY_DSN="https://...@sentry.io/..."
```

### Frontend Environment (`frontend/.env`)
```env
VITE_API_URL="https://api.paymytax.com"
VITE_PAYSTACK_PUBLIC_KEY="pk_live_..."
```

---

## 3. Deployment & Migration Sequence

To prevent downtime and database incompatibilities, deployments follow an atomic forward sequence:

1. **Pre-Deployment**:
   - Run complete test suite and type check.
   - Run physical database snapshot: `npm run db:backup`.
2. **Database Migration**:
   - Run `prisma migrate deploy` against the database (`DIRECT_URL`).
   - Migrations must be backward-compatible (additive columns, nullable fields).
3. **Backend Rollout**:
   - Build API (`npm run build`).
   - Start process with zero-downtime health check verification against `/api/health`.
4. **Frontend Rollout**:
   - Build client (`npm run build`).
   - Deploy static assets to CDN with long-term cache headers on `/assets/*` and zero-cache on `index.html`.

---

## 4. Rollback Process & Disaster Recovery

- **Application Rollback**: Revert deployment commit in CI/CD pipeline or switch active traffic to previous release container.
- **Database Rollback**:
  - If a backward-incompatible migration was deployed, restore from the snapshot generated in step 1 using `npm run db:restore`.
  - Verify restoration and data consistency via `npm run db:dr-verify`.
- **Production Restrictions**:
  - `prisma db push` and `prisma migrate reset` are **STRICTLY PROHIBITED** on staging or production databases.
