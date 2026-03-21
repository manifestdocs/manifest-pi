### Phase 5: CRITICAL REVIEW

1. Check proof status:
   - Call `manifest_get_feature_proof`
   - If there is no passing proof, run the test suite and call `manifest_prove_feature` — must have exit_code 0 before continuing

2. Run the Critical Reviewer:
   - Call `manifest_verify_feature` for the feature
   - This is a findings-only pass — do not edit code during the review itself
   - Review the spec, proof, and implementation diff with an adversarial mindset:
     - Realistic failure modes
     - Missing unhappy-path tests
     - Persistence and input boundaries
     - Async state transitions
     - Config/runtime-mode branches
     - Spec mismatches
     - Sibling integration when clearly relevant
   - Prefer real defects and missing coverage over style opinions
   - If uncertain, bias toward concrete, reproducible findings only

3. Record the result:
   - If there are no findings, call `manifest_record_verification` with `comments: []`
   - If there are findings, call `manifest_record_verification` with concrete comments including:
     - `title`
     - `severity` (`critical`, `major`, or `minor`)
     - `body`
     - `file` when known

4. **If findings were recorded:** return to BUILD — fix the issues, re-prove with `manifest_prove_feature` (must pass), and re-run the Critical Reviewer. Repeat until clean.

{{include:_document-to-complete.md}}