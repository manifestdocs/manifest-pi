---
name: activity
description: Show recent project activity
disable-model-invocation: true
---

Show recent activity across the project or for a specific feature.

## Arguments

Optional: a feature name or search term to filter activity to that feature and its descendants.

## Steps

1. If arguments were provided, search for the feature:
   - Call `manifest_find_features` with `project_id` and `query` set to the arguments
   - Use the first matching feature's ID as the `feature_id` filter
   - If no matches found, tell the user and fall back to project-wide activity

2. Call `manifest_get_project_history` with:
   - `project_id`
   - `feature_id` from step 1 (if applicable)
   - Default limit (20 entries)

3. Display the returned timeline as a code block. Do not add commentary — it is pre-rendered.
