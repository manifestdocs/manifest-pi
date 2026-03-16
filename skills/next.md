---
name: next
description: Show the next feature to work on
disable-model-invocation: true
---

Show the next feature to work on.

## Steps

1. Get the project for the current working directory:
   - Call `manifest_list_projects` with `directory_path` set to the current working directory
   - If no project found, tell the user to run `/init` first
   - If an MCP connection error occurs, the server is not running — tell the user to start it with `manifest serve`

2. Get the next workable feature:
   - Call `manifest_get_next_feature` with the project ID

3. Display the result:

If a feature is found, show:

```
Next up: [Title] ([state])
Parent: [Parent title if any]
Priority: [priority number]
Spec: [spec_status from response]

[Feature details/description]

Ready to start? Use /start to begin work.
```

If the response includes `spec_guidance`, show it as a note:

```
Note: [spec_guidance text]
```

If no feature is found:

```
No workable features found.

All features are either implemented or there are no features yet.
Use /tree to see the current state.
```
