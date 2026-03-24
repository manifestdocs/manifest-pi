---
name: next
description: Show the next feature to work on
disable-model-invocation: true
---

Show the next feature to work on.

## Steps

1. Get the next workable feature:
   - Call `manifest_get_next_feature` with the project ID

2. Display the result:

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

If the response mentions features "still in progress" or "Ready to complete":
- These are in-progress features blocking the queue
- For features marked "Ready to complete" (passing proofs): call `manifest_complete_feature` with a summary and commit SHAs, then call `manifest_get_next_feature` again
- For features marked "Still needs work": tell the user which features are stalled and need attention before new work can start

If no feature is found:

```
No workable features found.

All features are either implemented or there are no features yet.
Use /features to see the current state.
```
