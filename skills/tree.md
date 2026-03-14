---
name: tree
description: Display the feature hierarchy for the current project. Use when the user wants to see features, project structure, or asks "what features exist?"
disable-model-invocation: true
---

Display the feature tree for the current project.

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running — tell the user to start it with `manifest serve`

2. Render the feature tree:
   - Call `manifest_render_feature_tree` with the project ID
   - Use default `max_depth` of 3

3. Display the ASCII tree directly in your response with the legend:
   - ◇ proposed
   - ⊘ blocked
   - ○ in_progress
   - ● implemented
   - ✗ archived
