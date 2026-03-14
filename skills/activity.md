---
name: activity
description: Show recent activity timeline for the current project. Use when the user asks "what happened?", "recent activity", or "show history".
disable-model-invocation: true
---

Show recent activity across the project or for a specific feature.

## Arguments

Optional: a feature name or search term to filter activity to that feature and its descendants.

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running — tell the user to start it with `manifest serve`

2. If arguments were provided, search for the feature:
   - Call `manifest_find_features` with `project_id` and `query` set to the arguments
   - Use the first matching feature's ID as the `feature_id` filter
   - If no matches found, tell the user and fall back to project-wide activity

3. Call `manifest_get_project_history` with:
   - `project_id` from step 1
   - `feature_id` from step 2 (if applicable)
   - Default limit (20 entries)

4. Display the returned timeline text DIRECTLY in your response as a code block. Do NOT summarize, reformat, or add commentary around the timeline — it is pre-rendered to mirror the web app's Activity tab.
