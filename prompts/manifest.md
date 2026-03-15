---
description: Manifest — living feature documentation for the software you are building.
---

# Manifest

Manifest tracks features (system capabilities) as living documentation. Features form a hierarchical tree with states: ◇ proposed, ○ in_progress, ● implemented, ⊘ blocked, ✗ archived.

## Project discovery

ALWAYS pass `directory_path` (current working directory) when calling `manifest_list_projects`, `manifest_get_next_feature`, `manifest_render_feature_tree`, or `manifest_get_active_feature`. Never list all projects and ask the user to pick.

## Output rules

Tool results ARE your response. Do NOT summarize, add a legend, or editorialize after a tool returns formatted output.

## Workflow

When the user asks you to implement, build, or work on a feature:

1. **TRACK** — Search for an existing feature (`manifest_find_features`). If found, use it. If not, offer to create one.
2. **CLAIM** — Call `manifest_start_feature` before writing code. It returns the spec.
3. **BUILD** — Implement against the spec. TDD: write failing tests, `manifest_prove_feature` (red), implement, `manifest_prove_feature` (green).
4. **DOCUMENT** — Update the spec (`manifest_update_feature`), record proof (`manifest_prove_feature`), complete (`manifest_complete_feature` with summary + commit SHAs).

When the user says "yes" or "start it" after seeing a feature, proceed to CLAIM and then BUILD — do not stop after claiming.

After all tests pass, ALWAYS complete the lifecycle: update the spec, then call `manifest_complete_feature` with a summary and commit SHAs. Do not stop after proving — the feature is not done until it is marked complete.

## Stale feature triage

When `manifest_get_next_feature` returns in_progress features, do not just report them — investigate each one:

1. Call `manifest_get_feature` with `include_history: true` to read the spec and work history
2. Call `manifest_get_feature_proof` to check if there's a passing proof
3. If proof exists and passes (exit_code 0):
   - Compare the spec's acceptance criteria against the implementation summary
   - If everything matches, the feature is done — call `manifest_complete_feature` with a summary
   - If there are gaps, report what's missing
4. If no proof or proof fails:
   - Run the tests to see current state
   - Report whether the feature needs more work or just needs proving
5. If the feature appears abandoned (no recent history, no proof), ask the user whether to complete or archive it

Do not suggest new work until all stale features are resolved.

## Tool routing

| User says | Tool |
|---|---|
| "what's next", "next feature" | `manifest_get_next_feature` (server checks for in_progress first) |
| "show the tree", "feature tree" | `manifest_render_feature_tree` |
| "show history", "activity" | `manifest_get_project_history` |
| "this feature", "active feature" | `manifest_get_active_feature` |
| "plan this", "break this down" | `manifest_plan` |

## Agents

If `dispatch_agent` is available, delegate to specialist agents:

- **navigator** — read-only queries (tree, search, history, versions)
- **feature-worker** — implementation lifecycle (claim, build, prove, complete)
- **product-manager** — specs, planning, versions, reviews
- **code-reviewer** — verify implementations against specs, triage stale features

## Rules

- ALWAYS call `manifest_start_feature` before implementing
- ALWAYS call `manifest_prove_feature` before `manifest_complete_feature`
- NEVER call `manifest_start_feature` on a feature set (has children) — work on leaf children
- If a feature is already in_progress, another agent claimed it — ask before proceeding
