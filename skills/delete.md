---
name: delete
description: Permanently delete an archived feature and all its descendants. Use only for cleanup of features that are no longer needed.
disable-model-invocation: true
argument-hint: '[feature name]'
---

Permanently delete an archived feature.

**WARNING:** This is irreversible. Prefer archiving over deletion to preserve history. Only delete features that are archived and no longer needed.

## Arguments

`$ARGUMENTS` - Name of the feature to delete

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running — tell the user to start it with `manifest serve`

2. Find the feature:
   - Call `manifest_find_features` with `project_id` and `query` set to `$ARGUMENTS`
   - If no matches, tell the user and suggest `/tree`
   - If multiple matches, list them and ask which one

3. Check the feature state:
   - If the feature is NOT archived, refuse and say:
     ```
     "[Title]" is not archived (state: [state]).

     delete_feature permanently removes a feature and all its descendants.
     This tool only accepts archived features.

     To archive it first: update the feature state to 'archived', then delete.
     ```

4. Confirm with the user:
   ```
   Delete "[Title]" permanently?

   This will also delete [N] descendants if any exist.
   This cannot be undone.

   Type "yes" to confirm.
   ```

5. If confirmed, call `manifest_delete_feature` with the `feature_id`.

6. Display result:
   ```
   Deleted: [Title]
   ```
