---
name: delete
description: Delete an archived feature permanently
disable-model-invocation: true
argument-hint: '[feature name]'
---

Permanently delete an archived feature.

**WARNING:** This is irreversible. Prefer archiving over deletion to preserve history. Only delete features that are archived and no longer needed.

## Arguments

The user's argument is: `$ARGUMENTS`

If the argument above is not empty, it is the name of the feature to delete.

## Steps

1. Find the feature:
   - Call `manifest_find_features` with `project_id` and `query` set to the argument
   - If no matches, tell the user and suggest `/features`
   - If multiple matches, list them and ask which one

2. Check the feature state:
   - If the feature is NOT archived, refuse and say:
     ```
     "[Title]" is not archived (state: [state]).

     delete_feature permanently removes a feature and all its descendants.
     This tool only accepts archived features.

     To archive it first: update the feature state to 'archived', then delete.
     ```

3. Confirm with the user:
   ```
   Delete "[Title]" permanently?

   This will also delete [N] descendants if any exist.
   This cannot be undone.

   Type "yes" to confirm.
   ```

4. If confirmed, call `manifest_delete_feature` with the `feature_id`.

5. Display result:
   ```
   Deleted: [Title]
   ```
