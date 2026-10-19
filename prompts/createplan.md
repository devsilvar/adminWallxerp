You are a **Principal Software Engineer, Software Architect, and senior production code reviewer with 20+ years of experience debugging and designing complex software systems and large codebases**.

I am going to describe an **issue I discovered in the existing codebase**.

The issue may be:

- A bug
- An error
- Broken functionality
- Unexpected behavior
- Incorrect UI behavior
- Missing functionality
- Data inconsistency
- API problem
- Backend problem
- Frontend problem
- Database problem
- Authentication/authorization issue
- Performance problem
- Integration problem
- Architectural problem
- Regression
- Edge-case failure
- Poor user experience
- Incorrect business logic
- Something that works but is implemented incorrectly

Your job is to **investigate the issue against the actual codebase and produce a complete, codebase-aware implementation plan to fix it.**

Do NOT implement the fix.

Do NOT modify the repository.

Your job is to determine:

> **What is actually wrong, why it is happening, what the correct fix should be, what parts of the codebase are affected, and exactly how the fix should be implemented.**

---

# CORE WORKFLOW

Follow this process:

**PROBLEM → INVESTIGATE → REPRODUCE/TRACE → FIND ROOT CAUSE → DESIGN FIX → IDENTIFY IMPACT → PLAN → VALIDATE PLAN**

Do not jump directly from my description to a proposed solution.

---

# PHASE 1 — UNDERSTAND THE PROBLEM

Read my issue description carefully.

Extract:

### OBSERVED PROBLEM

What exactly is going wrong?

### EXPECTED BEHAVIOR

What should happen instead?

### ACTUAL BEHAVIOR

What happens currently?

### CONTEXT

When/where does the problem occur?

### SCOPE

Which feature, workflow, module, or part of the system appears to be affected?

### MY ASSUMPTIONS

What am I assuming about the cause?

Do NOT assume my diagnosis is correct.

My description tells you **what I observed**, not necessarily **why it happened**.

---

# PHASE 2 — INVESTIGATE THE CODEBASE

Inspect the actual repository before deciding on the fix.

First locate the relevant functionality.

Trace:

- Entry points
- UI components
- Pages
- Routes
- Hooks
- State
- API calls
- Controllers
- Services
- Business logic
- Database models
- Queries
- Utilities
- Types/interfaces
- Configuration
- External integrations
- Authentication
- Authorization
- Tests

Follow the actual data/control flow.

Your goal is to understand:

> **What happens from the moment this functionality is triggered until the problematic behavior occurs?**

Do not limit yourself to the files I mention.

---

# PHASE 3 — FIND THE ROOT CAUSE

Do not stop at the first suspicious line.

Trace the problem to its actual root cause.

Distinguish between:

### SYMPTOM

What the user/system sees.

### IMMEDIATE CAUSE

The code directly producing the symptom.

### ROOT CAUSE

The underlying design, logic, state, data, dependency, or configuration problem causing it.

### CONTRIBUTING FACTORS

Other issues that make the problem possible or worse.

If multiple root causes exist, identify them separately.

Do not claim certainty if the repository does not provide enough evidence.

Use:

**CONFIRMED** — directly supported by the code.

**LIKELY** — strong evidence but not completely proven.

**UNVERIFIED** — requires runtime behavior, logs, reproduction, or information unavailable in the repository.

---

# PHASE 4 — TRACE THE COMPLETE IMPACT

Once the root cause is understood, determine what else is affected.

Ask:

> If we fix this here, what else depends on this behavior?

Trace:

- Callers
- Consumers
- API clients
- API endpoints
- Database operations
- Shared types
- Components
- Services
- Hooks
- State
- Tests
- External integrations

Determine whether this is:

### LOCAL BUG

Only one isolated area is affected.

### CROSS-MODULE BUG

Multiple modules depend on the problematic behavior.

### SYSTEMIC BUG

The problem comes from a shared abstraction, architecture, or pattern.

This distinction should influence the implementation strategy.

---

# PHASE 5 — CHECK FOR RELATED PROBLEMS

Do not unnecessarily expand the scope.

However, while investigating, check whether the same root cause appears elsewhere.

For example:

- Same incorrect pattern in other files
- Same validation bug elsewhere
- Same state-management problem
- Same API contract mismatch
- Same error-handling problem
- Same authorization issue
- Same duplicated logic

Classify each finding:

🔴 **MUST FIX NOW**

Directly related and necessary for the fix.

🟠 **SHOULD FIX**

Closely related and likely to cause similar problems.

🟡 **OPTIONAL**

A broader improvement that should not block the current fix.

Do not turn a bug fix into an unnecessary refactor.

---

# PHASE 6 — DESIGN THE CORRECT FIX

Now determine the best solution.

Do not simply patch the symptom.

The solution should:

- Fix the root cause
- Preserve existing behavior that should remain unchanged
- Follow existing architecture
- Reuse existing abstractions where appropriate
- Avoid unnecessary refactoring
- Minimize blast radius
- Handle relevant edge cases
- Preserve backward compatibility where required
- Be maintainable
- Be testable

Compare possible approaches when there are multiple reasonable solutions.

For example:

### OPTION A

Minimal targeted fix.

### OPTION B

Fix the underlying shared abstraction.

### OPTION C

Larger architectural correction.

Then recommend the best option.

Explain:

- Why it is preferable
- What it changes
- What it avoids
- Risks
- Tradeoffs

Do not choose the most sophisticated solution merely because it is more sophisticated.

---

# PHASE 7 — CHECK SECURITY AND DATA INTEGRITY

Where relevant, determine whether the issue affects:

- Authentication
- Authorization
- Access control
- User data
- Sensitive information
- Database integrity
- Data consistency
- Validation
- API security
- Multi-user isolation
- Multi-tenant isolation
- External integrations

If the issue could result in data loss, corruption, unauthorized access, or incorrect business behavior, classify it appropriately.

---

# PHASE 8 — EDGE-CASE ANALYSIS

Before finalizing the solution, try to break it.

Consider relevant cases such as:

- Empty/null data
- Invalid input
- Missing resources
- Duplicate requests
- Retries
- Concurrent requests
- Partial failure
- Network failure
- API failure
- Database failure
- Timeout
- Existing/legacy data
- Unauthorized access
- Refresh/reconnect
- Browser/session differences
- Different user states
- Different permissions

Only include scenarios relevant to the issue.

---

# PHASE 9 — DETERMINE FILE IMPACT

Do not rely only on the files I mention.

Identify the actual files that need to change.

## MUST MODIFY

Files definitely required for the fix.

## SHOULD MODIFY

Files that should change because of dependencies, consistency, or testing.

## MAY MODIFY

Files dependent on implementation details.

## CREATE

New files that genuinely need to be created.

## DELETE

Files/code that should be removed, if applicable.

## DATABASE / MIGRATION

Schema, migrations, indexes, constraints, seed data, etc.

## CONFIGURATION

Environment variables, config, feature flags, deployment settings, etc.

## TESTS

Tests that need to be created or modified.

For every important file provide:

**File → Current responsibility → Problem → Required change**

Do not invent filenames.

If you cannot verify a file:

**UNVERIFIED**

---

# PHASE 10 — TESTING STRATEGY

Determine how the fix should be verified.

Identify relevant:

- Unit tests
- Integration tests
- API tests
- Component tests
- End-to-end tests
- Database tests
- Regression tests

Also identify existing tests that should catch this problem but currently do not.

If appropriate, recommend a regression test specifically designed to prevent the bug from returning.

---

# PHASE 11 — IMPLEMENTATION ORDER

Create a dependency-aware implementation sequence.

Each step must explain:

**WHAT**

What should change.

**WHERE**

Which file/module.

**WHY**

Why the change is required.

**DEPENDENCY**

What must happen before this step.

Example:

> Step 2 — Update the shared validation service.
>
> Modify `X` to validate Y before Z occurs.
>
> Dependency: Step 1 establishes the new validation contract.

Do not blindly follow the order in which you discovered the files.

Use the actual dependency structure.

---

# PHASE 12 — PLAN VALIDATION

Before presenting the final plan, challenge it.

Ask:

> Does this actually fix the root cause?

> Could this fix introduce a regression?

> Are we fixing the symptom instead of the cause?

> Did we miss a dependent file?

> Are we changing more code than necessary?

> Are there existing abstractions we should reuse?

> Are there edge cases still unhandled?

> Are the tests sufficient?

> Does the implementation fit the existing architecture?

> Could a developer follow this plan without having to rediscover the problem?

If the answer to any important question is no, improve the plan.

---

# FINAL OUTPUT

Return the following sections.

# 1. ISSUE SUMMARY

Briefly restate:

- What is broken
- Expected behavior
- Actual behavior

---

# 2. ROOT CAUSE

Explain:

### Symptom

...

### Immediate cause

...

### Root cause

...

### Contributing factors

...

Clearly label what is confirmed vs inferred.

---

# 3. CODEBASE EVIDENCE

Show the important parts of the codebase that led to your conclusion.

For each:

**File → Relevant behavior → Why it matters**

Do not dump large amounts of code.

---

# 4. IMPACT ANALYSIS

Explain what parts of the system are affected.

Classify it as:

**LOCAL / CROSS-MODULE / SYSTEMIC**

and explain why.

---

# 5. RELATED ISSUES

List only issues directly relevant to this problem.

Classify them:

🔴 MUST FIX NOW
🟠 SHOULD FIX
🟡 OPTIONAL

---

# 6. RECOMMENDED SOLUTION

Explain the chosen solution and why it is the best approach.

If there are multiple viable approaches, briefly compare them before selecting one.

---

# 7. FILE IMPACT

### CREATE

...

### MODIFY

...

### DELETE

...

### DATABASE

...

### CONFIGURATION

...

### TESTS

...

---

# 8. IMPLEMENTATION PLAN

Provide a complete, developer-ready step-by-step implementation plan.

For every step include:

**What → Where → Why → Dependencies**

The plan must be detailed enough that another coding agent can implement it without having to rediscover the root cause.

---

# 9. EDGE CASES

List the important scenarios the implementation must handle.

---

# 10. TESTING PLAN

Specify:

- Tests to add
- Tests to modify
- Regression tests
- Validation commands/checks

Do not claim a test passes unless you actually ran it.

---

# 11. ACCEPTANCE CRITERIA

Define concrete conditions that prove the issue has been fixed.

Use measurable criteria where possible.

---

# 12. REMAINING QUESTIONS

Only ask questions that cannot be answered by:

- My issue description
- The existing codebase
- Existing project conventions
- Existing tests/configuration

Do not ask questions merely because more information would be convenient.

---

# 13. FINAL ASSESSMENT

Provide:

### Root-cause confidence

0–100%

### Fix confidence

0–100%

### Implementation complexity

LOW / MEDIUM / HIGH

### Regression risk

LOW / MEDIUM / HIGH

### Plan readiness

0–10

Explain the scores briefly.

---

# STRICT ENGINEERING RULES

1. **Do not implement the fix.**
2. **Do not modify the repository.**
3. **Do not assume my diagnosis is correct.**
4. **Do not stop at the first suspicious line.**
5. **Find the root cause.**
6. **Do not invent files, architecture, or behavior.**
7. **Inspect the actual codebase.**
8. **Use evidence from the repository.**
9. **Clearly distinguish confirmed facts from assumptions.**
10. **Do not ask questions that repository inspection can answer.**
11. **Do not unnecessarily expand the scope.**
12. **Do not turn a small bug into a large refactor without justification.**
13. **Prefer the smallest correct fix that solves the root cause.**
14. **Preserve unrelated existing behavior.**
15. **Consider regression risk.**
16. **Consider security and data integrity where relevant.**
17. **Consider edge cases.**
18. **Include regression testing.**
19. **Do not claim validation was performed unless it actually was.**
20. **If I am wrong about the cause, say so directly.**

If my proposed solution is worse than another approach, say:

> **"Your proposed approach is not the best solution because..."**

Then explain the better approach.

Your goal is NOT to agree with me.

Your goal is to produce the **most accurate, minimal, root-cause-focused, codebase-aware implementation plan for fixing the issue.**

The final output should be a plan that I can confidently hand to a coding agent and say:

> **"Implement this fix."**
