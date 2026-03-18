# Code Review: fastapi-todo-api

**Date:** 2026-03-16
**Agent:** manifest-pi
**Project:** FastAPI Todo API (sandbox evaluation)
**Code:** `/Users/alastair/sandbox/fastapi-todo-api`

## Summary

First real-world evaluation of a manifest-pi agent building a project through the Manifest feature workflow. The agent decomposed a PRD into 26 features across 3 versions, then implemented 7. Per-feature code quality is good, but cross-feature integration failed and some implemented features have internal inconsistencies.

## Spec Compliance

### Implemented features (7 of 26)

| Feature | ID | Spec Match | Notes |
|---------|----|-----------|-------|
| Bootstrap App | FAST-2 | Good | Factory pattern, settings injection, proper structure |
| Async Database | FAST-3 | Built but unused | Engine + session factory created, never wired to endpoints |
| Health Check | FAST-4 | Good | Minimal spec, fully implemented |
| Logging & CORS | FAST-5 | Good | Dev-only CORS, request timing middleware |
| Schemas | FAST-8 | Good | Pydantic v2 validators, trimming, range checks |
| Alembic Migration | FAST-9 | Column mismatch | `is_completed`/`due_at` in DB vs `completed`/`due_date` in app |
| Update Endpoints | FAST-13 | Good | PUT + PATCH with proper 404/422 handling |

### Acceptance criteria discipline

- FAST-9 is marked implemented but all acceptance criteria checkboxes are unchecked -- the agent didn't tick them off via `update_feature`.
- Other implemented features have properly checked criteria.

## Issues

### CRITICAL: Database infrastructure never connected

**Files:** `app/main.py:22-32`, `app/api/router.py:8-9`, `app/db.py:17-23`

`db.py` creates an async engine and session factory. The lifespan in `main.py` initializes them. But `main.py:22` sets `app.state.todo_store = InMemoryTodoStore()`, and every endpoint resolves its dependency from that in-memory store. The `get_db_session()` dependency in `db.py` is never imported or used by any route. All data is lost on restart.

The agent built FAST-3 (async database) and FAST-13 (update endpoints) as independent features without connecting them. No integration test catches this gap.

### MAJOR: Schema-migration column mismatch

**Files:** `alembic/versions/20260316_0001_baseline_todos.py:26-27`, `app/todos.py:21-22,85-95`

The Alembic migration defines columns as:
- `is_completed` (Boolean)
- `due_at` (DateTime with timezone)

The Pydantic schemas and TodoRecord dataclass use:
- `completed` (bool)
- `due_date` (date | datetime | None)

Additionally, the migration is **missing a `priority` column** entirely, despite priority being a core field in the schemas (int, 1-5).

The migration also defines a `deleted_at` column for soft-delete support, but nothing in the application references it.

When the ORM model is eventually created, these mismatches will cause mapping failures.

### MAJOR: PRD data model decisions silently changed

**Files:** `PRD.md:34,38`, `app/todos.py:12-14,88`

| Field | PRD specifies | Implementation |
|-------|--------------|----------------|
| ID | UUID, auto-generated | Integer, auto-increment |
| Priority | String enum: "low", "medium", "high" | Integer range: 1-5, default 3 |

These are valid design choices, but the divergence was never documented. The decomposition step didn't surface or resolve these ambiguities, and the feature specs don't record the decisions.

### MINOR: No response envelope

**Files:** `PRD.md:107-123`, `app/api/router.py:17,29`

The PRD specifies a `{data, meta}` envelope format for all responses. Endpoints return bare Pydantic models. Feature FAST-24 exists for this but is assigned to v0.2.0.

### MINOR: Tests validate layers in isolation

**Files:** `tests/test_async_database.py`, `tests/test_update_todo_endpoints.py`

25 tests pass. They verify:
- Schema validation rules (correct)
- DB setup/teardown lifecycle (correct)
- Endpoint request/response contracts via in-memory store (correct)

But no test verifies that an endpoint persists data to the database. The test suite gives a green signal while the core integration is broken.

## What Worked Well

1. **Code quality per feature** -- 100% type hints, thorough Pydantic v2 validators with pre/post-trim, clean pydantic-settings with env prefix and lru_cache singleton.
2. **App structure** -- Factory pattern (`create_app(settings)`), proper async lifespan, dev-only CORS gated on `settings.environment`.
3. **Test structure** -- Clear names, good assertions, proper fixtures, test-first approach for schemas.
4. **Feature decomposition** -- 26 features across 3 versions is a reasonable breakdown of the PRD.

## Workflow Improvement Recommendations

### 1. Cross-feature integration checks

When multiple features under the same parent are implemented, prompt the agent to verify they work together. For example: "FAST-3 (database) and FAST-13 (endpoints) are both implemented -- verify endpoints use the database layer."

**Evidence:** Database infrastructure and endpoints built independently, never connected.

### 2. Resolve data model decisions during decomposition

During planning/decomposition, ambiguities in the PRD (UUID vs int, enum vs range, response envelope) should be explicitly resolved and recorded in the parent feature's details.

**Evidence:** PRD says UUID + string enum; implementation uses int + int range. No feature spec records this decision.

### 3. Enforce acceptance criteria updates

The `complete_feature` gate requires spec updates, but ticking acceptance criteria checkboxes should be a more explicit step in the workflow prompt.

**Evidence:** FAST-9 marked implemented with all checkboxes unchecked.
