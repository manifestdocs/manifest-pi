---
name: tree
description: Show the project feature tree
disable-model-invocation: true
---

Display the feature tree for the current project.

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running -- tell the user to start it with `manifest serve`

2. Render the feature tree:
   - Call `manifest_render_feature_tree` with the project ID and `max_depth: 3`

3. Display the tree output directly -- do NOT repeat or reformat it. The tool already returns formatted ASCII art.

4. After the tree, add a one-line legend:
   `◇ proposed  ○ in_progress  ● implemented  ⊘ blocked  ✗ archived`

## Important

- ALWAYS pass `directory_path` to `manifest_list_projects` for auto-discovery. Never list all projects and ask the user to pick.
- Do NOT echo the tree a second time. The tool result IS the output.
