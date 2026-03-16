---
name: complete
description: Finish the current feature and record your work
disable-model-invocation: true
---

Complete work on the current in-progress feature.

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running — tell the user to start it with `manifest serve`

2. Find the in-progress feature:
   - Call `manifest_find_features` with `project_id` and `state: "in_progress"`
   - If no in-progress features, tell the user there's nothing to complete
   - If multiple in-progress features, list them and ask which one

3. **Check for uncommitted changes:**
   - Run `git status --porcelain`
   - If there are uncommitted changes:

     ```
     You have uncommitted changes:
     [list modified files]

     Should I commit them now? (y/n)
     ```

   - If yes, ask for a commit message and run:
     ```bash
     git add -A && git commit -m "<message>"
     ```

4. Gather commit information:
   - Determine base branch (`main` or `master`)
   - Get commits on this branch: `git log <base>..HEAD --oneline`
   - Present the commits:
     ```
     Commits for this feature:
     [sha1] [message1]
     [sha2] [message2]
     ...
     ```

5. Ask for a work summary:

   ```
   Please provide a summary of the work done on "[Feature Title]".

   Format: First line is a concise headline. After a blank line, include:
   - What was implemented
   - Key decisions made during implementation and why
   - Any deviations from the original spec and reasoning
   - Context for the next person working in this area

   Example:
   Implemented OAuth login flow

   - Added Google OAuth provider using passport.js
   - Chose session-based auth over JWT (simpler for SSR app)
   - Deviated from spec: skipped GitHub OAuth (rate limits too restrictive)
   - Note: refresh token rotation not yet implemented
   ```

6. **Determine git workflow:**
   - Check if user has a saved preference (see "Remembering Preferences" below)
   - If no saved preference, ask:

     ```
     How do you want to finish this feature?

     1. Merge to main (solo project, no review needed)
     2. Create a pull request (team project, needs review)
     3. Just record it (leave branch as-is, I'll handle git myself)

     Want me to remember this choice for future features? (y/n)
     ```

   - Save preference if requested (in CLAUDE.md or project instructions)

7. **Execute git workflow:**

   **If "Merge to main":**

   ```bash
   git checkout <base>
   git merge --no-ff feature/<slug> -m "Merge feature: <title>"
   git push origin <base>
   git branch -d feature/<slug>  # delete local branch
   ```

   **If "Create a pull request":**

   ```bash
   git push -u origin feature/<slug>
   gh pr create --title "<Feature Title>" --body "## Summary
   <work summary>

   ## Changes
   <list of commits>"
   ```

   - Display the PR URL to the user

   **If "Just record it":**
   - Skip git operations, just record in Manifest

8. **Record test evidence (always, unless already done during implementation):**
   - Run the test suite if not already run
   - Call `manifest_prove_feature` with the test command, exit code, and structured results
   - Include `{ name, suite, state, file, line, duration_ms, message }` for each test
   - The agent is the adapter: parse any framework's output into this format
   - Skip only if `manifest_prove_feature` was already called with passing results during implementation
   - **Note:** `manifest_complete_feature` returns warnings when proof is missing — always record evidence first

9. **Update the feature spec:** Use `manifest_update_feature` to update the feature's details to reflect what was actually built. Keep it concise — goal, what was implemented, key interfaces, any deviations from original spec. For change requests, make sure `details` reflects the new state (since `desired_details` will be cleared automatically).
   - **Note:** `manifest_complete_feature` returns warnings when the spec hasn't been updated since `manifest_start_feature` — always update details first
   - **TIP — Live progress:** For the best user experience, call `manifest_update_feature` after completing each acceptance criterion to tick its checkbox (`- [ ]` → `- [x]`). Each call triggers a real-time UI refresh, so the user sees progress as it happens. This is optional — batch-updating at the end works too.

10. Complete the feature:
   - Call `manifest_complete_feature` with:
     - `feature_id`
     - `summary` from user input
     - `commits` array with commit SHAs and messages
   - `manifest_complete_feature` automatically clears `desired_details` if present (change request fulfilled)
   - When a feature is marked as implemented, any features blocked by it are automatically checked — if all their blockers are now implemented, they auto-transition from `blocked` to `proposed`

   **Note:** Mark the feature as implemented when the PR is _created_, not when it's merged. The feature specification is complete once the code exists. PR review is about code quality, not feature completeness. If review feedback changes the feature scope, that's a separate conversation.

11. **Propagate learnings:** If you discovered something during implementation that applies to sibling features (a shared pattern, convention, or constraint), suggest updating the parent feature's details so future agents inherit it.

12. Display confirmation:

```
Completed: [Title]
State: in_progress → implemented

[If merged]: Merged to <base> and pushed.
[If PR]: Pull request created: <URL>
           Feature marked implemented. PR review is for code quality.
[If skipped]: Branch feature/<slug> left as-is.

Recorded [N] commits in history.
```

## Remembering Preferences

Store the user's git workflow preference so they don't have to answer every time:

- Look for a comment in the project's CLAUDE.md or instructions:
  ```
  <!-- manifest:git-workflow=merge -->
  ```
  or
  ```
  <!-- manifest:git-workflow=pr -->
  ```
- If found, use that workflow without asking
- When user asks to remember, add this comment to the appropriate file
