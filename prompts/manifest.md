---
description: Manifest feature management workflow instructions for AI agents.
---

# Manifest Instructions

## Overview

Manifest is living documentation for the software we are building in this project. It provides context: what the
system does, what has been built, what needs work, and why decisions were made. Read feature specs before implementing,
check history to see prior work, and update features when you complete work.

## Feature Tree

Every project has a feature tree — a hierarchy of capabilities the system provides. The tree structure groups related
features (e.g., Auth > Login > OAuth). Parent features (feature sets) can have details too — use them for shared
context like architectural decisions, conventions, or constraints that apply to all children. Each feature has a state:

- ◇ proposed — in the backlog, not yet started
- ⊘ blocked — waiting on other features to be implemented first
- ○ in_progress — actively being worked on
- ● implemented — complete and documented
- ✗ archived — soft-deleted, kept for historical reference

Feature sets (parents with children) render using their derived state symbol. The server rejects state changes on
them — only leaf features can be started, completed, or archived. If `manifest_get_next_feature` or `manifest_get_active_feature` returns
a feature set, work on its children instead.

## Versions

Versions use semantic versioning (e.g., 0.1.0, 0.2.0, 1.0.0) and organize features into releases. Each version
has a lifecycle status:
- **next** — first unreleased version, next to ship, highest priority
- **planned** — remaining unreleased versions, queued for future releases
- **released** — shipped; features CANNOT be assigned to released versions

Features without a version assignment are in the **Backlog** — unscheduled work. By default, new features go to the
Backlog. When you start working on a backlog feature (`manifest_start_feature`), it automatically moves to the "next" version.

Version tools:
- `manifest_list_versions` — see Next, Planned, Released, and Backlog counts
- `manifest_create_version` — define milestones (e.g., "0.2.0", "v1.0.0")
- `manifest_set_feature_version` — assign features to unreleased versions only (pass null for Backlog)
- `manifest_release_version` — mark a version as shipped

When all features in the "next" version are implemented, ask the user before calling `manifest_release_version`.

## Tool Selection

When the user asks you to work on something, use these tools to find the right feature:

- `manifest_get_active_feature` — the feature selected in the Manifest app. Call this FIRST when the user says "this feature",
  "work on this", "implement it", or gives instructions without specifying which feature. After calling, confirm by
  naming the feature.
- `manifest_get_next_feature` — highest-priority proposed feature from the next unreleased version. Use ONLY when the user
  explicitly says "next feature", "what's next", or "what should I work on next". If it returns an in_progress
  feature, skip it (another agent claimed it) and use `manifest_find_features` with state='proposed' instead.
- `manifest_find_features` — search by project, state, or keyword
- `manifest_get_feature` — full details and history for a known feature ID
- `manifest_get_project_instructions` — full project instructions when the breadcrumb summary isn't enough
- `manifest_render_feature_tree` — display the full tree as ASCII art
- `manifest_get_project_history` — recent activity timeline. Use when the user says "activity", "recent activity",
  "what happened", "show history", or "changelog". Returns completed work with summaries and commits grouped by time.

RULE: The word "next" triggers `manifest_get_next_feature`. The word "activity" or "history" triggers `manifest_get_project_history`.
Everything else triggers `manifest_get_active_feature`.

## Features as Docs

Features describe system capabilities, not work items to close. A feature titled "Router" should make sense
years from now.

**Every leaf feature spec MUST have these two parts:**
1. **User story** opening line: "As a [user], I can [capability] so that [benefit]."
2. **Acceptance criteria** as checkbox items: concrete assertions that can be verified in specs and tests.

Example of a GOOD spec (this is the minimum — write more detail when the feature warrants it):

  As a user, I can mark a todo as complete so that I can track my progress.

  Tapping the checkbox next to a todo toggles its completed state. Completed todos display with strikethrough
  styling.

  - [ ] Checkbox appears to the left of each todo item
  - [ ] Clicking the checkbox toggles the `completed` boolean
  - [ ] Completed todos render with line-through text decoration
  - [ ] Toggling is immediate — no confirmation dialog

Example of a BAD spec (too terse, no user story, no acceptance criteria):

  Clicking a checkbox next to a todo toggles its completed state. Completed todos show with line-through styling.

`manifest_start_feature` returns tier-specific guidance for writing specs at each level (project, feature set, leaf). To write
a spec, use `manifest_update_feature` with `details` to set it directly, or `desired_details` to propose changes for human
review.

When a human edits an implemented feature in the web UI, changes are saved to `desired_details` — `manifest_start_feature`
returns guidance for handling these change requests.

Write what the agent cannot discover from code — intent, business rules, edge cases, acceptance criteria. More
complex features should have proportionally more detail: additional context, more acceptance criteria, edge cases,
and constraints. Do NOT put file paths, directory layouts, codebase overviews, or step-by-step implementation plans
in specs — agents discover code structure on their own and extra context degrades performance.

**Context belongs at different levels of the tree:**

| Level | What goes here | Examples |
|---|---|---|
| Project instructions | Cross-cutting conventions, tech stack, deployment model | "Use pnpm. Deploy via Docker. REST API on port 3000." |
| Feature set details | Domain decisions, constraints, patterns for this area | "Auth uses JWT. Payments use Stripe. All amounts in cents." |
| Leaf feature spec | User story, acceptance criteria, edge cases | "As a user, I can reset my password..." |

Feature set details are the primary mechanism for scoped context — they flow to agents automatically via the
breadcrumb when working on child features. When creating or working under a feature set, populate its details
with architectural decisions and constraints that apply to all children.

## Updating Features

`manifest_update_feature` is the Swiss Army knife for modifying features:
- Change state: Set to 'in_progress', 'archived', etc. (setting 'implemented' is rejected — use `manifest_complete_feature`)
- Update spec: Modify details when implementation reveals new information
- Propose changes: Set desired_details to suggest changes for human review
- Reorganize: Change parent_id to move features in the tree
- Reprioritize: Adjust priority to reorder within parent

`manifest_delete_feature` permanently removes a feature and all its descendants. Use only for archived features. Prefer
archiving to preserve history.

## Planning

When asked to break down, plan, or decompose a project into features:
1. Call `manifest_get_project_instructions` to read the root feature content
2. Call `manifest_render_feature_tree` to see existing features — plan ADDITIONS to the tree, not a replacement
3. If the root has content (PRD, spec, or description), use that as input — do NOT explore the filesystem or ask
   the user what the project is about
4. Design the feature tree, merging into existing groups where possible
5. Call `manifest_plan` with confirm=false to propose the tree structure
6. After user confirms, call `manifest_plan` with confirm=true
7. Distill the root — replace the verbatim PRD with high-level project context using `manifest_update_feature`
8. Create versions and distribute features across them:
   a) Call `manifest_list_versions` first — if versions already exist, build on them rather than starting from scratch
   b) Assess scope: a simple app (1-10 features) may need just one version; a complex app needs multiple
      versions that build incrementally from MVP to full-featured
   c) Create versions with `manifest_create_version` using semantic versioning. For new projects, start at 0.1.0.
      For existing projects, continue from the latest version.
   d) Assign features to versions using `manifest_set_feature_version`. Think about dependency order — features that
      others depend on must ship first. Group tightly-coupled features in the same version.
   e) Each version should be a shippable increment that delivers usable value on its own

## Organization

Before creating features, survey what exists:
1. `manifest_render_feature_tree` — see the full hierarchy and identify where new capabilities belong
2. `manifest_find_features` with a search query — check if a similar feature already exists

When a matching feature exists:
- Update it (`manifest_update_feature`) instead of creating a duplicate
- If it needs restructuring, use parent_id to move it under the right group
- If it's archived but relevant again, set state back to 'proposed'

When creating new features:
- Place them under existing parent groups where they fit
- Only create new parent groups when no existing group covers the domain
- Prefer fewer, well-organized features over many scattered ones

## Workflow

0. TRACK — ensure work is captured in Manifest:
   - When the user asks for non-trivial work (new features, multi-file changes, anything that would trigger
     planning mode), ALWAYS check Manifest first: call `manifest_find_features` to see if a matching feature exists.
   - If no matching feature exists, ask the user: "Should I create a feature in Manifest to track this work?"
   - If the user agrees, call `manifest_create_feature` with a descriptive title under the appropriate parent, then
     write a spec using `manifest_update_feature` before proceeding.
   - If the user declines, proceed without Manifest tracking — but still mention they can add it later.
   - Skip this step for trivial tasks (typo fixes, one-line changes, quick questions).

1. ORIENT — understand what exists and what's needed:
   - `manifest_list_projects` (filter by directory_path to find project for your CWD)
   - `manifest_render_feature_tree` — see the full picture
   - `manifest_get_active_feature` — check what the user is looking at
   - `manifest_get_feature` (include_history=true) — read the spec AND what's been done before
   - `manifest_get_next_feature` — find highest-priority work

2. CLAIM — MANDATORY before implementing:
   - ALWAYS call `manifest_start_feature` when asked to implement, work on, or build a feature
   - `manifest_start_feature` checks specification completeness and transitions proposed to in_progress
   - If the feature is ALREADY in_progress, another agent is likely working on it — ask the user before
     proceeding, and offer the next proposed feature as an alternative
   - If the feature has no details or no testable acceptance criteria, `manifest_start_feature` will refuse — write a spec
     with verifiable criteria using `manifest_update_feature`. Use force=true to bypass for non-testable features (e.g., docs)

   **Greenfield projects**: For new codebases with no existing code, scaffold the project and make an initial
   commit BEFORE calling `manifest_start_feature`. Scaffolders like `rails new`, `create-react-app`, or `cargo init` often
   run `git init` internally, which can interfere with branches. Sequence: scaffold -> initial commit ->
   `manifest_start_feature` -> implement.

3. BUILD — implement against the spec:
   - The feature details ARE your specification
   - Check breadcrumb for parent context (architectural decisions, conventions, constraints)
   - If desired_details is present, this is a CHANGE REQUEST: compare desired_details with details
   - Follow the testing guidance in the `manifest_start_feature` response — it tells you your first step: write failing
     tests BEFORE implementation
   - Write failing tests first, call `manifest_prove_feature` (red), implement, call `manifest_prove_feature` again (green)
   - `manifest_prove_feature` records test evidence separately from completion — call it whenever you have test results
   - Include structured test results: { name, suite, state, file, line, duration_ms, message }
   - The agent is the universal adapter: run any test framework, parse its output into the structured format
   - ITERATE until green: if tests fail after implementation, fix the code and call `manifest_prove_feature` again. Repeat
     until all tests pass. `manifest_complete_feature` will reject if the latest proof has a non-zero exit code.
   - As you implement, `manifest_update_feature` details to reflect what you actually built
   - **Live progress**: When the spec has acceptance criteria checkboxes (`- [ ]`), tick them off
     individually as you complete each one (`- [x]`). Each `manifest_update_feature` call triggers a real-time
     UI refresh, so the user sees progress as it happens.

4. DOCUMENT — MANDATORY after implementing:
   a) call `manifest_update_feature` to set details to what was actually built
   b) call `manifest_prove_feature` to record test evidence
   c) call `manifest_complete_feature` with a summary that captures:
      - Key decisions and their rationale ("Chose X over Y because...")
      - Any deviations from the original spec and why
      - Discoveries that affect sibling features ("Discovered that...")
      - Constraints or gotchas for future work
   NOTE: `manifest_complete_feature` REQUIRES a passing proof (exit_code 0). Fix failing tests and call `manifest_prove_feature` again
   before completing. If the summary contains decisions relevant to sibling features, `manifest_complete_feature` will suggest
   updating the parent feature set's details — apply these suggestions to propagate context upward through the tree.

Common sequence: `manifest_list_projects` -> `manifest_get_active_feature` -> `manifest_start_feature` -> [implement] -> `manifest_prove_feature` ->
`manifest_update_feature` (details) -> `manifest_complete_feature`

## Critical Rules

ALWAYS call `manifest_start_feature` before implementing — it checks spec completeness and returns your specification.
ALWAYS call `manifest_update_feature` after implementing — details must reflect what was actually built.
ALWAYS call `manifest_prove_feature` before `manifest_complete_feature`. `manifest_complete_feature` blocks completion without a passing proof.
ALWAYS call `manifest_complete_feature` with summary and commit SHAs — this records history and marks the feature done.
Iterate until tests pass: if `manifest_prove_feature` records failing tests, fix the implementation and call `manifest_prove_feature`
again. Do NOT call `manifest_complete_feature` until the latest proof has exit_code 0 — the server will reject it.
NEVER change a feature's target version during implementation.
NEVER call `manifest_start_feature` or `manifest_complete_feature` on a feature set (has children). These tools reject
non-leaf features. Work on leaf children instead.
If a feature is already in_progress, skip it — another agent claimed it. Use `manifest_find_features` with state='proposed'
to find unclaimed work instead.
The word "next" triggers `manifest_get_next_feature`. All other references trigger `manifest_get_active_feature`.
