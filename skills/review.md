---
name: review
description: Run a Critical Reviewer pass for the current feature
disable-model-invocation: true
---

Run the Critical Reviewer phase for the current in-progress feature.

This is a findings-only pass. Do not edit code, add tests, or change the implementation during review.

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running — tell the user to start it with `manifest serve`

2. Find the in-progress feature:
   - Call `manifest_find_features` with `project_id` and `state: "in_progress"`
   - If no in-progress features, tell the user there's nothing to review
   - If multiple in-progress features, list them and ask which one

3. Check proof status:
   - Call `manifest_get_feature_proof`
   - If there is no passing proof, stop and tell the user to finish the prove step first

4. Run the Critical Reviewer analysis:
   - Call `manifest_verify_feature` for the feature
   - Review the spec, proof, and implementation diff with an adversarial mindset
   - Focus on:
     - realistic failure modes
     - missing unhappy-path tests
     - persistence and input boundaries
     - async state transitions
     - config/runtime-mode branches
     - spec mismatches
     - sibling integration when clearly relevant

5. Record the result:
   - If there are no findings, call `manifest_record_verification` with `comments: []`
   - If there are findings, call `manifest_record_verification` with concrete comments including:
     - `title`
     - `severity` (`critical`, `major`, or `minor`)
     - `body`
     - `file` when known

6. Report the outcome:
   - If passed, tell the user Critical Reviewer passed and they can move to `/complete`
   - If failed, list findings first and tell the user the feature returns to implementation until they are fixed and reproved

## Important

- This phase is read-only. Do not patch code here.
- Prefer real defects and missing coverage over style opinions.
- If uncertain, bias toward concrete, reproducible findings only.
