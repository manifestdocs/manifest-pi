---
name: init
description: Initialize Manifest for the current project. Detects project size and guides setup accordingly.
disable-model-invocation: true
---

Initialize Manifest for a new or existing codebase. Adapts the flow based on project size: greenfield, small/medium, or large/monorepo.

## Steps

### 0. Ensure git is initialized

- Run `git rev-parse --is-inside-work-tree 2>/dev/null` in the current working directory
- If git is NOT initialized:
  - Run `git init`
  - Create a `.gitignore` appropriate for the detected project type (check for package.json, Cargo.toml, pyproject.toml, etc.):
    - Node.js: `node_modules/`, `dist/`, `.env`
    - Python: `__pycache__/`, `*.pyc`, `.venv/`, `.env`
    - Rust: `target/`
    - General: `.DS_Store`, `*.log`
  - Stage and commit: `git add . && git commit -m "Initial commit"`
  - Tell the user: `Initialized git repository with .gitignore for [detected type].`
- If git IS initialized but there are no commits (`git log --oneline -1` fails), create an initial commit:
  - Create `.gitignore` if it doesn't exist (same heuristics as above)
  - Stage and commit: `git add . && git commit -m "Initial commit"`

### 1. Check if already initialized

- Call `manifest_list_projects` with `directory_path` set to the current working directory
- If a project is found, tell the user:
  ```
  This directory is already linked to project "[Name]".
  Use /tree to see features or /plan to add new ones.
  ```
- Exit early if already initialized
- If no project found for this directory, call `manifest_list_projects` (no filter) to check for existing projects
- If existing projects are found, ask:
  ```
  Found existing project(s): [list names]

  Is this directory part of one of these projects (monorepo)?
  1. Yes, add it to [project name]
  2. No, create a new project
  ```
- If the user picks an existing project, call `manifest_add_project_directory` with `project_id` and `path` set to the current working directory, then exit early with:
  ```
  Linked [directory] to project "[Name]".
  Use /tree to see features.
  ```

### 2. Analyze and create project

- Call `manifest_init_project` with `directory_path` set to the current working directory and `skip_default_versions` set to `true`
- This creates the project, links the directory, and returns analysis with size signals
- After project creation, call `manifest_get_project_instructions` with the project ID to get the root feature
- Call `manifest_update_feature` on the root feature to set `details` to coding guidelines adapted from the template below
- **Adapt the guidelines to the project's language and framework.** Keep the same structure and principles, but make examples and conventions language-native. For example:
  - Python: mention type hints, `pytest`, PEP 8, virtual environments
  - Rust: mention ownership, `cargo test`, `clippy`, error handling with `Result`
  - Go: mention `go test`, error returns, `golint`, module structure
  - TypeScript/Node: mention strict mode, `vitest`/`jest`, ESM, type safety
  - Ruby: mention RSpec, Rubocop, gems
- Replace generic advice with idiomatic equivalents (e.g., "guard clauses" stays universal, but "pure functions" might become "value objects" in OOP-heavy languages)
- Append a "Project Details" section with detected specifics (language version, framework, test runner, package manager)

#### Coding guidelines template

```
# AI Code Assistance Guidelines

## Core Principles
* Simplicity First: Generate the most direct solution that meets requirements
* Established Tech: Default to proven technologies unless newer approaches requested
* Explicit Code: Write straightforward code; avoid clever one-liners
* Reason Then Code: Show logic before implementing complex solutions

## Implementation
* Implement Only What's Asked: No extra features or future-proofing unless requested
* Contract-First Development: Define interfaces and contracts (e.g., OpenAPI) before implementation when building integrations
* Start with Happy Path: Handle edge cases later unless security concerns
* Lean Code: Skip retry logic and other complexity unless explicitly needed
* Show Your Work: Explain key decisions and non-obvious choices
* Ask About Backwards Compatibility: Always inquire rather than assume; it can add unnecessary code

## Code Structure
* Limit Nesting: Keep conditionals/loops under 3 layers
* Function Length: 25-30 lines max; break up longer functions
* Favor Pure Functions: Minimize side effects
* Concrete Over Abstract: Avoid abstraction unless it adds real value
* Unix Philosophy: Each function should do one thing well; prefer composition
* Feature-First Organization: Group by functionality, then by type

## Best Practices
* Choose Right Tools: Use built-in features when sufficient; add packages when they save significant time/add real value
* Validate Inputs: Include reasonable validation, especially for user data
* Think Security: Consider security implications even when not mentioned
* Secrets Management: NEVER commit secrets, API keys, or credentials to version control. Use environment variables, secret management systems, or secure vaults. Include .env in .gitignore.
* Early Return: Use guard clauses to reduce complexity
* Project Hygiene: Version via git, branch per feature/fix, maintain centralized and living documentation

## Testing
* Test-Driven Development: Write tests first when requirements are clear. Tests should describe intended behavior and serve as executable documentation.
* Tests as Specifications: Structure tests to clearly articulate what the code should do, not how it does it. New developers should understand functionality by reading tests.
* Test Levels: Use unit tests for domain logic, integration tests for API contracts and component interactions

## Response Approach
* Plan Complex Tasks: Outline approach before implementation
* Ask Questions: Clarify ambiguous requirements
* Incremental Solutions: Break down complex problems
* Offer Alternatives: Present options with trade-offs when appropriate
```

### 3. Classify project size

From the analysis response, classify the project:

- **GREENFIELD**: `commit_count == 0` OR `file_count < 10`
- **LARGE**: `commit_count > 500` OR `modules` array length > 50 OR `has_subprojects == true`
- **SMALL/MEDIUM**: everything else

### 4. Branch by classification

#### GREENFIELD path

Tell the user:
```
This is a new project. Let's set up your roadmap.
```

- Ask version naming (see Version Naming section below)
- Create 3 versions in order:
  1. `[user input]` - "Now" (current focus)
  2. `[next version]` - "Next"
  3. `Backlog` - "Later"
- Display summary, then:
  ```
  Want to plan features? Run /plan
  ```

#### SMALL/MEDIUM path

Tell the user:
```
Detected [language] project with [N] modules and [N] commits.
```

- Ask: is this a new or existing codebase?
  ```
  Is this:
  1. A new project (starting fresh)
  2. An existing codebase (has features already built)
  ```

- Ask version naming (see below)
- **For new projects (3 versions):**
  1. `[user input]` - "Now" (current focus)
  2. `[next version]` - "Next"
  3. `Backlog` - "Later"
- **For existing codebases (4 versions):**
  - Ask: "What version represents the features already built?" (suggest: `v0.0.x` or `Shipped`)
  - Create versions in order:
    1. `[existing version]` - released immediately
    2. `[user input]` - "Now"
    3. `[next version]` - "Next"
    4. `Backlog` - "Later"
- Display summary, then:
  ```
  Want to plan? I can analyze your codebase. Run /plan
  ```

#### LARGE path

Tell the user:
```
This is a sizable project ([N] commits, [N] modules).
```

**If `has_subprojects` is true:**

Show the detected subprojects and ask how to organize:
```
Detected subprojects:
  1. [subproject_paths[0]] ([language/framework])
  2. [subproject_paths[1]] ([language/framework])
  ...

How would you like to organize this?
A) Separate projects per module
   Each gets its own feature tree and versions.
   Best for: independent teams, separate deploy cycles.
B) One project with module grouping
   Single feature tree with top-level features per module.
   Best for: tightly coupled modules, single release cycle.
C) Choose specific modules to track
```

- **Option A**: For each selected subproject, call `manifest_init_project` with `directory_path` set to that subproject's absolute path and `skip_default_versions` set to `true`. Then create versions for each.
- **Option B**: Keep the single project already created. Call `manifest_add_project_directory` for each subproject path.
- **Option C**: Present the list, let user select, then proceed with A or B for selected modules.

**If NOT `has_subprojects` (just large):**

```
For the initial analysis, I recommend focusing on recent activity rather than the full history.

How far back should I look?
- "6 months" (recent work)
- A git tag like "v2.0" (since a release)
- "all" (full history)
```

Store the user's answer as `since` scope for the plan skill.

- Ask version naming + create versions (same as small/medium existing path)
- Display summary with scoping info

### 5. Display summary

```
Project initialized: [Name]

Versions created:
[If existing]: -- [existing] (released) - for existing features
* [now] (Now) - current focus
  [next] (Next) - up next
  Backlog (Later) - future ideas

Next steps:
- /plan to design your feature tree
- /tree to see what exists
```

### 6. Handoff to plan

End with:
```
Want me to help plan features now? Run /plan
```

Output scoping context as structured text that the plan skill can reference:
```
Initialization context:
- Classification: [greenfield/small_medium/large]
- Since: [git ref or null]
- Focused directories: [paths or null]
```

## Version Naming

Before asking the user, try to detect the current version:
- Check git tags: run `git tag --sort=-v:refname` and look for semver patterns (v1.2.3, 1.2.3)
- Check package manifests: `version` field in Cargo.toml, package.json, pyproject.toml, etc.
  (the analysis response may include this in `name`/`description` or project metadata)

If a version is detected, suggest it:
```
It looks like you're on [detected version].
What version are you working toward next? (e.g., [next increment])
```

If no version is detected, ask from scratch:
```
What version are you working toward?

Examples:
- "0.1.0" or "v0.1.0" (semantic versioning)
- "1.0" (simple numbering)
- "MVP" or "Beta" (milestone names)

This will be your "Now" version - the current focus.
```

When creating the "Next" version, apply these heuristics:

- `0.1.0` -> `0.2.0`
- `1.0` -> `1.1`
- `v1` -> `v2`
- `MVP` -> `Post-MVP`
- `Beta` -> `v1.0`
- If unsure, ask the user

## Notes

- The first unreleased version becomes "Now" (current focus)
- The second unreleased version becomes "Next"
- Order matters: create versions in chronological order
- For existing codebases, the "existing features" version should be released immediately so it doesn't show as "Now"
- Use `skip_default_versions: true` when calling `manifest_init_project` so the skill controls version creation
