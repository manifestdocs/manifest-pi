1. **Locate the test runner** -- check project config (package.json scripts, Makefile, Cargo.toml, pyproject.toml, Gemfile) to identify the test framework and run command.
2. **Find test files** -- search for files matching common conventions:
   - `*.test.ts`, `*.spec.ts`, `*.test.js`, `*.spec.js` (JS/TS)
   - `*_test.go` (Go)
   - `test_*.py`, `*_test.py` (Python)
   - `*_spec.rb` (Ruby)
   - `*_test.rs`, `tests/*.rs` (Rust)
   - `*Test.java`, `*Spec.java` (Java)
3. **Run the test suite** with verbose output so individual test names are visible:
   - `vitest run --reporter=verbose` or `jest --verbose`
   - `pytest -v`
   - `go test -v ./...`
   - `rspec --format documentation`
   - `cargo test -- --nocapture`
   - Run once for the whole project rather than per-feature.
4. **Map tests to features** -- match test files and suite names to features using file paths, import statements, and test descriptions. A test file may cover multiple features; a feature may have tests in multiple files.
5. **Record proof** -- for each implemented feature with matching tests, call `manifest_prove_feature` with:
   - `command`: the test command run
   - `exit_code`: the process exit code
   - `test_suites`: structured results with individual test entries parsed from verbose output
   - `evidence`: file paths of the covering test files
   - `commit_sha`: current HEAD (`git rev-parse HEAD`)
   Filter results per feature -- each prove call should only include tests relevant to that feature.
6. **Skip gracefully** if no test files or runner are found. Record failing tests too -- they document existing coverage.
