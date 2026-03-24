---
name: complete
description: Enter the workflow at Document and continue through completion
disable-model-invocation: true
---

Enter the feature workflow at the DOCUMENT phase and continue through COMPLETE. Use this when BUILD, PROVE, and CRITICAL REVIEW are already done.

**If proof or review are missing**, this skill will run them first — the gates enforce the correct order.

## Steps

1. Find the in-progress feature:
   - Call `manifest_find_features` with `project_id` and `state: "in_progress"`
   - If no in-progress features, tell the user there's nothing to complete
   - If multiple in-progress features, list them and ask which one

{{include:_review-to-complete.md}}

## Remembering Preferences

Store the user's git workflow preference so they don't have to answer every time:

- Look for a comment in the project's CLAUDE.md or root feature details:
  ```
  <!-- manifest:git-workflow=merge -->
  ```
  or
  ```
  <!-- manifest:git-workflow=pr -->
  ```
- If found, use that workflow without asking
- When user asks to remember, add this comment to the appropriate file