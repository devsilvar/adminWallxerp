# Feature Specification: Team RBAC & Multi-User Access Control

## 1. Objective & User Stories
Empower business owners to invite operational staff (cashiers, bookkeepers, managers) to their businesses, enforce role-based access control (RBAC), enforce single-owner organization boundaries, and cap team sizes.

**User Stories:**
- As a business owner, I want to invite my sales cashier to record sales without giving them access to my company expenses or bank balance.
- As an accountant, I want to manage expenses and generate tax reports without having permission to withdraw funds.
- As a platform operator, I want to prevent staff accounts from joining competing business owners.

---

## 2. Role Matrix & Granular Permissions

| Capability Area | `owner` | `manager` | `sales_staff` | `accountant` | `viewer` |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Sales CRUD** | Full | Full | Scoped (Own + DVA) | Read Only | Read Only |
| **Expenses CRUD** | Full | Full | Denied | Full | Read Only |
| **Invoicing** | Full | Full | Create / View / Send | Full | Read Only |
| **Debtor Repayments** | Full | Full | Denied | Record Payment | Read Only |
| **Bad Debt Write-Off**| Full | Full | Denied | Denied | Denied |
| **Tax Calculation** | Full | Full | Denied | Read Only | Read Only |
| **Tax Finalization** | Full | Full | Denied | Denied | Denied |
| **Tax Payment** | Yes | Denied | Denied | Denied | Denied |
| **Wallet Payouts** | Yes | Denied | Denied | Denied | Denied |
| **Team Management** | Full | Invite / Update | Denied | Denied | Denied |
| **Delete Business** | Yes | Denied | Denied | Denied | Denied |

---

## 3. Team Member Lifecycle & Organizational Boundary

### 3.1. Invitation Flow (`POST /businesses/:id/team/invite`)
1. Checks active team seat count (`activeMembers + pendingInvites <= 3`). If full, returns `400 TEAM_SEAT_LIMIT_REACHED`.
2. Validates invitee email against single-owner organizational boundary:
   - If user already owns $\ge 1$ businesses: Rejects with `400 INVALID_INVITE_EMAIL`.
   - If user is already a member of a business belonging to a DIFFERENT owner: Rejects with `400 INVALID_INVITE_EMAIL`.
   - If user is a free agent or already in this owner's organization: Accepted.
3. Generates 32-byte secure hex token expiring in 7 days.
4. Dispatches email invitation with acceptance link (`/invite?token=...`).

### 3.2. Acceptance Flow (`POST /invitations/accept`)
1. Resolves token under database row lock.
2. Asserts invite has not expired or been revoked.
3. Performs authoritative cross-owner organization boundary check.
4. Inserts `BusinessMember` record with specified role and permission overrides.
5. Marks invitation status as `accepted`.
6. Staff user is marked as non-owner and cannot create businesses (`ONLY_OWNER_CAN_CREATE_BUSINESS`).

---

## 4. Acceptance Criteria & Test Scenarios
- [ ] Business cannot invite more than 3 members (cap enforced).
- [ ] User cannot accept invitations from two different business owners.
- [ ] Non-owner roles are rejected from money-movement endpoints (withdrawals, remittances).
- [ ] Sales staff can only view sales they created or DVA bank transfers.
