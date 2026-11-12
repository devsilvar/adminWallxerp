<!-- markdownlint-disable MD024 -->
# Admin Portal Hardening — Phased Implementation Plan

**Audience:** a developer with a few months of experience who has not worked in this codebase before.
**Status:** Planning. No code has been changed.
**Scope:** `adminFrontend/` (admin portal) plus targeted `backend/` additions.
**Out of scope:** the SME app (`frontend/`). Do not change its behaviour in any phase.

---

## How to use this document

Read this section before touching anything.

1. **Work one phase at a time, in order.** Each phase ends with a commit. Do not start the next phase until the current one's "Verify" section passes.
2. **Every phase is independently shippable.** If you run out of time, stop at a phase boundary. Nothing is left half-wired.
3. **Never edit a file listed under "Do not touch".** Those files are load-bearing and a small change there breaks unrelated features.
4. **When a step says "copy the shape of X", open X and copy it.** Do not invent a new pattern. This codebase is consistent; matching it is the whole job.
5. **Run the verification commands.** "It looks right" is not verification. The commands are there because they catch the mistakes people actually make here.
6. **If a phase's verification fails and you cannot fix it in 30 minutes, revert the phase** (`git checkout -- <files>`) and ask. Do not stack a second fix on top of a broken one.

### Before you start

```bash
cd "C:/Users/pc/Desktop/tax by wallx"
git status                      # must be clean, or know exactly what is dirty
git checkout -b feat/admin-hardening
```

Then run the baseline so you know what "green" looks like:

```bash
cd backend && npm run test:e2e
cd ../adminFrontend && npm run test
```

Write down the pass/fail counts. If something is already failing, that is your baseline — do not try to fix it in this work.

### The four workstreams

| Phase | Workstream | Ships alone? |
| --- | --- | --- |
| 1 | Fix the "Verifying session…" hang | Yes |
| 2 | Seed `richmond@wallx.co` | Yes |
| 3 | Admin tokens move to `sessionStorage` | Yes |
| 4 | Admin idle timeout | Needs Phase 3 |
| 5 | Database model for one-time codes | Yes (inert) |
| 6 | Code generation / verification service | Needs Phase 5 |
| 7 | Email template + dispatcher | Needs Phase 6 |
| 8 | HTTP endpoints | Needs Phase 7 |
| 9 | Admin settings page + wizard | Needs Phase 8 |
| 10 | Optional: server-side logout + admin token TTL | Needs Phase 3 |
| 11 | Full regression pass | Needs all |

---

## Phase 1 — Fix the "Verifying session…" hang

**Goal:** an admin who returns to the portal after their access token expired lands on the dashboard instead of an endless spinner.

**Why this is the first phase:** it is the reported bug, it touches two files, and it has no dependency on anything else.

### The bug, in one paragraph

`fetchMe` in `adminFrontend/src/stores/auth.store.ts` records the access token before calling `/auth/me`. If that token is expired, the axios interceptor silently refreshes it and writes a **new** token to storage. When the request comes back, `fetchMe` compares the stored token to the one it recorded, sees they differ, and returns early — without ever setting `user`. The store is left with `isAuthenticated: true, user: null`, and `AdminRoute` renders a loader that has no exit condition. A manual browser refresh works because the token is now fresh, so no rotation happens.

The guard exists for a good reason: it stops a logged-out session being resurrected by a response that was already in flight. It just cannot tell "rotated by refresh" from "cleared by logout". We replace it with a counter that only changes on real lifecycle events.

### Files you will touch

- `adminFrontend/src/stores/auth.store.ts`
- `adminFrontend/src/routes/AdminRoute.tsx`
- `adminFrontend/src/App.tsx`
- `adminFrontend/src/stores/__tests__/auth.store.test.ts` (new)

### Do not touch

- `adminFrontend/src/lib/axios.ts` — the refresh interceptor is correct. The bug is in the caller.
- `frontend/src/stores/auth.store.ts` — the SME app has a similar guard. It is a separate ticket. Leave it.

### Step 1.1 — Add a session epoch to the store

Open `adminFrontend/src/stores/auth.store.ts`. Near the top, next to `let fetchMeInProgress: Promise<void> | null = null;` (around line 25), add:

```ts
// Bumped by login(), setAuthSession() and logout(). fetchMe compares this
// before and after its request so it can tell "the session was destroyed
// while I was in flight" apart from "the interceptor rotated my token".
let sessionEpoch = 0;
```

Then:

- In `login`, after the two `localStorage.setItem` calls, add `sessionEpoch += 1;`
- In `setAuthSession`, after the two `localStorage.setItem` calls, add `sessionEpoch += 1;`
- In `logout`, as the **first** statement of the function body, add `sessionEpoch += 1;`

### Step 1.2 — Add `hasCheckedAuth` to the store

In the `AuthState` interface, add:

```ts
hasCheckedAuth: boolean;
```

In the initial state object, add:

```ts
hasCheckedAuth: false,
```

In `logout`'s final `set(...)` call, change it to:

```ts
set({ user: null, isAuthenticated: false, hasCheckedAuth: true });
```

### Step 1.3 — Rewrite the `fetchMe` guards

In `fetchMe`, replace the token comparison with the epoch comparison. The function should end up looking like this:

```ts
fetchMe: async () => {
  if (fetchMeInProgress) return fetchMeInProgress;

  const tokenAtStart = localStorage.getItem('accessToken');
  if (!tokenAtStart) {
    set({ hasCheckedAuth: true });
    return;
  }

  const epochAtStart = sessionEpoch;

  fetchMeInProgress = (async () => {
    try {
      const { data } = await api.get('/auth/me');
      // The session was destroyed while this request was in flight.
      if (sessionEpoch !== epochAtStart) return;
      set({ user: data.data, isAuthenticated: true });
    } catch (err) {
      // Only a 401 means the token is genuinely bad. A cold start, a 502 or
      // a dropped packet must NOT sign the admin out.
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 && sessionEpoch === epochAtStart) {
        get().logout();
      }
    } finally {
      set({ hasCheckedAuth: true });
      fetchMeInProgress = null;
    }
  })().catch((e) => {
    fetchMeInProgress = null;
    throw e;
  });

  return fetchMeInProgress;
},
```

Note the two changes that matter: the guard is now `sessionEpoch !== epochAtStart`, and the catch only logs out on `401`.

### Step 1.4 — Give `AdminRoute` an exit condition

Open `adminFrontend/src/routes/AdminRoute.tsx`. Replace the body with:

```tsx
export default function AdminRoute() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);

  if (!isAuthenticated) return <Navigate to="/admin/login" replace />;
  if (!hasCheckedAuth) {
    return <PageLoader minHeight="min-h-screen" message="Verifying session…" />;
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/admin/login" replace />;

  return <Outlet />;
}
```

The `!user` line is the missing exit. The last line previously redirected to `/dashboard`, which does not exist in this SPA — it fell through to `NotFound`.

### Step 1.5 — Remove the 2800 ms band-aid in `App.tsx`

In `AppShell`, delete the `bootReady` state and the `setTimeout(... 2800)` block. Replace the effect and the early return with:

```tsx
const hasCheckedAuth = useAuthStore((s) => s.hasCheckedAuth);

useEffect(() => {
  if (!isAuthenticated || user) return;

  void fetchMe();

  // Hard watchdog: if the session check has not settled in 10s, the
  // session is unusable. Sign out rather than spin forever.
  const watchdog = setTimeout(() => {
    if (!useAuthStore.getState().hasCheckedAuth) {
      useAuthStore.getState().logout();
    }
  }, 10_000);

  return () => clearTimeout(watchdog);
}, [isAuthenticated, user, fetchMe]);

if (isAuthenticated && !hasCheckedAuth) {
  return <PageLoader minHeight="min-h-screen" message="Restoring session…" />;
}
```

Remove the now-unused `useState` import if nothing else uses it.

### Step 1.6 — Write the regression test

Create `adminFrontend/src/stores/__tests__/auth.store.test.ts`. Copy the mocking style from `adminFrontend/src/pages/__tests__/admin-shell.test.tsx`.

The test that matters:

```ts
it('sets the user when /auth/me succeeds after the interceptor rotated the token', async () => {
  localStorage.setItem('accessToken', 'expired-token');

  // Simulate the interceptor: the request succeeds, but the token in
  // storage is different by the time the response is handled.
  vi.spyOn(api, 'get').mockImplementation(async () => {
    localStorage.setItem('accessToken', 'fresh-token');
    return { data: { data: { id: 'u1', email: 'a@b.co', role: 'admin' } } };
  });

  await useAuthStore.getState().fetchMe();

  expect(useAuthStore.getState().user).toEqual({ id: 'u1', email: 'a@b.co', role: 'admin' });
  expect(useAuthStore.getState().hasCheckedAuth).toBe(true);
});
```

Add a second test: call `logout()` while `fetchMe` is in flight and assert `user` stays `null`.

### Verify

```bash
cd adminFrontend
npm run test -- auth.store
npm run lint
npm run build
```

Then manually:

1. `npm run dev` in `backend/`, `npm run dev` in `adminFrontend/`.
2. Sign in at `http://localhost:5174/admin/login`.
3. In DevTools → Application → Local Storage, edit `accessToken` to a garbage value.
4. Reload the page. **Expected:** you land on `/admin/login` (the refresh fails, the 401 path logs you out). **Not expected:** an endless spinner.
5. Sign in again, then in DevTools → Network set throttling to "Offline", reload, and set it back to "Online" after 5 seconds. **Expected:** you stay signed in.

### If it breaks

`git checkout -- adminFrontend/src/stores/auth.store.ts adminFrontend/src/routes/AdminRoute.tsx adminFrontend/src/App.tsx`

### Commit

```text
fix(admin): stop the session check from bailing out after a token refresh
```

---

## Phase 2 — Seed `richmond@wallx.co`

**Goal:** a working admin account, in dev and in production, without ever running the full seed against production.

### Files you will touch

- `backend/prisma/seed.ts`
- `backend/scripts/create-admin.ts` (new)
- `backend/package.json`

### Do not touch

- Any existing seed block. Add yours after `yusufAdmin`; do not modify the others.
- `backend/prisma/schema.prisma` — no schema change is needed.

### Step 2.1 — Add the dev seed block

In `backend/prisma/seed.ts`, immediately after the `yusufAdmin` upsert (around line 91), add:

```ts
// Platform admin (owner-requested)
const richmondAdmin = await prisma.user.upsert({
  where: { email: 'richmond@wallx.co' },
  update: {
    role: 'admin',
    isVerified: true,
    isActive: true,
    passwordHash: await hashPassword('Innovation@101'),
  },
  create: {
    email: 'richmond@wallx.co',
    passwordHash: await hashPassword('Innovation@101'),
    role: 'admin',
    isVerified: true,
    isActive: true,
  },
});

console.log(`✅ Ensured admin user: ${richmondAdmin.email} (role=admin)\n`);
```

Then add the credential to the summary block at the bottom of the file (around line 540):

```ts
console.log('Admin: richmond@wallx.co / Innovation@101');
```

**Two deliberate choices, do not "fix" them:**

- `passwordHash` is in the `update` block, unlike the `yusufAdmin` block. That means re-seeding resets Richmond's password to the known value. That is what was asked for.
- No `bvn` and no `transactionPin`. The other admins get a known PIN of `1234` because the seed is dev-only. Do not copy that onto a real operator account.

### Step 2.2 — Write the production script

Create `backend/scripts/create-admin.ts`. It must not import the seed file — the seed creates fake merchants.

```ts
/**
 * Create or update a single platform admin.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts --email richmond@wallx.co --password 'Innovation@101'
 *
 * Against production:
 *   railway run npx tsx scripts/create-admin.ts --email ... --password ...
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 10;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const email = (arg('email') ?? process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
  const password = arg('password') ?? process.env.ADMIN_PASSWORD ?? '';

  if (!email || !password) {
    throw new Error('Provide --email and --password (or ADMIN_EMAIL / ADMIN_PASSWORD).');
  }
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,128}$/.test(password)) {
    throw new Error('Password must be 8-128 chars with an uppercase letter, a lowercase letter and a number.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { email } });

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'admin', isVerified: true, isActive: true, passwordHash },
    create: { email, passwordHash, role: 'admin', isVerified: true, isActive: true },
  });

  if (!existing) {
    await prisma.auditLog.create({
      data: {
        action: 'admin.created',
        resourceType: 'user',
        resourceId: user.id,
        newData: { email, source: 'script' },
      },
    });
  }

  console.log(`${existing ? 'Updated' : 'Created'} admin: ${user.email} (role=${user.role})`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

Add to `backend/package.json` scripts:

```json
"create-admin": "tsx scripts/create-admin.ts"
```

### Verify

```bash
cd backend
npm run prisma:seed
npm run create-admin -- --email richmond@wallx.co --password 'Innovation@101'
npm run create-admin -- --email richmond@wallx.co --password 'Innovation@101'
```

Expected: the seed logs the new admin; the script logs `Created` then `Updated`; no duplicate rows.

Then sign in at `http://localhost:5174/admin/login` with `richmond@wallx.co` / `Innovation@101`.

Also confirm a normal merchant account is still rejected by the admin login page.

### If it breaks

`git checkout -- backend/prisma/seed.ts backend/package.json && rm backend/scripts/create-admin.ts`

### Commit

```text
feat(admin): seed the richmond@wallx.co operator account
```

---

## Phase 3 — Move admin tokens to `sessionStorage`

**Goal:** closing the browser ends the admin session. Reopening the portal always requires a sign-in.

**Why `sessionStorage`:** it is cleared when the tab or browser closes, and it is per-tab. No backend change is needed.

### Files you will touch

- `adminFrontend/src/lib/session.ts` (new)
- `adminFrontend/src/stores/auth.store.ts`
- `adminFrontend/src/lib/axios.ts`
- `adminFrontend/src/lib/sse-client.ts`
- `adminFrontend/src/pages/admin/AdminSubscriptions.tsx`

### Do not touch

- `frontend/` — the SME app keeps `localStorage`. It is a different origin and a different product decision.
- The refresh logic inside `axios.ts`. You are only changing **where** the token is read and written, not how refresh works.

### Step 3.1 — Create the storage module

Create `adminFrontend/src/lib/session.ts`:

```ts
/**
 * Admin token storage.
 *
 * The admin portal deliberately uses sessionStorage, not localStorage:
 * closing the browser must end the session. The SME app uses localStorage
 * and is unaffected — it is a separate origin and a separate decision.
 */

const ACCESS = 'accessToken';
const REFRESH = 'refreshToken';

// One-time cleanup: earlier builds wrote tokens to localStorage. Drop them
// so a stale token cannot be picked up by anything that still reads there.
localStorage.removeItem(ACCESS);
localStorage.removeItem(REFRESH);

export const getAccessToken = (): string | null => sessionStorage.getItem(ACCESS);
export const getRefreshToken = (): string | null => sessionStorage.getItem(REFRESH);

export function setTokens(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS, accessToken);
  sessionStorage.setItem(REFRESH, refreshToken);
}

export function setAccessToken(accessToken: string): void {
  sessionStorage.setItem(ACCESS, accessToken);
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS);
  sessionStorage.removeItem(REFRESH);
}
```

### Step 3.2 — Swap the seven call sites

Change **only** the storage call. Leave the surrounding logic alone.

| File | Line | Change |
| --- | --- | --- |
| `stores/auth.store.ts` | 28 | `isAuthenticated: !!getAccessToken()` |
| `stores/auth.store.ts` | 33-34 | `setTokens(data.data.accessToken, data.data.refreshToken)` |
| `stores/auth.store.ts` | 52-53 | `setTokens(accessToken, refreshToken)` |
| `stores/auth.store.ts` | 131 | `const tokenAtStart = getAccessToken();` |
| `stores/auth.store.ts` | 150 | `if (getAccessToken() === tokenAtStart)` |
| `lib/axios.ts` | 138 | `const token = getAccessToken();` |
| `lib/axios.ts` | 195 | `const storedToken = getAccessToken();` |
| `lib/axios.ts` | 242 | `setAccessToken(newToken);` |
| `lib/sse-client.ts` | 16 | `const token = getAccessToken();` |
| `pages/admin/AdminSubscriptions.tsx` | 184 | `const token = getAccessToken() \|\| '';` |

In `auth.store.ts`, `logout()` currently calls `localStorage.removeItem('accessToken')` and `localStorage.removeItem('refreshToken')`. Replace both with `clearTokens()`. Leave the other `localStorage.removeItem` calls alone — they are harmless leftovers from the SME store and removing them is a separate cleanup.

Add the import to each file:

```ts
import { getAccessToken, getRefreshToken, setTokens, setAccessToken, clearTokens } from '@/lib/session.ts';
```

Import only what that file uses.

### Step 3.3 — Check the refresh path still works

In `lib/axios.ts`, the refresh block reads `localStorage.getItem('refreshToken')` and compares it after the refresh. Both must become `getRefreshToken()`. This is the guard that stops a logged-out session being resurrected, so it must keep working.

### Verify

```bash
cd adminFrontend
npm run lint
npm run build
npm run test
```

Manually:

1. Sign in. DevTools → Application → Session Storage shows `accessToken` and `refreshToken`. Local Storage shows neither.
2. Close the tab. Open a new tab to `http://localhost:5174/admin`. **Expected:** the login page.
3. Sign in, wait 16 minutes (past the 15-minute access token), then reload. **Expected:** the dashboard, not a spinner. This is Phase 1 and Phase 3 working together.
4. Open the portal in a second tab. **Expected:** it asks you to sign in again. This is the accepted tradeoff — one tab, one session.

### If it breaks

`git checkout -- adminFrontend/src && rm adminFrontend/src/lib/session.ts`

### Commit

```text
feat(admin): keep admin tokens in sessionStorage so closing the browser signs out
```

---

## Phase 4 — Admin idle timeout

**Goal:** an admin who leaves the tab open and walks away is signed out after 30 minutes, even if the browser restored the tab.

**Why this is needed on top of Phase 3:** Chrome's "Continue where you left off" restores `sessionStorage` on relaunch. Without an idle check, a restored tab would still be signed in.

### Files you will touch

- `adminFrontend/src/lib/session.ts`
- `adminFrontend/src/hooks/useAdminIdle.ts` (new)
- `adminFrontend/src/App.tsx`

### Do not touch

- `adminFrontend/src/lib/axios.ts`.

### Step 4.1 — Add the idle constants and helpers

Append to `adminFrontend/src/lib/session.ts`:

```ts
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const LAST_ACTIVITY = 'admin:lastActivityAt';

export function touchActivity(): void {
  sessionStorage.setItem(LAST_ACTIVITY, String(Date.now()));
}

export function isIdleExpired(): boolean {
  const raw = sessionStorage.getItem(LAST_ACTIVITY);
  if (!raw) return false; // no marker yet — treat as active, the hook sets one
  return Date.now() - Number(raw) > ADMIN_IDLE_TIMEOUT_MS;
}

export function clearActivity(): void {
  sessionStorage.removeItem(LAST_ACTIVITY);
}
```

Call `clearActivity()` from `clearTokens()` so a logout resets the clock.

### Step 4.2 — Write the hook

Create `adminFrontend/src/hooks/useAdminIdle.ts`:

```ts
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/auth.store.ts';
import { isIdleExpired, touchActivity, clearActivity } from '@/lib/session.ts';

const THROTTLE_MS = 30_000;
const CHECK_MS = 60_000;

export function useAdminIdle(): void {
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    if (!isAuthenticated) return;

    if (isIdleExpired()) {
      useAuthStore.getState().logout();
      clearActivity();
      toast.error('Session expired. Please sign in again.');
      navigate('/admin/login', { replace: true });
      return;
    }

    touchActivity();

    let lastWrite = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite < THROTTLE_MS) return;
      lastWrite = now;
      touchActivity();
    };

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (isIdleExpired()) {
        useAuthStore.getState().logout();
        clearActivity();
        toast.error('Session expired. Please sign in again.');
        navigate('/admin/login', { replace: true });
        return;
      }
      onActivity();
    };

    const interval = setInterval(onVisible, CHECK_MS);

    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onActivity);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onActivity);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [isAuthenticated, navigate]);
}
```

### Step 4.3 — Mount it

In `adminFrontend/src/App.tsx`, inside `AppShell`, add:

```ts
useAdminIdle();
```

It must be called unconditionally, at the top level of the component, before any early return.

### Verify

```bash
cd adminFrontend && npm run lint && npm run build
```

Manually, with the timeout temporarily set to 60 seconds:

1. Change `ADMIN_IDLE_TIMEOUT_MS` to `60 * 1000`.
2. Sign in, leave the tab alone for 70 seconds.
3. Switch back to the tab. **Expected:** signed out, on `/admin/login`, with the expiry toast.
4. Sign in again, click around for 30 seconds, then leave for 40 seconds and return. **Expected:** still signed in, because activity reset the clock.
5. Set the constant back to `30 * 60 * 1000` before committing.

### If it breaks

`git checkout -- adminFrontend/src/lib/session.ts adminFrontend/src/App.tsx && rm adminFrontend/src/hooks/useAdminIdle.ts`

### Commit

```text
feat(admin): sign out after 30 minutes of inactivity
```

---

## Phase 5 — Database model for one-time codes

**Goal:** a table that can hold a hashed 6-digit code, its expiry, its attempt count, and whether it has been used.

**This phase changes no behaviour.** It adds a table and a Prisma model. Nothing reads them yet. That is deliberate — it means a mistake here cannot break a running feature.

### Files you will touch

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/<timestamp>_add_account_security_codes/migration.sql` (new)

### Do not touch

- Any existing model. You are adding a relation field to `User` and nothing else.

### Read this before you run any Prisma command

This project has a known trap: the local database was not built from migrations, so `prisma migrate dev` cannot see drift and will try to reset your database. **Do not run `prisma migrate dev` or `prisma migrate reset`.**

The safe sequence is:

1. Write the migration SQL by hand (Step 5.2).
2. Run `npx prisma migrate status` and read the output.
3. If the local database is not migration-managed, apply the SQL to your local database directly (Prisma Studio's SQL tab, or `psql`).
4. Run `npx prisma generate`.
5. The migration will run automatically in production on deploy.

If you are unsure which situation you are in, stop and ask before running anything.

### Step 5.1 — Add the model

In `backend/prisma/schema.prisma`, add the enum near the other enums (around line 512, next to `UserRole`):

```prisma
enum AccountCodePurpose {
  admin_password_change
}
```

Add the model at the end of the file:

```prisma
/// Short-lived one-time codes emailed to an account holder.
/// The code itself is never stored — only an HMAC of it.
model AccountSecurityCode {
  id          String              @id @default(uuid())
  userId      String              @map("user_id")
  purpose     AccountCodePurpose
  codeHash    String              @map("code_hash")
  expiresAt   DateTime            @map("expires_at")
  attempts    Int                 @default(0)
  consumedAt  DateTime?           @map("consumed_at")
  usedAt      DateTime?           @map("used_at")
  requestedIp String?             @map("requested_ip")
  createdAt   DateTime            @default(now()) @map("created_at")
  user        User                @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, purpose, createdAt(sort: Desc)])
  @@map("account_security_codes")
}
```

In the `User` model's relations block (around line 100, next to `sessions Session[]`), add:

```prisma
accountSecurityCodes AccountSecurityCode[]
```

### Step 5.2 — Write the migration by hand

Create the folder `backend/prisma/migrations/20261112090000_add_account_security_codes/` and inside it `migration.sql`:

```sql
-- CreateEnum
CREATE TYPE "AccountCodePurpose" AS ENUM ('admin_password_change');

-- CreateTable
CREATE TABLE "account_security_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "purpose" "AccountCodePurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "used_at" TIMESTAMP(3),
    "requested_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_security_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_security_codes_user_id_purpose_created_at_idx"
    ON "account_security_codes"("user_id", "purpose", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "account_security_codes"
    ADD CONSTRAINT "account_security_codes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

**The enum must be in this SQL.** This project has previously shipped a schema change where the enum existed in `schema.prisma` but not in the migration, and it only failed in production. Do not skip the `CREATE TYPE` line.

### Verify

```bash
cd backend
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate status
```

Then open Prisma Studio (`npm run prisma:studio`) and confirm the `account_security_codes` table exists with the right columns.

Finally, confirm nothing broke:

```bash
npm run build
npm run test:e2e
```

### If it breaks

Delete the migration folder, revert `schema.prisma`, run `npx prisma generate`.

### Commit

```text
feat(db): add account_security_codes for one-time email codes
```

---

## Phase 6 — Code generation and verification service

**Goal:** a single service file that can issue a code, verify it, and consume it. No HTTP yet.

**Why a service and not a controller:** the logic is testable in isolation, and the controller in Phase 8 becomes a thin wrapper. This is the pattern every other domain in this codebase follows.

### Files you will touch

- `backend/src/services/auth/account-code.service.ts` (new)
- `backend/src/config/index.ts`
- `backend/tests/unit/account-code.service.test.ts` (new)

### Do not touch

- `backend/src/services/auth/auth.service.ts`. You will call into it later, not modify it.

### Step 6.1 — Add the pepper to config

In `backend/src/config/index.ts`, next to the existing `realtime` block (around line 122), add:

```ts
// One-time code hashing. Falls back to the JWT access secret so no new
// required env var is introduced; set OTP_PEPPER to rotate independently.
security: {
  otpPepper: process.env.OTP_PEPPER || process.env.JWT_ACCESS_SECRET!,
},
```

This mirrors the `realtime.ticketSecret` pattern directly above it. Copy that shape.

### Step 6.2 — Write the service

Create `backend/src/services/auth/account-code.service.ts`. The exported functions:

```ts
export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

export function generateCode(): string
export function hashCode(userId: string, purpose: AccountCodePurpose, code: string): string
export async function issueCode(userId: string, purpose: AccountCodePurpose, ip?: string): Promise<{ code: string; expiresAt: Date }>
export async function verifyCode(userId: string, purpose: AccountCodePurpose, code: string): Promise<{ codeId: string }>
export async function consumeCode(codeId: string, userId: string): Promise<void>
```

Implementation notes that are not optional:

- **Generation:** `crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')`. Never `Math.random()`.
- **Hashing:** `crypto.createHmac('sha256', config.security.otpPepper).update(`${userId}:${purpose}:${code}`).digest('hex')`. **Not** a bare `sha256`. Six digits is one million possibilities — a plain hash is reversible in seconds from a database dump. The pepper is the only thing making the stored value safe. Put that sentence in a comment above the function.
- **Issuing:** first expire any live code for that user and purpose (`updateMany` setting `expiresAt` to now), then insert the new row. One live code at a time.
- **Verifying:** load the newest row where `consumedAt` is null. If none, or `expiresAt < now`, throw `new AppError(400, 'Code expired. Request a new one.', 'CODE_EXPIRED')`. If `attempts >= MAX_CODE_ATTEMPTS`, throw `new AppError(429, 'Too many attempts. Request a new code.', 'CODE_ATTEMPTS_EXCEEDED')`. Compare with `crypto.timingSafeEqual` on two buffers of equal length. On mismatch, increment `attempts` and throw `new AppError(400, 'Incorrect code', 'INVALID_CODE', { remainingAttempts })`. On match, set `consumedAt` and return the row id.
- **Consuming:** set `usedAt` only if `usedAt` is null and `consumedAt` is within the TTL. Throw `AppError(400, 'Verification expired. Start again.', 'CODE_VERIFICATION_EXPIRED')` otherwise. This is what makes the change ticket single-use.

Use `AppError` from `@/middleware/errorHandler` and `prisma` from `@/lib/prisma`, exactly as the neighbouring services do.

### Step 6.3 — Unit tests

Create `backend/tests/unit/account-code.service.test.ts`. Cover:

- `generateCode()` always returns exactly 6 digits, including leading zeros.
- The same code hashes differently for two different user ids.
- An expired code is rejected with `CODE_EXPIRED`.
- Five wrong attempts produce `CODE_ATTEMPTS_EXCEEDED` on the sixth.
- A correct code returns a `codeId`, and `consumeCode` succeeds once and fails the second time.

### Verify

```bash
cd backend
npm run build
npx jest tests/unit/account-code.service.test.ts
```

### If it breaks

`rm backend/src/services/auth/account-code.service.ts backend/tests/unit/account-code.service.test.ts` and revert `config/index.ts`.

### Commit

```text
feat(auth): add one-time email code service
```

---

## Phase 7 — Email template and dispatcher

**Goal:** the code arrives in the admin's inbox, in a template that matches the rest of the product.

### Files you will touch

- `backend/src/lib/email/templates/admin-password-code.ts` (new)
- `backend/src/services/email-dispatch.service.ts`

### Do not touch

- `backend/src/lib/email/index.ts`
- `EMAIL_FROM` or any Resend configuration

The sending path is working and frozen. You are adding a template and a dispatcher, nothing else.

### Step 7.1 — Write the template

Create `backend/src/lib/email/templates/admin-password-code.ts`. Copy the structure of `password-reset.ts` — same header, same card, same footer.

Export:

```ts
export interface AdminPasswordCodeEmailData {
  code: string;
  expiryMinutes: number;
  userEmail: string;
  requestIp?: string;
  requestUserAgent?: string;
  requestedAt: string;
}

export function generateAdminPasswordCodeHtml(data: AdminPasswordCodeEmailData): string
export function generateAdminPasswordCodeText(data: AdminPasswordCodeEmailData): string
```

**Two constraints that will bite you if you ignore them:**

1. **The code must not appear in the first 200 characters of the HTML.** The dev fallback in `lib/email/index.ts` logs `input.html.slice(0, 200)`. Put the code after the header block, and add a unit test asserting `html.slice(0, 200)` does not contain the digits.
2. **The subject line must not contain the code.** The fallback logs the subject verbatim. Use `"WallX admin password change — verification code"`.

Footer copy: "If you did not request this, someone has access to an admin session. Report it to platform engineering immediately."

### Step 7.2 — Add the dispatcher

In `backend/src/services/email-dispatch.service.ts`, add a function next to `dispatchPasswordChangedEmail` (around line 603), copying its shape:

```ts
export async function dispatchAdminPasswordCodeEmail(
  userId: string,
  code: string,
  meta: { ip?: string; userAgent?: string },
): Promise<{ delivered: boolean }> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email) return { delivered: false };

    const data = {
      code,
      expiryMinutes: 10,
      userEmail: user.email,
      requestIp: meta.ip,
      requestUserAgent: meta.userAgent,
      requestedAt: formatHumanDateTime(),
    };

    const result = await sendEmail({
      to: user.email,
      subject: 'WallX admin password change — verification code',
      html: generateAdminPasswordCodeHtml(data),
      text: generateAdminPasswordCodeText(data),
    });

    return { delivered: result.delivered };
  } catch (err) {
    logger.warn('Failed to dispatch admin password code email', {
      userId,
      err: err instanceof Error ? err.message : String(err),
    });
    return { delivered: false };
  }
}
```

It returns `delivered` so the controller can tell the admin the email did not actually go out. In dev, with no `RESEND_API_KEY`, `sendEmail` returns `delivered: false` and logs the payload — that is the intended behaviour, not a bug.

### Verify

```bash
cd backend
npm run build
```

Then, with the backend running in dev, temporarily call the dispatcher from a scratch script or a unit test and confirm the Winston log shows the email with the code visible in the body (dev fallback) and `delivered: false`.

### If it breaks

`rm backend/src/lib/email/templates/admin-password-code.ts` and revert `email-dispatch.service.ts`.

### Commit

```text
feat(email): add the admin password verification code template
```

---

## Phase 8 — HTTP endpoints

**Goal:** three admin-only endpoints that drive the flow.

### Files you will touch

- `backend/src/validators/admin-account.validator.ts` (new)
- `backend/src/controllers/admin-account.controller.ts` (new)
- `backend/src/routes/admin-account.routes.ts` (new)
- `backend/src/routes/admin.routes.ts`
- `backend/src/middleware/security.ts`

### Do not touch

- `backend/src/routes/auth.routes.ts`. The existing `PUT /auth/change-password` stays exactly as it is — it is the escape hatch when an admin knows their password but email delivery is down.

### Step 8.1 — Validators

Create `backend/src/validators/admin-account.validator.ts`. Copy the password rule verbatim from `auth.validator.ts:40-44` so the two cannot drift:

```ts
import { z } from 'zod';

const passwordRule = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    'Password must contain at least one uppercase letter, one lowercase letter, and one number',
  );

export const adminVerifyPasswordCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const adminCompletePasswordChangeSchema = z
  .object({
    changeTicket: z.string().min(1),
    newPassword: passwordRule,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
```

### Step 8.2 — Rate limiter

In `backend/src/middleware/security.ts`, copy `voucherOtpRequestRateLimiter` (around line 231) and adapt it:

```ts
/**
 * Admin password-code limiter. Keyed per admin, not per IP, so a shared
 * office network cannot lock the whole team out.
 */
export const adminPasswordCodeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.app.isDevelopment ? 1000 : 3,
  skip: skipLocalhost,
  keyGenerator: (req) => `admin_pwd_code:${(req as any).user?.userId ?? req.ip}`,
  validate: { keyGeneratorIpFallback: false, ip: false },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'CODE_RATE_LIMIT_EXCEEDED',
      message: 'Too many code requests. Please wait before trying again.',
    },
  },
});
```

### Step 8.3 — Controller

Create `backend/src/controllers/admin-account.controller.ts`. Copy the shape of `auth.controller.ts:88-103` — `asyncHandler`, `AuthenticatedRequest`, the standard `{ success, data, message }` response.

Three handlers:

**`requestPasswordCode`**

- `issueCode(req.user!.userId, 'admin_password_change', req.ip)`
- `dispatchAdminPasswordCodeEmail(...)`
- Respond `{ emailHint, expiresInMinutes: 10, delivered }`, where `emailHint` masks the address: `ri***@wallx.co`.
- Audit `admin.password_code_requested` with `{ purpose, requestIp }`.
- **Never** put the code in the response.

**`verifyPasswordCode`**

- Parse with `adminVerifyPasswordCodeSchema`.
- `verifyCode(...)` returns `{ codeId }`.
- Sign a ticket: `jwt.sign({ sub: userId, purpose: 'admin_password_change', jti: codeId }, config.jwt.accessSecret, { expiresIn: '10m' })`.
- Respond `{ changeTicket }`.
- Audit `admin.password_code_verified`.

**`completePasswordChange`**

- Parse with `adminCompletePasswordChangeSchema`.
- `jwt.verify` the ticket. Reject if `purpose !== 'admin_password_change'` or `sub !== req.user!.userId`.
- `consumeCode(jti, userId)` — this is what makes the ticket single-use.
- `bcrypt.hash(newPassword, BCRYPT_ROUNDS)` **before** the transaction. Import `BCRYPT_ROUNDS` from `auth.service.ts`. Hashing inside a transaction holds a database lock for ~100 ms for no reason; this codebase has a standing rule about it.
- Then one `prisma.$transaction`:
  - update `user.passwordHash`
  - `tx.session.updateMany({ where: { userId, isRevoked: false }, data: { isRevoked: true } })`
  - `logAudit({ userId, action: 'admin.password_changed', resourceType: 'user', resourceId: userId, newData: { method: 'email_code', sessionsRevoked } }, tx)`
- After the transaction: `void dispatchPasswordChangedEmail(userId, 'changed')`.
- Respond `{ message: 'Password changed. Please sign in again.', signedOut: true }`.

Revoking **all** sessions is intentional. The request carries an access token, not a refresh token, so the current session cannot be singled out. Forcing a clean re-login is the right posture for an admin password change.

### Step 8.4 — Routes

Create `backend/src/routes/admin-account.routes.ts`:

```ts
import { Router } from 'express';
import * as controller from '@/controllers/admin-account.controller';
import { adminPasswordCodeRateLimiter } from '@/middleware/security';

const router = Router();

router.post('/password/request-code', adminPasswordCodeRateLimiter, controller.requestPasswordCode);
router.post('/password/verify-code', adminPasswordCodeRateLimiter, controller.verifyPasswordCode);
router.post('/password/complete', controller.completePasswordChange);

export default router;
```

In `backend/src/routes/admin.routes.ts`, add the import and mount it **after** the existing `router.use(authenticate, authorize('admin'))` line (line 12), so it inherits the admin guard:

```ts
import adminAccountRoutes from './admin-account.routes';
// ...
router.use('/account', adminAccountRoutes);
```

Resulting paths: `POST /api/v1/admin/account/password/request-code`, and so on.

### Verify

```bash
cd backend
npm run build
npm run lint
```

Then with the server running, using a real admin access token:

```bash
curl -X POST http://localhost:3000/api/v1/admin/account/password/request-code \
  -H "Authorization: Bearer <admin-access-token>"
```

Expected: `{ success: true, data: { emailHint: "ri***@wallx.co", expiresInMinutes: 10, delivered: false } }`, and the code visible in the backend Winston log.

Then confirm the guard works:

```bash
curl -X POST http://localhost:3000/api/v1/admin/account/password/request-code \
  -H "Authorization: Bearer <merchant-access-token>"
```

Expected: `403 FORBIDDEN`.

### If it breaks

Delete the three new files and revert `admin.routes.ts` and `security.ts`.

### Commit

```text
feat(admin): add password change endpoints with emailed verification code
```

---

## Phase 9 — Admin settings page and wizard

**Goal:** the admin can actually use the flow.

### Files you will touch

- `adminFrontend/src/pages/admin/AdminSettings.tsx` (new)
- `adminFrontend/src/components/admin/ChangeAdminPassword.tsx` (new)
- `adminFrontend/src/App.tsx`
- `adminFrontend/src/components/layout/AdminSidebar.tsx`
- `adminFrontend/src/components/layout/AdminLayout.tsx`

### Do not touch

- `adminFrontend/src/stores/auth.store.ts` — the wizard calls the existing `logout()`.

### Step 9.1 — The page

Create `adminFrontend/src/pages/admin/AdminSettings.tsx`. Copy the page shell from `AdminDashboard.tsx` — same container, same heading style.

Two URL-backed tabs, `?tab=security` and `?tab=profile`, read with `useSearchParams`:

- **Security** renders `<ChangeAdminPassword />`.
- **Profile** shows the email and role read-only, and an editable display name saved through the existing `PATCH /auth/me`.

Changing the email address is out of scope — it needs its own re-verification loop.

### Step 9.2 — The wizard

Create `adminFrontend/src/components/admin/ChangeAdminPassword.tsx`.

State machine: `'request' | 'code' | 'password' | 'done'`.

- **Step 1 — request.** Show the masked email. A "Send 6-digit code" button calls `POST /admin/account/password/request-code`. If the response has `delivered: false`, show an inline note: "Email delivery is not configured on this server — check the server logs." Do not show a success toast in that case.
- **Step 2 — code.** Six `<input>` elements, each `maxLength={1}`, `inputMode="numeric"`, `autoComplete="one-time-code"` on the first. Auto-advance on entry, Backspace moves to the previous box, pasting six digits distributes them. A 600-second countdown. Resend disabled for 60 seconds. On a `INVALID_CODE` error, show `details.remainingAttempts`.
- **Step 3 — password.** `newPassword` and `confirmPassword`, plus a live checklist mirroring the server rule (8+, uppercase, lowercase, number). Submit disabled until every rule passes and both fields match. The server is still the source of truth.
- **Done.** `toast.success`, then `useAuthStore.getState().logout()`, then `navigate('/admin/login', { replace: true })`. The backend has already revoked every session, so staying on the page would only produce 401s.

Keep the `changeTicket` in component state only. Never write it to `sessionStorage` or `localStorage`.

For the panel chrome, reuse the ref + `pointerdown` + Escape pattern from `NotificationBell.tsx`, or the inline `<Modal>` helper style at the bottom of `InvoiceDetail.tsx:539`.

### Step 9.3 — Wire the route

In `adminFrontend/src/App.tsx`, add the lazy import next to the others:

```ts
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings.tsx'));
```

And the route, inside the `AdminRoute` / `AdminLayout` branch:

```tsx
<Route path='/admin/settings' element={<AdminSettings />} />
```

### Step 9.4 — Wire the navigation

In `adminFrontend/src/components/layout/AdminSidebar.tsx`, add to the nav array (around line 87):

```ts
{ to: '/admin/settings', label: 'Settings', icon: Settings },
```

Import `Settings` from `lucide-react` alongside the other icons.

In `adminFrontend/src/components/layout/AdminLayout.tsx`, the identity block at lines 131-146 is a plain `<div>`. Wrap it in `<Link to='/admin/settings'>` so the avatar is clickable. Add a breadcrumb branch for `/admin/settings` in the `breadcrumbs` memo (around line 30).

### Verify

```bash
cd adminFrontend
npm run lint
npm run build
npm run test
```

Manually, end to end:

1. Sign in as Richmond. Go to `/admin/settings`.
2. Send a code. In dev, read it from the backend Winston log.
3. Enter five wrong codes. The sixth attempt shows the rate-limit or attempts-exceeded message.
4. Request a new code, enter it correctly, then enter a new password twice.
5. **Expected:** you land on `/admin/login`. The old password fails. The new one works.
6. In Prisma Studio, confirm `used_at` is set on the code row, every `sessions` row for that admin has `is_revoked = true`, and three audit rows exist.

### If it breaks

Delete the two new files and revert `App.tsx`, `AdminSidebar.tsx`, `AdminLayout.tsx`.

### Commit

```text
feat(admin): add settings page with email-verified password change
```

---

## Phase 10 — Optional: server-side logout and admin token TTL

**Skip this phase unless asked.** It changes shared auth code used by the SME app.

**Goal:** logging out actually revokes the refresh token, and admin refresh tokens expire in 12 hours instead of 7 days.

### Files you will touch

- `backend/src/routes/auth.routes.ts`
- `backend/src/controllers/auth.controller.ts`
- `backend/src/services/auth/auth.service.ts`
- `backend/src/services/auth/session.service.ts`
- `adminFrontend/src/stores/auth.store.ts`

### Steps

1. Add `POST /auth/logout` to `auth.routes.ts`, authenticated. Body `{ refreshToken }`. Hash it with `hashRefreshToken` and set `isRevoked: true` on the matching `Session` row. Return `{ success: true }`. It must be idempotent — a missing row is still a success.
2. In `adminFrontend/src/stores/auth.store.ts`, `logout()` fires that endpoint with the current refresh token **before** clearing storage. Fire-and-forget: `void api.post('/auth/logout', { refreshToken }).catch(() => {})`.
3. In `generateTokens` (`auth.service.ts:27-37`), use a shorter expiry when `payload.role === 'admin'`. Read it from `config.jwt.adminRefreshExpiry`, defaulting to `'12h'`.

### Verify

Sign out, then attempt to use the old refresh token against `/auth/refresh`. Expected: `401 SESSION_REVOKED`.

### Commit

```text
feat(auth): revoke the session on logout and shorten admin token lifetime
```

---

## Phase 11 — Full regression pass

Run everything, in this order, and do not skip any of it.

```bash
cd backend
npm run lint
npm run build
npm run test:e2e

cd ../adminFrontend
npm run lint
npm run build
npm run test
```

Then the manual checklist:

| # | Check | Expected |
| --- | --- | --- |
| 1 | Sign in as Richmond | Dashboard loads |
| 2 | Reload after 16 minutes idle | Dashboard, no spinner |
| 3 | Close the tab, reopen `/admin` | Login page |
| 4 | Second tab while signed in | Login page (per-tab sessions) |
| 5 | Idle past the timeout | Signed out with a toast |
| 6 | Change password end to end | Signed out, new password works |
| 7 | Sign in as a merchant at `/admin/login` | Rejected |
| 8 | Merchant app (`localhost:5173`) still works | Unchanged |
| 9 | Admin audit log page | Shows the three new actions |

---

## Things that will bite you

Read this list before you start, and again before you ask for review.

1. **`prisma migrate dev` will try to reset your database.** The local database is not migration-managed. Follow the warning in Phase 5.
2. **The dev email fallback logs the first 200 characters of the HTML and the subject.** That is why the code must sit past character 200 and stay out of the subject.
3. **Six digits is one million possibilities.** A bare SHA-256 of the code is reversible in seconds. The HMAC pepper is the only thing protecting it. Do not "simplify" it.
4. **The enum must be in the migration SQL**, not only in `schema.prisma`. This project has shipped that bug before and it only surfaced in production.
5. **Hash passwords outside the transaction.** `bcrypt.hash` before `prisma.$transaction`, never inside.
6. **Never return the code in an API response.** Not in `data`, not in `message`, not in `details`.
7. **Do not touch `backend/src/lib/email/index.ts`.** The sending path is frozen and working.
8. **Do not touch `frontend/`.** The SME app is a separate product decision.
9. **`sessionStorage` is per-tab.** A second admin tab requires a second sign-in. That is intended.
10. **The e2e suite runs against the live database.** Generate fixture data per run; never hard-code ids.

---

## Definition of done

- [ ] All four workstreams shipped, or a clean stop at a phase boundary
- [ ] `npm run lint`, `npm run build` and the test suites pass in both `backend/` and `adminFrontend/`
- [ ] The manual checklist in Phase 11 passes
- [ ] No file under "Do not touch" appears in `git diff`
- [ ] Each phase is its own commit with the message given above
