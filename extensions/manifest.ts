/**
 * Manifest extension for Pi coding agent.
 *
 * Registers all Manifest tools pointing at the HTTP API, plus slash
 * commands for key workflow skills. Supports team mode for deterministic
 * feature workflow with specialist agents.
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { ExtensionAPI, ExtensionContext, InputEvent, InputEventResult, BeforeAgentStartEvent, BeforeAgentStartEventResult } from '@mariozechner/pi-coding-agent';
import { parseFrontmatter } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';
import { ManifestClient } from '../dist/client.js';
import { registerAllTools } from '../dist/tools/index.js';
import { WorkflowState } from '../dist/hooks/state.js';
import { registerGates } from '../dist/hooks/register.js';

// Domain glossary injected into the system prompt so the agent understands
// Manifest terminology when users speak in plain English.
const MANIFEST_CONTEXT = `
## Manifest — domain terms

Manifest tracks features (system capabilities) as a hierarchical tree.

- **feature**: a system capability in the tree. Leaf features are workable; parents are feature sets.
- **feature set / feature group**: a parent with children (e.g., "Auth", "Cart Checkout"). Cannot be started directly — work on its leaf children. When a user says "check the X feature set", use manifest_find_features to locate it, then manifest_get_feature on it and its children to inspect states.
- **spec / specification**: the details field — user story + acceptance criteria. Read with manifest_get_feature, write with manifest_update_feature.
- **proof / evidence / test results**: recorded test output linked to a feature. Record with manifest_prove_feature, read with manifest_get_feature_proof.
- **tree / hierarchy**: the full feature structure. Use manifest_render_feature_tree.
- **version / milestone / release**: a semantic version grouping features. Use manifest_list_versions.
- **backlog**: features not assigned to any version.
- **"is X done" / "fully implemented"**: find the feature set, check all children's states, report which are implemented vs. proposed vs. in_progress.
- **"review against spec" / "compare with RFC"**: read the Manifest feature spec AND the referenced document, then compare.

Feature states: ◇ proposed, ○ in_progress, ● implemented, ⊘ blocked, ✗ archived.

When unsure how to call a Manifest API endpoint, fetch the OpenAPI spec at GET /api/v1/openapi.json for the full contract.
`;

const DISPATCHER_PROMPT = `
## Feature Workflow

You orchestrate feature delivery through specialist agents. Do NOT write code directly.

### Phase 1: Spec (dispatch product-manager)
- Fetch feature: manifest_get_feature (check current spec)
- Dispatch product-manager to write/refine spec including contract/API shape
- Check: spec must have user story ("As a...") + acceptance criteria ("- [ ]")
- If missing, dispatch PM again with specific feedback
- Once spec passes, move to implementation

### Phase 2: Implement (dispatch feature-engineer)
- Dispatch feature-engineer with feature ID
- Worker follows TDD: write failing tests (red) > implement > passing tests (green)
- Worker covers happy path + error cases with guard clauses
- Check proof: manifest_get_feature_proof — loop until exit_code 0

### Phase 3: Review (dispatch code-reviewer + product-manager)
- Dispatch code-reviewer to check code quality against coding guidelines
- Dispatch product-manager to review specs vs implementation, update spec if needed
- If gaps found, dispatch feature-engineer to fix, then re-review
- Loop until manifest_record_verification passes (empty comments)

### Phase 4: Complete (dispatch feature-engineer)
- Dispatch feature-engineer to call manifest_complete_feature with summary + commits

Features can be worked on in parallel — dispatch multiple feature-engineers for independent features.
`;

// Agent tool lists — Manifest tools + built-in tools each agent can use
const AGENT_TOOLS: Record<string, string> = {
  'product-manager': 'manifest_get_feature,manifest_update_feature,manifest_find_features,manifest_render_feature_tree,manifest_get_project_instructions,manifest_record_verification,read,grep,find,ls',
  'feature-engineer': 'manifest_start_feature,manifest_get_feature,manifest_update_feature,manifest_prove_feature,manifest_complete_feature,read,write,edit,bash,grep,find,ls',
  'code-reviewer': 'manifest_get_feature,manifest_verify_feature,manifest_record_verification,manifest_get_feature_proof,read,bash,grep,find,ls',
};

// Dispatcher tools — what the orchestrator has access to in team mode
const DISPATCHER_TOOLS = new Set([
  'dispatch_agent',
  'manifest_orient',
  'manifest_render_feature_tree',
  'manifest_find_features',
  'manifest_get_feature',
  'manifest_get_next_feature',
  'manifest_get_active_feature',
  'manifest_get_feature_proof',
  'manifest_list_projects',
]);

// Intent detection patterns
// Patterns that trigger the deterministic team workflow.
// "what's next?" is NOT here — it's a query shortcut for manifest_get_next_feature,
// handled by the agent's tool routing in prompts/manifest.md.
const TEAM_WORKFLOW_PATTERNS = [
  /\b(?:work\s+on|implement|build)\s+(?:feature\s+)?(\S+)/i,
  /\b(?:work\s+on\s+this|implement\s+this)\b/i,
];

// Display IDs like MAN-42 — only trigger team mode when combined with work intent
const DISPLAY_ID_PATTERN = /\b[A-Z]+-\d+\b/;
const WORK_INTENT_PATTERN = /\b(?:work\s+on|implement|build|start)\b/i;

function detectFeatureIntent(message: string): { detected: boolean; featureRef?: string } {
  for (const pattern of TEAM_WORKFLOW_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      const featureRef = match[1] || match[0];
      return { detected: true, featureRef: featureRef.trim() };
    }
  }

  // Display ID only triggers team mode if paired with work intent
  const displayIdMatch = message.match(DISPLAY_ID_PATTERN);
  if (displayIdMatch && WORK_INTENT_PATTERN.test(message)) {
    return { detected: true, featureRef: displayIdMatch[0] };
  }

  return { detected: false };
}

// Skills to register as slash commands (e.g., /next, /tree)
// Commands registered via pi.registerCommand() — these become /name in Pi.
// IMPORTANT: Names must NOT conflict with Pi's built-in slash commands:
//   settings, model, scoped-models, export, share, copy, name, session,
//   changelog, hotkeys, fork, tree, login, logout, new, compact, resume, reload, quit
// The skill file name maps to the command name unless overridden here.
const COMMAND_SKILLS: Array<string | { skill: string; command: string }> = [
  'next', { skill: 'tree', command: 'features' }, 'start', 'complete',
  'init', 'plan', 'activity', 'versions',
];

export default async function manifest(pi: ExtensionAPI): Promise<void> {
  const port = parseInt(process.env.MANIFEST_PORT ?? '17010', 10);
  const baseUrl = `http://localhost:${port}`;
  const apiKey = process.env.MANIFEST_API_KEY;
  const client = new ManifestClient({ baseUrl, apiKey });
  const state = new WorkflowState();

  // Snapshot all tools at startup so we can restore after team mode
  let allToolNames: string[] = [];

  registerAllTools(pi, client);
  registerGates(pi, state);

  // ============================================================
  // Slash commands — register /next, /tree, etc. directly
  // ============================================================

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
      // Skill file missing — skip registration
      continue;
    }

    // Capture skillContent for closure
    const content = skillContent;
    pi.registerCommand(commandName, {
      description,
      handler: async (args: string) => {
        const expanded = content.replace(/\$ARGUMENTS/g, args.trim());
        pi.sendUserMessage(expanded);
      },
    });
  }

  // ============================================================
  // dispatch_agent tool — spawn specialist agent subprocess
  // ============================================================

  pi.registerTool({
    name: 'dispatch_agent',
    description: 'Dispatch a task to a specialist agent (product-manager, feature-engineer, code-reviewer)',
    label: 'Dispatch task to a Manifest specialist agent',
    parameters: Type.Object({
      agent: StringEnum(['product-manager', 'feature-engineer', 'code-reviewer'] as const, {
        description: 'Agent type to dispatch to',
      }),
      task: Type.String({ description: 'Task description for the agent' }),
      feature_id: Type.Optional(Type.String({ description: 'Feature ID — context auto-injected' })),
    }),
    async execute(_id: string, params: any, signal?: AbortSignal) {
      const { agent, task, feature_id } = params as {
        agent: 'product-manager' | 'feature-engineer' | 'code-reviewer';
        task: string;
        feature_id?: string;
      };

      const tools = AGENT_TOOLS[agent];
      if (!tools) {
        return { content: [{ type: 'text' as const, text: `Unknown agent: ${agent}` }] };
      }

      // Build the task with feature context
      let fullTask = task;
      if (feature_id) {
        fullTask = `Feature ID: ${feature_id}\n\n${task}`;
      }

      // Agent prompt file
      const agentPrompt = join(import.meta.dirname, '..', 'agents', `${agent}.md`);

      try {
        const args = [
          '--mode', 'json',
          '-p',
          '--no-extensions',
          '--no-session',
          '--tools', tools,
          '--append-system-prompt', agentPrompt,
          fullTask,
        ];

        const result = await pi.exec('pi', args, { signal });

        if (feature_id) {
          state.setDispatched(feature_id, false);
        }

        if (result.code !== 0) {
          return { content: [{ type: 'text' as const, text: `Agent exited with code ${result.code}: ${result.stderr || result.stdout}` }] };
        }

        return { content: [{ type: 'text' as const, text: result.stdout || 'Agent completed.' }] };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Agent dispatch failed: ${err.message}` }] };
      }
    },
  });

  // ============================================================
  // Intent detection via input event
  // ============================================================

  pi.on('input', async (event: InputEvent, _ctx: ExtensionContext): Promise<InputEventResult | void> => {
    const message = event.text ?? '';
    if (!message) return { action: 'continue' as const };

    const intent = detectFeatureIntent(message);
    if (!intent.detected) return { action: 'continue' as const };

    // Enter team mode — the agent will act as dispatcher
    const featureRef = intent.featureRef;
    if (featureRef) {
      try {
        if (/^[A-Z]+-\d+$/i.test(featureRef) || featureRef.includes('-')) {
          state.enterTeamMode(featureRef);
        }
      } catch {
        // Non-critical — team mode can be entered later
      }
    }

    return { action: 'continue' as const };
  });

  // ============================================================
  // Dynamic tool scoping + system prompt injection
  // ============================================================

  pi.on('before_agent_start', async (event: BeforeAgentStartEvent, _ctx: ExtensionContext): Promise<BeforeAgentStartEventResult | void> => {
    // Snapshot tools on first agent start (tools are registered by then)
    if (allToolNames.length === 0) {
      allToolNames = pi.getAllTools().map((t) => t.name);
    }

    let systemPrompt = event.systemPrompt + MANIFEST_CONTEXT;

    if (state.teamMode) {
      systemPrompt += DISPATCHER_PROMPT;
      pi.setActiveTools([...DISPATCHER_TOOLS]);
      return { systemPrompt };
    }

    return { systemPrompt };
  });

  // ============================================================
  // Restore tools when exiting team mode
  // ============================================================

  pi.on('session_start', async () => {
    state.reset();
    // Restore all tools in case previous session was in team mode
    if (allToolNames.length > 0) {
      pi.setActiveTools(allToolNames);
    }
  });
}
