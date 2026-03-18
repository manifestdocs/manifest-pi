---
name: feature
description: Search for a feature and show its details
disable-model-invocation: true
argument-hint: '[search query]'
---

Search for and display feature details.

## Arguments

`$ARGUMENTS` - Search query to find the feature (title or content)

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running — tell the user to start it with `manifest serve`

2. Find the feature:

   **If $ARGUMENTS is blank:**
   - Tell the user to provide a search query or use `/features` to browse features

   **If $ARGUMENTS is provided:**
   - Call `manifest_find_features` with `project_id` and `query` set to `$ARGUMENTS`
   - If no matches found, tell the user and suggest checking spelling or using `/features`

3. If multiple matches, list them and ask which one:

   ```
   Found N features matching "[query]":
   1. [Title] ([state])
   2. [Title] ([state])

   Which feature would you like to see details for?
   ```

4. Get full feature details:
   - Call `manifest_get_feature` with `feature_id` and `include_history: true`

5. Display the feature:

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
