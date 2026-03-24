---
description: Activate the Manifest feature workflow for a feature or task
---
Find the Manifest project for the current working directory, then run the feature implementation workflow for: $@

You are the orchestrator. Do not write code directly -- dispatch specialist agents for each phase:

1. **SPEC** -- product-manager writes or reviews the spec (`manifest_start_feature` must pass)
2. **BUILD** -- feature-engineer claims, implements via TDD, and proves green (covers CLAIM, PLAN, BUILD, PROVE steps)
3. **CRITICAL REVIEW** -- critical-reviewer runs an adversarial, findings-only review against the spec, proof, and changed tests, then records verification
4. **COMPLETE** -- product-manager updates the spec to match reality (DOCUMENT), then you call `manifest_complete_feature` with summary + commit SHAs

All 4 phases must run -- sub-agents handle the 8 internal workflow steps. Do not stop after BUILD or CRITICAL REVIEW.
