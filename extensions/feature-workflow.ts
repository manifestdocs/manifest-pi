/**
 * Feature Workflow — Manifest integration for Pi.
 *
 * Registers Manifest tools, slash commands, workflow gates, and system prompt
 * context. The agent works directly with all tools — no subprocess dispatch.
 *
 * Usage: pi -e extensions/feature-workflow.ts
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type {
  ExtensionAPI,
  ExtensionContext,
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
} from '@mariozechner/pi-coding-agent';
import { parseFrontmatter } from '@mariozechner/pi-coding-agent';
import { ManifestClient } from '../dist/client.js';
import { registerAllTools } from '../dist/tools/index.js';
import { WorkflowState } from '../dist/hooks/state.js';
import { registerGates } from '../dist/hooks/register.js';

// ── System Prompt Context ────────────────────────

const MANIFEST_CONTEXT = `
## Manifest

Manifest is living documentation for the software you are building. It tracks features -- the capabilities your system provides -- as living documents that evolve with your codebase.

ALWAYS pass \`directory_path\` (current working directory) to project/feature tools.

### Domain terms

- **feature**: a system capability in the tree. Leaf features are workable; parents are feature sets.
- **feature set**: a parent with children. Cannot be started directly -- work on its leaf children.
- **spec**: the details field -- user story + acceptance criteria. Read with manifest_get_feature, write with manifest_update_feature.
- **proof**: recorded test output linked to a feature. Record with manifest_prove_feature.
- **tree**: the full feature structure. Use manifest_render_feature_tree.
- **version / milestone**: a semantic version grouping features. Use manifest_list_versions.

Feature states: proposed, in_progress, implemented, blocked, archived.

### Feature workflow

When implementing a feature, follow this sequence:

1. **SPEC** -- Read the feature with manifest_get_feature. If the spec is missing or thin (no user story, no acceptance criteria), write one with manifest_update_feature before proceeding. A good spec has: "As a [user], I can [capability] so that [benefit]" + checkbox items (- [ ] ...) for testable assertions.

2. **CLAIM** -- Call manifest_start_feature. It validates the spec and returns your specification. After it succeeds, IMMEDIATELY proceed to implementation. Do not stop, summarize, or ask for confirmation.

3. **BUILD** -- The feature details ARE your specification. Check the breadcrumb for parent context. Contract-first: define interfaces from the spec before writing implementation. TDD red-green cycle:
   - Read acceptance criteria -- each checkbox is a test case
   - Write failing tests first
   - Call manifest_prove_feature to record the failure (red)
   - Implement with guard clauses and early returns
   - Call manifest_prove_feature again (green)
   - Iterate until all tests pass
   - Tick off acceptance criteria checkboxes with manifest_update_feature as you go

4. **PROVE** -- Record final test evidence with manifest_prove_feature (must have exit_code 0). Scope your test command to THIS feature only (use -t "pattern", line numbers, or dedicated test files).

5. **DOCUMENT** -- Update the feature spec with manifest_update_feature to reflect what was actually built.

6. **COMPLETE** -- Call manifest_complete_feature with a summary and commit SHAs.

### Spec writing

Every leaf feature spec has:
1. User story: "As a [user], I can [capability] so that [benefit]."
2. Acceptance criteria: checkbox items that can be verified in tests.

Specs are focused: 50-200 words. Never include file paths or implementation approach.

### When NOT to use the feature workflow

- One-off tasks ("update the header", "fix the typo") -- handle directly.
- Bug fixes -- work in a TDD manner without the full workflow.
- Read-only queries ("show the tree", "what's next") -- use Manifest tools directly.

### Output rules

Some tools return pre-formatted text (manifest_render_feature_tree, manifest_get_project_history). Do NOT repeat, summarize, or reformat their output -- the tool result is already displayed to the user.

### Rules

- NEVER call manifest_start_feature on a feature set (has children)
- NEVER change a feature's target version during implementation
- Call manifest_start_feature BEFORE writing any code
- Call manifest_prove_feature BEFORE manifest_complete_feature
`;

// Skills to register as slash commands
const COMMAND_SKILLS: Array<string | { skill: string; command: string }> = [
  'next',
  { skill: 'tree', command: 'features' },
  'start',
  'complete',
  'init',
  'plan',
  'activity',
  'versions',
];

// ── Extension Entry Point ────────────────────────

export default async function featureWorkflow(pi: ExtensionAPI): Promise<void> {
  const port = parseInt(process.env.MANIFEST_PORT ?? '17010', 10);
  const baseUrl = `http://localhost:${port}`;
  const apiKey = process.env.MANIFEST_API_KEY;
  const client = new ManifestClient({ baseUrl, apiKey });
  const workflowState = new WorkflowState();

  // Register all Manifest tools
  registerAllTools(pi, client);
  registerGates(pi, workflowState);

  // ── Slash Commands ───────────────────────────

  const skillsDir = join(import.meta.dirname, '..', 'skills');

  for (const entry of COMMAND_SKILLS) {
    const skillName = typeof entry === 'string' ? entry : entry.skill;
    const commandName = typeof entry === 'string' ? entry : entry.command;
    const skillPath = join(skillsDir, `${skillName}.md`);
    let description: string | undefined;
    let skillContent: string;

    try {
      skillContent = readFileSync(skillPath, 'utf-8');
      const parsed = parseFrontmatter<{ description?: string }>(skillContent);
      description = parsed.frontmatter?.description;
    } catch {
      continue;
    }

    const body = parseFrontmatter(skillContent).body;
    pi.registerCommand(commandName, {
      description,
      handler: async (args: string) => {
        const instructions = body.replace(/\$ARGUMENTS/g, args.trim());
        pi.sendMessage(
          { customType: 'manifest-skill', content: instructions, display: false },
          { triggerTurn: true },
        );
      },
    });
  }

  // ── System Prompt ──────────────────────────

  pi.on(
    'before_agent_start',
    async (
      event: BeforeAgentStartEvent,
      _ctx: ExtensionContext,
    ): Promise<BeforeAgentStartEventResult | void> => {
      return { systemPrompt: event.systemPrompt + MANIFEST_CONTEXT };
    },
  );

  // ── Session Lifecycle ────────────────────────

  pi.on('session_start', async (_event: any, _ctx: ExtensionContext) => {
    workflowState.reset();
  });
}
