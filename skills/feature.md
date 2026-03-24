---
name: feature
description: Search for a feature and show its details
disable-model-invocation: true
argument-hint: '[search query]'
---

Search for and display feature details.

## Arguments

The user's argument is: `$ARGUMENTS`

If the argument above is not empty, it is a search query to find a feature by title or content.

## Steps

1. Find the feature:

   **If no argument was given:**
   - Tell the user to provide a search query or use `/features` to browse features

   **If a search query argument was given (see Arguments above):**
   - Call `manifest_find_features` with `project_id` and `query` set to the argument
   - If no matches found, tell the user and suggest checking spelling or using `/features`

2. If multiple matches, list them and ask which one:

   ```
   Found N features matching "[query]":
   1. [Title] ([state])
   2. [Title] ([state])

   Which feature would you like to see details for?
   ```

3. Get full feature details:
   - Call `manifest_get_feature` with `feature_id` and `include_history: true`

4. Display the feature:

   ```
   Feature: [Title] ([state])
   Parent: [Parent title if any]
   Priority: [priority]
   Version: [target version if assigned]

   ## Description
   [Feature details]

   ## History
   [List of history entries with dates and summaries]
   ```
