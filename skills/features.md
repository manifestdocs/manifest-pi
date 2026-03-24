---
name: features
description: Show the project feature tree
disable-model-invocation: true
---

Display the feature tree for the current project.

## Steps

1. Render the feature tree:
   - Call `manifest_render_feature_tree` with the project ID and `max_depth: 3`

2. Display ONLY:
   - The tree output exactly as returned
   - A one-line legend: `◇ proposed  ○ in_progress  ● implemented  ⊘ blocked  ✗ archived`

   No narration before or after. No "Calling...", "Rendering...", "Here is..." messages. The tree speaks for itself.
