---
name: release
description: Mark a version as released
disable-model-invocation: true
argument-hint: '[version name]'
---

Mark a version as released.

## Arguments

The user's argument is: `$ARGUMENTS`

If the argument above is not empty, it is the version name to release. If empty, releases the "now" version.

## Steps

1. Get versions:
   - Call `manifest_list_versions` with the project ID

2. Find the version to release:

   **If a version name argument was given (see Arguments above):**
   - Find the version matching the name
   - If not found, list available versions

   **If no argument was given:**
   - Use the "now" version (first unreleased)
   - If no unreleased versions, tell the user

3. Show version status:

   ```
   Releasing: [version name]

   Features in this version:
   - [Feature 1] (● implemented)
   - [Feature 2] (● implemented)
   - [Feature 3] (○ in_progress) [!]

   [N] features implemented, [M] still in progress.
   ```

4. Confirm if there are incomplete features:

   ```
   WARNING: Some features are not yet implemented. Release anyway?
   ```

5. Release the version:
   - Call `manifest_release_version` with the version ID

6. Display result:

   ```
   Released: [version name]

   [Next version name] is now the current focus ("now").
   ```
