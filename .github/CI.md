# CI/CD Pipeline

## Automated Checks

Every push and pull request to `main` or `develop` runs:

1. **TypeScript Compilation** (`npm run typecheck`)
   - Ensures code compiles without errors
   - Catches type mismatches before deployment

2. **Schema Validation** (`npx prisma validate`)
   - Verifies Prisma schema is valid
   - Prevents schema drift issues

3. **Database Migrations** (`npx prisma migrate deploy`)
   - Ensures migrations run cleanly
   - Tests against PostgreSQL 15

4. **Full Test Suite** (`npm run test:e2e`)
   - Runs all 101 end-to-end tests
   - Validates API endpoints, webhooks, and business logic

## Status Badge

Add to README.md:
```markdown
![CI](https://github.com/YOUR_USERNAME/YOUR_REPO/workflows/CI/badge.svg)
```

## Local Testing

Before pushing, run:

```bash
cd backend

# TypeScript check
npm run typecheck

# Validate schema
npx prisma validate

# Run tests
npm run test:e2e
```

All should pass ✅

## What This Prevents

- ❌ TypeScript errors reaching production
- ❌ Schema drift (models without migrations)
- ❌ Breaking changes to existing functionality
- ❌ Webhook signature failures
- ❌ Database migration issues

## Workflow File

`.github/workflows/ci.yml`

The workflow uses:
- Node.js 20
- PostgreSQL 15 (via GitHub Actions services)
- Cached npm dependencies for speed
