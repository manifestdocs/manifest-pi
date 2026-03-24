---
name: assign
description: Assign a feature to a version
disable-model-invocation: true
argument-hint: '[feature] [version]'
---

Assign a feature to a target version.

## Arguments

The user's argument is: `$ARGUMENTS`

If the argument above is not empty, it contains the feature name and version name (e.g., "Router v0.2.0").

## Steps

1. Parse arguments:
   - Extract feature search term and version name from the argument
   - If unclear, ask for clarification:

     ```
     Please specify both feature and version:
     /assign [feature name] [version name]

     Example: /assign Router v0.2.0
     ```

2. Find the feature:
   - Call `manifest_find_features` with `project_id` and `query`
   - If no matches or multiple matches, clarify with user

3. Find the version:
   - Call `manifest_list_versions` with the project ID
   - Match by name
   - If not found, list available versions

4. Assign the feature:
   - Call `manifest_set_feature_version` with `feature_id` and `version_id`

5. Display result:

   ```
   Assigned: [Feature title] → [Version name]
   ```

## Unassigning

To remove a feature from a version, the user can say "unassign [feature]" and you should:

- Call `manifest_set_feature_version` with `feature_id` and `version_id: null`
- Confirm: "Unassigned: [Feature title] (now in backlog)"
