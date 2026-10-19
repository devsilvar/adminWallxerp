# ADR 0002: Single-Owner Organization Boundary

## Status
Accepted

## Context
When introducing multi-user team roles (RBAC) to allow business owners to delegate counter-sales, invoicing, and bookkeeping to staff, we needed to establish the multi-tenancy trust model:
- Can an invited team member belong to businesses owned by different owners?
- What happens if an owner operates 3 different businesses (e.g., Pharmacy, Supermarket, Logistics)?

Allowing a staff account to belong to multiple owners creates serious data leakage risks, confusing session contexts, and multi-tenant privilege escalation vulnerabilities. However, requiring business owners to register separate emails for their staff across their own multiple businesses creates unacceptable operational friction.

## Decision
1. **Dynamic Organization Boundary**: We define an "Organization" dynamically as the set of all businesses owned by the same `Business.userId`. No separate `Organization` database table or schema migration was introduced.
2. **Multi-Business Within Same Owner**: A business owner can invite the *same* user across multiple businesses they own. The user can have distinct roles and permission overrides in each business.
3. **Cross-Owner Prohibition**: A team member can **never** be invited to or accept membership in a business owned by a *different* owner.
   - At invite time: Checked in `team.service.ts` / `org-boundary.service.ts`, returning `400 INVALID_INVITE_EMAIL` with generic anti-enumeration copy.
   - At accept time: Authoritatively checked inside a database transaction under row lock (`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`), returning `403 ORGANIZATION_MISMATCH`.
4. **Staff Account Restriction**: Once a user joins an owner's organization as a staff member, they cannot register new businesses (`403 ONLY_OWNER_CAN_CREATE_BUSINESS`). If they are removed from all memberships, they return to free-agent status.
5. **Team Seat Cap**: Each business is limited to 3 invited staff members (`maxInvitedMembers: 3`). The owner does not count toward the cap.

## Consequences
- **Positive**: Strict data isolation between competing businesses; zero sidebar confusion; prevents privilege escalation; clear accountability.
- **Negative**: Users working as freelancers across unrelated clients must register separate email addresses per client.
