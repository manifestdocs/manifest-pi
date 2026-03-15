---
description: Manifest — living feature documentation for the software you are building.
---

# Manifest

Manifest tracks features (system capabilities) as living documentation. Features form a hierarchical tree with states: ◇ proposed, ○ in_progress, ● implemented, ⊘ blocked, ✗ archived.

## Project discovery

ALWAYS pass `directory_path` (current working directory) when calling `manifest_list_projects`, `manifest_get_next_feature`, `manifest_render_feature_tree`, or `manifest_get_active_feature`. Never list all projects and ask the user to pick.

## Output rules

Tool results ARE your response. Do NOT summarize, reformat, or editorialize after a tool returns formatted output.

When the user says "show me the feature", "feature card", or "show details" — call `manifest_get_feature` with default view (card). Display the result directly. Do NOT reformat it into your own layout.

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
| "show me the feature", "feature card", "show details" | `manifest_get_feature` (default card view) |
| "full context", "show breadcrumb", "show history" | `manifest_get_feature` with `view: "full"` |
| "this feature", "active feature" | `manifest_get_active_feature` |
| "plan this", "break this down" | `manifest_plan` |
| "check the X feature set", "is X done" | `manifest_find_features` → `manifest_get_feature` on matches |
| "show versions", "roadmap" | `manifest_list_versions` |
| "review against spec", "verify feature" | `manifest_verify_feature` or `manifest_get_feature` + compare |

## Agents

If `dispatch_agent` is available, delegate to specialist agents:

- **product-manager** — specs, planning, versions, reviews, verification
- **feature-engineer** — implementation lifecycle (claim, build, prove, complete)
- **code-reviewer** — verify implementations against specs, triage stale features

### Team workflow (when dispatch_agent is available)

When the user says "work on feature X", "implement feature X", or "what's next", activate the deterministic feature workflow:

1. **Spec phase**: Dispatch product-manager to write/refine the spec with user story, acceptance criteria, and contract/API shape. The spec must pass the quality gate (user story + checkboxes + 50+ chars).
2. **Implementation phase**: Dispatch feature-engineer to implement via TDD (red > green), covering happy path + error cases.
3. **Review phase**: Dispatch code-reviewer to check code quality, then product-manager to review specs vs implementation. Loop until verification passes.
4. **Completion phase**: Dispatch feature-engineer to call manifest_complete_feature.

For one-off tasks ("update the header", "fix the typo"), handle directly without dispatching.

## Recording test proof

When calling `manifest_prove_feature`, parse test output into **individual test entries** — one per test case, not one per file or suite. The UI displays each entry separately so summarizing defeats the purpose.

**How to parse**: Run tests with a format that lists individual examples. Parse each line into a structured entry.

| Framework | Flag | Parse pattern |
|---|---|---|
| RSpec | `--format documentation` | Indented lines = suite/test hierarchy. "FAILED" suffix = failed. |
| Vitest / Jest | default | Lines like `✓ test name (Xms)` or `✗ test name` |
| pytest | `-v` | Lines like `test_file.py::test_name PASSED` |
| Go test | `-v` | Lines like `--- PASS: TestName (0.01s)` |

**Example** — RSpec with `--format documentation` outputs:
```
Pet Management
  GET /api/v1/pets/:id
    returns 200 with pet data
    returns 403 when scope is wrong
```

Parse into:
```json
{
  "test_suites": [{
    "name": "Pet Management",
    "file": "spec/requests/api/v1/pets_spec.rb",
    "tests": [
      { "name": "GET /api/v1/pets/:id returns 200 with pet data", "state": "passed" },
      { "name": "GET /api/v1/pets/:id returns 403 when scope is wrong", "state": "passed" }
    ]
  }]
}
```

NEVER collapse multiple test examples into a single entry. If rspec says "58 examples, 0 failures", there must be 58 entries in `tests`, not 1.

## Rules

- ALWAYS call `manifest_start_feature` before implementing
- ALWAYS call `manifest_prove_feature` before `manifest_complete_feature`
- NEVER call `manifest_start_feature` on a feature set (has children) — work on leaf children
- If a feature is already in_progress, another agent claimed it — ask before proceeding
