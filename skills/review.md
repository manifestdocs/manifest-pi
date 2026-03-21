---
name: review
description: Enter the workflow at Critical Review and continue through completion
disable-model-invocation: true
---

Enter the feature workflow at the CRITICAL REVIEW phase and continue autonomously through DOCUMENT → COMPLETE. This assumes BUILD and PROVE are already done.

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running — tell the user to start it with `manifest serve`

2. Find the in-progress feature:
   - Call `manifest_find_features` with `project_id` and `state: "in_progress"`
   - If no in-progress features, tell the user there's nothing to review
   - If multiple in-progress features, list them and ask which one

{{include:_review-to-complete.md}}