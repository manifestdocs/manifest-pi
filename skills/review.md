---
name: review
description: Enter the workflow at Critical Review and continue through completion
disable-model-invocation: true
---

Enter the feature workflow at the CRITICAL REVIEW phase and continue autonomously through DOCUMENT → COMPLETE. This assumes BUILD and PROVE are already done.

## Steps

1. Find the in-progress feature:
   - Call `manifest_find_features` with `project_id` and `state: "in_progress"`
   - If no in-progress features, tell the user there's nothing to review
   - If multiple in-progress features, list them and ask which one

{{include:_review-to-complete.md}}