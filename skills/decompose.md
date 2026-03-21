---
name: decompose
description: Decompose a PRD into a feature tree
disable-model-invocation: true
argument-hint: '[path to PRD/spec file, or blank to paste interactively]'
---

Run an interactive feature planning session using structured reasoning phases.

## Arguments

The user's argument is: `$ARGUMENTS`

If the argument above is not empty, it is a path to a PRD, spec, or feature description file. Read the file and use its contents as input — skip the "Gather input" prompt in step 2.

## Steps

### 1. Orient -- Understand the project context

- Call `manifest_list_projects` with `directory_path` set to the current working directory
- If no project found, offer to run `/init` first
- If an MCP connection error occurs, the server is not running -- tell the user to start it with `manifest serve`
- Call `manifest_render_feature_tree` to see what features already exist
- Use `manifest_find_features` to locate the root feature or relevant parent feature set, then call `manifest_get_feature` with `view="full"` to read project-wide and feature-set context from the breadcrumb
- This context constrains your decomposition -- don't propose features that duplicate existing ones, and respect established patterns

### 2. Gather input

**If a file path argument was given (see Arguments above):**
- Read the file at the given path
- Use its contents as input for the analysis phases below
- Skip the interactive prompt

**Otherwise**, check if the conversation contains initialization context from `/init` (look for "Initialization context:" with classification, since, and focused_directories fields).

**If classification is `greenfield`:**
- Do NOT offer the "analyze" option (there's nothing to analyze)
- Prompt:
  ```
  What would you like to plan?

  Options:
  - Paste a PRD, spec, or feature description
  - Describe the capabilities you want to add
  ```

**If classification is `large` with `since` or `focused_directories`:**
- When the user picks "analyze", focus your codebase reading on the `focused_directories` if set
- If `since` is set, use `git log --since` to understand recent changes and focus there
- Show: "Analyzing [scope]..." instead of "Analyzing codebase..."
- Otherwise offer the standard options below

**Default (small/medium or no init context):**
```
What would you like to plan?

Options:
- Paste a PRD, spec, or feature description
- Describe the capabilities you want to add
- Say "analyze" to let me examine the codebase
```

**If the user says "analyze":**
- Read the project's key files: README, package.json/Cargo.toml/etc., entry points, route definitions, and directory structure
- Examine git log for recent activity areas
- Identify the system's existing capabilities from code structure, exports, and route definitions
- Use your findings as input for the analysis phases below
- Tell the user: "Analyzed codebase. Found [N] capability areas. Proposing feature tree..."

### 3. Analyze -- Structured reasoning before designing

Work through these phases in order. Do your reasoning internally, but surface the results.

**Phase A: Extract explicit capabilities.**
Read the input and list every capability the user explicitly described. These are the "happy path" features -- what the user knows they want.

**Phase B: Infer implied capabilities.**
This is the critical step. For each explicit capability, ask: "What else must the system be able to do for this to work?" Look for:
- Capabilities the user assumes exist but didn't mention (e.g., "user uploads a file" implies the system can store and serve files)
- Cross-cutting concerns that apply to multiple features (e.g., authorization, validation, error handling) -- these belong in parent-level context, not as separate features
- Enabling capabilities that must exist first (e.g., "invite a team member" implies user management exists)

If the project uses libraries or frameworks you're unsure about, look up their documentation (via web search, documentation tools, or other available resources) to inform your capability analysis.

Important: Inferred items should be *capabilities*, not implementation tasks. "File Storage" is a capability. "Configure S3 bucket" is a task -- put that in the feature's spec, not as a separate feature.

**Phase C: Flag ambiguity.**
Scan for anything that is vague, subjective, or underspecified. Collect these as clarification questions. Common triggers:
- Subjective terms: "fast", "seamless", "robust", "intuitive" -- what does the user actually mean?
- Unstated scope: "social login" -- which providers? "notifications" -- email, push, in-app?
- Missing constraints: no mention of performance requirements, data limits, or supported platforms
- Contradictions or tensions between stated requirements
- **Data model decisions**: ID types (UUID vs integer vs ULID), enum representations (string vs integer), naming conventions (snake_case vs camelCase), timestamp formats (ISO 8601, Unix). If the input specifies these, record them. If it doesn't, flag the question -- these choices affect every feature that touches the data layer and must be consistent.

Don't guess at answers. Collect them for the user.

### 4. Design the feature tree

Now structure your analysis into a feature tree:
- Apply the user story test to each leaf: "As a [user], I can [capability]..."
- Name features by capability (e.g., "Router" not "Implement routing")
- Group related features under parent nodes
- Assign priorities (lower = implement first)
- **Write tier-appropriate details:**
  - Parent features: shared architectural context, patterns, constraints for children
  - Leaf features: focused specification (50-150 words) with this structure:
    1. **User story** opening line: "As a [user], I can [capability] so that [benefit]."
    2. Brief context (1-2 sentences): key behavior, constraints, or edge cases.
    3. **Acceptance criteria** as checkbox items (3-5): concrete assertions verifiable in specs and tests.
  - Write what agents cannot discover from code (business rules, edge cases, product intent). Do NOT include file paths, directory layouts, or implementation approach.
  - **Never repeat the feature title in the details** -- the title is displayed separately in the UI

  Example of a good leaf spec:

  > As a user, I can mark a todo as complete so that I can track my progress.
  >
  > Tapping the checkbox next to a todo toggles its completed state. Completed todos display with strikethrough styling.
  >
  > - [ ] Checkbox appears to the left of each todo item
  > - [ ] Clicking the checkbox toggles the `completed` boolean
  > - [ ] Completed todos render with line-through text decoration
  > - [ ] Toggling is immediate -- no confirmation dialog

- Parent details flow to all children via breadcrumb -- put shared decisions there, not in every leaf

### 5. Present the proposal

Call `manifest_decompose` with `confirm: false` to get a preview.

Display the proposed tree FIRST, then any clarification questions AFTER. The tree is the primary output -- questions come last so the user sees what they're approving before deciding whether to refine.

```
Proposed Feature Tree:

* [Parent Feature]
|  [Description]
+-- * [Child Feature 1] (priority: 1)
|      [Description]
\-- * [Child Feature 2] (priority: 2)
        [Description]

Clarification needed:
- [Question about vague/missing requirement]
- [Question about unstated scope]

These questions won't block creation, but answering them will
improve the specs. Want to address them now, or create as-is
and refine later?
```

If there are no clarification questions, skip that section.

### 6. Iterate or confirm

- If user answers clarification questions, update the relevant feature specs and re-present
- If user wants structural changes, modify and re-present
- If user approves, call `manifest_decompose` with `confirm: true`, then IMMEDIATELY proceed to steps 7 and 8 -- they are mandatory

### 7. Write root node project context (MANDATORY)

**Do NOT skip this step.** The root feature is the project's living context document -- like a CLAUDE.md that agents read via breadcrumb before working on any child feature.

Call `manifest_update_feature` on the project's root feature to set its details to:
- Project overview (1-2 sentences)
- Tech stack and key dependencies
- Architectural decisions and conventions
- Language/framework coding guidelines: idioms, patterns, and conventions for the tech stack (e.g., async patterns, type safety approach, error handling style, import conventions, testing framework idioms). These guide every feature implementation.
- Data model decisions resolved during Phase C (ID types, enum representations, naming conventions)
- Integration rule: features that establish shared infrastructure (database, auth, caching, etc.) define the canonical implementation. Dependent features must use existing infrastructure, not create parallel implementations. If a database layer exists, endpoints use it -- no in-memory substitutes.
- Any other cross-cutting constraints (directory structure, CI requirements)

Also provide `details_summary` (~200 words) so breadcrumbs stay concise.

If the PRD was pasted directly into the root, distill it -- the detailed requirements have been distributed to children. If the root had no content, write project-level context based on what you learned during analysis. If the root already has appropriate high-level context, leave it.

### 8. Create versions and distribute features (MANDATORY)

**Do NOT skip this step.** Features must be assigned to semantic versions, not left in the backlog.

1. Call `manifest_list_versions` first -- if versions already exist (e.g., from `/init`), build on them rather than creating duplicates
2. Create versions with `manifest_create_version` using semantic versioning:
   - 0.1.0: foundational features (project setup, data model, basic CRUD)
   - 0.2.0: features that build on 0.1.0 (filtering, pagination, validation)
   - 0.3.0+: advanced features (soft delete, tagging, integrations)
   For existing projects, continue from the latest version.
3. Assign EVERY feature to a version using `manifest_set_feature_version`:
   - Think about dependency order -- features that others depend on ship first
   - Group tightly-coupled features in the same version
   - Each version should be a shippable increment that delivers usable value
4. No features should remain in the backlog after this step

### 9. Display result

```
Created [N] features across [M] versions.

Use /versions to see the release roadmap.
Use /features to see the full hierarchy.
Use /start to begin work on the first feature.
```
