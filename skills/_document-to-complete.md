### Phase 6: DOCUMENT

Update the feature spec with `manifest_update_feature` to reflect what was actually built. Keep it concise — goal, what was implemented, key interfaces, any deviations from original spec. For change requests, make sure `details` reflects the new state (since `desired_details` is cleared automatically).

### Phase 7: COMPLETE

1. **Check for uncommitted changes:**
   - Run `git status --porcelain`
   - If there are uncommitted changes, commit them with a meaningful message

2. **Determine git workflow:**
   - Check if user has a saved preference (look for `<!-- manifest:git-workflow=merge -->` or `<!-- manifest:git-workflow=pr -->` in CLAUDE.md or root feature details)
   - If no saved preference, ask:
     ```
     How do you want to finish this feature?
     1. Merge to main (solo project, no review needed)
     2. Create a pull request (team project, needs review)
     3. Just record it (leave branch as-is, I'll handle git myself)
     Want me to remember this choice for future features? (y/n)
     ```

3. **Execute git workflow:**

   **If "Merge to main":**
   ```bash
   git checkout <base>
   git merge --no-ff feature/<slug> -m "Merge feature: <title>"
   git push origin <base>
   git branch -d feature/<slug>
   ```

   **If "Create a pull request":**
   ```bash
   git push -u origin feature/<slug>
   gh pr create --title "<Feature Title>" --body "## Summary
   <work summary>

   ## Changes
   <list of commits>"
   ```

   **If "Just record it":**
   - Skip git operations, just record in Manifest

4. Complete the feature:
   - Call `manifest_complete_feature` with `feature_id`, `summary` (what was built, key decisions, deviations from spec), and `commits` array with commit SHAs and messages
   - Mark as implemented when the PR is _created_, not when it's merged — PR review is about code quality, not feature completeness

5. **Propagate learnings:** If you discovered something during implementation that applies to sibling features, suggest updating the parent feature's details.

6. Display confirmation:
   ```
   Completed: [Title]
   State: in_progress → implemented

   [If merged]: Merged to <base> and pushed.
   [If PR]: Pull request created: <URL>
            Feature marked implemented. PR review is for code quality.
   [If skipped]: Branch feature/<slug> left as-is.

   Recorded [N] commits in history.
   ```