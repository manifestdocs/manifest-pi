/**
 * Feature Workflow — Manifest integration for Pi.
 *
 * Registers Manifest tools, slash commands, workflow gates, system prompt
 * context, and plan mode. The agent works directly with all tools — no
 * subprocess dispatch.
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import type { AssistantMessage, TextContent } from '@mariozechner/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionCommandContext,
  BeforeAgentStartEvent,
  AgentEndEvent,
  TurnEndEvent,
  ToolCallEvent,
  ToolResultEvent,
  ContextEvent,
} from '@mariozechner/pi-coding-agent';
import { parseFrontmatter } from '@mariozechner/pi-coding-agent';
import { ManifestClient } from './client.js';
import { lodBreadcrumb } from './format.js';
import { registerAllTools } from './tools/index.js';
import { WorkflowState } from './hooks/state.js';
import { registerGates } from './hooks/register.js';
import { createPlanModeController } from './hooks/plan-mode.js';
import {
  isSafeCommand,
  extractTodoItems,
  markCompletedSteps,
  type TodoItem,
} from './hooks/plan-utils.js';
import {
  countSpecCriteria,
  detectEscalation,
  resolveTier,
  type PlanTier,
} from './hooks/tier.js';

const PKG_NAME = '@manifestdocs/pi';

function getCurrentVersion(): string {
  try {
    const pkgPath = join(import.meta.dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function checkForUpdate(): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PKG_NAME}/latest`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { version?: string };
    const latest = data.version;
    if (latest && latest !== getCurrentVersion()) return latest;
    return null;
  } catch {
    return null;
  }
}

function isAssistantMessage(
  m: { role?: string; content?: unknown },
): m is AssistantMessage {
  return m.role === 'assistant' && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

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

2. **CLAIM** -- Call manifest_start_feature. It validates the spec and returns your specification. After it succeeds, you will enter plan mode automatically. Explore the codebase and produce a numbered implementation plan.

3. **PLAN** -- You are now in read-only plan mode. Use read, bash, grep, find, ls + manifest read tools to understand the codebase. Produce a numbered plan under a "Plan:" header. If investigation reveals significant hidden complexity (cross-module changes, DB migrations, new architectural patterns), include [COMPLEX] on a line by itself to flag it. Do NOT attempt to write or edit files.

4. **BUILD** -- After the user approves your plan, write tools unlock. The feature details ARE your specification. Check the breadcrumb for parent context. Contract-first: define interfaces from the spec before writing implementation. TDD red-green cycle:
   - Read acceptance criteria -- each checkbox is a test case
   - Write failing tests first
   - Call manifest_prove_feature to record the failure (red)
   - Implement with guard clauses and early returns
   - Call manifest_prove_feature again (green)
   - Iterate until all tests pass
   - Mark completed steps with [DONE:n] tags
   - Tick off acceptance criteria checkboxes with manifest_update_feature as you go

5. **PROVE** -- Record final test evidence with manifest_prove_feature (must have exit_code 0). Scope your test command to THIS feature only (use -t "pattern", line numbers, or dedicated test files).

6. **DOCUMENT** -- Update the feature spec with manifest_update_feature to reflect what was actually built.

7. **COMPLETE** -- IMMEDIATELY call manifest_complete_feature with a summary and commit SHAs. Do NOT ask permission or wait for confirmation -- if proof passed, complete the feature. Get commit SHAs from \`git log --oneline -5\`. After completing, briefly explain what you built and why it improves the project.

### Spec writing

Every leaf feature spec has:
1. User story: "As a [user], I can [capability] so that [benefit]."
2. Acceptance criteria: checkbox items that can be verified in tests.

Specs are focused: 50 to 500 words. The feature's parent nodes and the root node have system and feature set technical details. You can add feature specific technical details as needed.

### When NOT to use the feature workflow

- One-off tasks ("update the header", "fix the typo") -- handle directly.
- Bug fixes -- work in a TDD manner without the full workflow.
- Read-only queries ("show the tree", "what's next") -- use Manifest tools directly.

### Output rules

Some tools return pre-formatted text (manifest_render_feature_tree, manifest_get_project_history). Do NOT repeat, summarize, or reformat their output -- the tool result is already displayed to the user.

### Rules

- NEVER call manifest_start_feature on a feature set (has children)
- NEVER change a feature's target version during implementation
- NEVER ask permission to complete a feature -- if proof passed, complete it immediately
- Call manifest_start_feature BEFORE writing any code
- Call manifest_prove_feature BEFORE manifest_complete_feature
- The full workflow (CLAIM through COMPLETE) runs autonomously in one session -- do not stop partway
`;

const COMMAND_SKILLS: Array<string | { skill: string; command: string }> = [
  'next',
  'features',
  'start',
  'complete',
  'init',
  'decompose',
  'activity',
  'versions',
];

export default async function featureWorkflow(pi: ExtensionAPI): Promise<void> {
  const port = parseInt(process.env.MANIFEST_PORT ?? '4242', 10);
  const baseUrl = `http://localhost:${port}`;
  const apiKey = process.env.MANIFEST_API_KEY;
  const client = new ManifestClient({ baseUrl, apiKey });
  const workflowState = new WorkflowState();
  const planController = createPlanModeController();
  let yoloMode = false;
  let completionSucceeded = false;

  const updatePromise = checkForUpdate();

  registerAllTools(pi, client);
  registerGates(pi, workflowState, planController);

  pi.registerFlag('plan', {
    description: 'Start in plan mode (read-only exploration)',
    type: 'boolean',
    default: false,
  });

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
          {
            customType: 'manifest-skill',
            content: instructions,
            display: false,
          },
          { triggerTurn: true },
        );
      },
    });
  }

  function togglePlanMode(ctx: ExtensionContext): void {
    completionSucceeded = false;
    if (planController.getState() === 'normal') {
      planController.enter(pi, ctx);
      if (ctx.hasUI) {
        ctx.ui.notify(
          'Plan mode enabled -- read-only tools only. Use /plan to exit.',
        );
      }
    } else {
      planController.exit(pi, ctx);
      if (ctx.hasUI) {
        ctx.ui.notify('Plan mode disabled -- full tool access restored.');
      }
    }
  }

  pi.registerCommand('plan', {
    description: 'Toggle read-only plan mode',
    handler: async (_args: string, ctx: ExtensionCommandContext) =>
      togglePlanMode(ctx),
  });

  pi.registerCommand('todos', {
    description: 'Show plan step progress',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const todos = planController.getTodoItems();
      if (todos.length === 0) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            'No plan steps. Enter plan mode with /plan first.',
            'info',
          );
        }
        return;
      }
      const list = todos
        .map(
          (item, i) =>
            `${i + 1}. ${item.completed ? '[x]' : '[ ]'} ${item.text}`,
        )
        .join('\n');
      if (ctx.hasUI) {
        ctx.ui.notify(`Plan Progress:\n${list}`, 'info');
      }
    },
  });

  pi.registerShortcut('ctrl+alt+p', {
    description: 'Toggle read-only plan mode',
    handler: async (ctx: ExtensionContext) => togglePlanMode(ctx),
  });

  pi.registerCommand('yolo', {
    description: 'Toggle autonomous mode (no plan approval)',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      yoloMode = !yoloMode;
      if (ctx.hasUI) {
        ctx.ui.notify(
          yoloMode
            ? 'YOLO mode on -- agent will implement plans without approval.'
            : 'YOLO mode off -- agent will pause for plan approval.',
        );
      }
    },
  });

  const MANIFEST_WORKING_MESSAGES: Record<string, string> = {
    manifest_start_feature: 'Claiming feature...',
    manifest_decompose: 'Building feature tree...',
    manifest_prove_feature: 'Recording test evidence...',
    manifest_complete_feature: 'Completing feature...',
    manifest_render_feature_tree: 'Rendering feature tree...',
    manifest_update_feature: 'Updating feature spec...',
    manifest_find_features: 'Searching features...',
    manifest_get_feature: 'Loading feature...',
    manifest_list_projects: 'Finding project...',
  };

  pi.on(
    'tool_call',
    async (
      event: ToolCallEvent,
      ctx: ExtensionContext,
    ) => {
      if (event.toolName.startsWith('manifest_') && ctx.hasUI) {
        const msg =
          MANIFEST_WORKING_MESSAGES[event.toolName] ?? 'Updating Manifest...';
        ctx.ui.setWorkingMessage(msg);
      }

      if (planController.getState() !== 'plan' || event.toolName !== 'bash') {
        return;
      }

      const command = (event.input as { command?: string }).command ?? '';
      if (!isSafeCommand(command)) {
        return {
          block: true,
          reason: `Plan mode: command blocked (not in read-only allowlist). Use /plan to exit plan mode first.\nCommand: ${command}`,
        };
      }
    },
  );

  pi.on('tool_execution_end', async (_event: unknown, ctx: ExtensionContext) => {
    if (ctx.hasUI) {
      ctx.ui.setWorkingMessage();
    }
  });

  pi.on('tool_result', async (event: ToolResultEvent, _ctx: ExtensionContext) => {
    if (event.isError) return;

    if (event.toolName === 'manifest_start_feature') {
      completionSucceeded = false;
      const featureId = (event.input as { feature_id?: string }).feature_id;
      if (!featureId) return;

      try {
        const ctx = await client.getFeatureContext(featureId);
        if (ctx.breadcrumb?.length > 0) {
          const budgeted = lodBreadcrumb(ctx.breadcrumb);
          const withDetails = budgeted.filter((b) => b.details);
          if (withDetails.length > 0) {
            const parts = withDetails.map((b) => `### ${b.title}\n${b.details}`);
            workflowState.setAncestorContext(parts.join('\n\n'));
          }
        }
      } catch {
        // Best effort — ancestor context is supplementary
      }
      return;
    }

    if (
      event.toolName === 'manifest_complete_feature' &&
      planController.getState() === 'execute'
    ) {
      const todos = planController.getTodoItems();
      for (const todo of todos) {
        todo.completed = true;
      }
      planController.setTodoItems(todos);
      completionSucceeded = true;
      persistPlanState();
    }
  });

  pi.on(
    'context',
    async (event: ContextEvent) => {
      if (planController.getState() !== 'normal') return;

      return {
        messages: event.messages.filter((m) => {
          const msg = m as {
            role: string;
            content: unknown;
            customType?: string;
          };
          if (msg.customType === 'plan-mode-context') return false;
          if (msg.customType === 'plan-execution-context') return false;
          if (msg.role !== 'user') return true;

          const content = msg.content;
          if (typeof content === 'string') {
            return !content.includes('[PLAN MODE ACTIVE]');
          }
          if (Array.isArray(content)) {
            return !content.some(
              (c) =>
                c.type === 'text' &&
                (c as TextContent).text?.includes('[PLAN MODE ACTIVE]'),
            );
          }
          return true;
        }),
      };
    },
  );

  pi.on(
    'before_agent_start',
    async (
      event: BeforeAgentStartEvent,
      _ctx: ExtensionContext,
    ) => {
      let systemPrompt = event.systemPrompt + MANIFEST_CONTEXT;

      const ancestor = workflowState.ancestorContext;
      if (ancestor) {
        systemPrompt += `\n\n## Ancestor Context (from parent/root features)\n\n${ancestor}`;
      }

      const state = planController.getState();

      if (state === 'plan') {
        return {
          systemPrompt,
          message: {
            customType: 'plan-mode-context',
            content: `[PLAN MODE ACTIVE]
You are in plan mode -- a read-only exploration phase before implementation.

Restrictions:
- You can only use: read, bash, grep, find, ls, questionnaire + manifest read tools
- You CANNOT use: edit, write, or manifest write tools (modifications are disabled)
- Bash is restricted to an allowlist of read-only commands

Your goal: explore the codebase to understand what exists, then produce a numbered implementation plan.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

If investigation reveals significant hidden complexity (cross-module changes, DB migrations, new architectural patterns), include [COMPLEX] on a line by itself to flag it.

Do NOT attempt to make changes -- just describe what you would do.`,
            display: false,
          },
        };
      }

      if (state === 'execute') {
        const todos = planController.getTodoItems();
        const remaining = todos.filter((t) => !t.completed);
        if (remaining.length > 0) {
          const todoList = remaining
            .map((t) => `${t.step}. ${t.text}`)
            .join('\n');
          return {
            systemPrompt,
            message: {
              customType: 'plan-execution-context',
              content: `[EXECUTING PLAN -- Full tool access enabled]

Remaining steps:
${todoList}

CRITICAL: After completing each step, you MUST write [DONE:n] on its own line (e.g., [DONE:1], [DONE:2]). This is how progress is tracked -- if you skip it, the step appears incomplete.

Also: when acceptance criteria checkboxes exist in the feature spec, tick them off by calling manifest_update_feature with the updated details (change \`- [ ]\` to \`- [x]\`) as you complete each criterion. Do not just claim they are done -- actually update the spec.

Work through ALL remaining steps autonomously without stopping. Do not pause between steps or ask for confirmation -- the user already approved this plan. Only stop if you hit an unexpected blocker that requires clarification.`,
              display: false,
            },
          };
        }
      }

      return { systemPrompt };
    },
  );

  pi.on('turn_end', async (event: TurnEndEvent, ctx: ExtensionContext) => {
    if (planController.getState() !== 'execute') return;
    const todos = planController.getTodoItems();
    if (todos.length === 0) return;
    if (!isAssistantMessage(event.message)) return;

    const text = getTextContent(event.message);
    if (markCompletedSteps(text, todos) > 0) {
      planController.setTodoItems(todos);
      planController.refreshDisplay(ctx);
      persistPlanState();
    }
  });

  function startExecution(
    todos: ReturnType<typeof planController.getTodoItems>,
    ctx: ExtensionContext,
  ): void {
    completionSucceeded = false;
    planController.enterExecute(pi, ctx);
    persistPlanState();

    const execMessage =
      todos.length > 0
        ? `Execute the plan. Start with: ${todos[0].text}`
        : 'Execute the plan you just created.';
    pi.sendMessage(
      {
        customType: 'plan-mode-execute',
        content: execMessage,
        display: true,
      },
      { triggerTurn: true },
    );
  }

  pi.on('agent_end', async (event: AgentEndEvent, ctx: ExtensionContext) => {
    if (planController.getState() === 'execute') {
      const todos = planController.getTodoItems();
      if (
        completionSucceeded &&
        todos.length > 0 &&
        todos.every((t) => t.completed)
      ) {
        const completedList = todos.map((t) => `~~${t.text}~~`).join('\n');
        pi.sendMessage(
          {
            customType: 'plan-complete',
            content: `Plan complete.\n\n${completedList}`,
            display: true,
          },
          { triggerTurn: false },
        );
        completionSucceeded = false;
        planController.exit(pi, ctx);
        persistPlanState();
      }
      return;
    }

    if (planController.getState() !== 'plan' || !ctx.hasUI) return;

    const lastAssistant = [...event.messages]
      .reverse()
      .find(isAssistantMessage);
    if (lastAssistant) {
      const extracted = extractTodoItems(getTextContent(lastAssistant));
      if (extracted.length > 0) {
        planController.setTodoItems(extracted);
      }
    }

    const todos = planController.getTodoItems();
    const criteriaCount = countSpecCriteria(workflowState.activeFeatureDetails);
    const agentEscalated = lastAssistant
      ? detectEscalation(getTextContent(lastAssistant))
      : false;
    const stepCount = todos.length;
    const tier = stepCount === 0
      ? 'full'
      : resolveTier(stepCount, criteriaCount, agentEscalated);
    planController.setResolvedTier(tier);

    if (todos.length > 0) {
      const todoListText = todos
        .map((t, i) => `${i + 1}. ${t.text}`)
        .join('\n');
      ctx.ui.notify(`Plan (${todos.length} steps, ${tier}):\n${todoListText}`, 'info');
    }

    if (yoloMode) {
      startExecution(todos, ctx);
      return;
    }

    if (tier === 'auto') {
      completionSucceeded = false;
      planController.exit(pi, ctx);
      pi.sendMessage(
        {
          customType: 'plan-mode-execute',
          content: 'Execute your plan.',
          display: true,
        },
        { triggerTurn: true },
      );
      return;
    }

    if (tier === 'tracked') {
      startExecution(todos, ctx);
      return;
    }

    const choice = await ctx.ui.select(
      'Implementation plan ready',
      [
        todos.length > 0 ? 'Implement (track progress)' : 'Implement',
        'Refine the plan',
      ],
    );

    if (choice?.startsWith('Implement')) {
      startExecution(todos, ctx);
    } else if (choice === 'Refine the plan') {
      const refinement = await ctx.ui.editor('Refine the plan:', '');
      if (refinement?.trim()) {
        pi.sendUserMessage(refinement.trim());
      }
    }
  });

  pi.on('session_start', async (_event: unknown, ctx: ExtensionContext) => {
    workflowState.reset();
    completionSucceeded = false;

    const newVersion = await updatePromise;
    if (newVersion && ctx.hasUI) {
      const current = getCurrentVersion();
      ctx.ui.notify(
        `Manifest extension update: ${current} -> ${newVersion}\nRun: pi install ${PKG_NAME}`,
        'info',
      );
    }

    if (pi.getFlag('plan') === true) {
      planController.enter(pi, ctx);
    }

    const entries = ctx.sessionManager.getEntries();
    const planModeEntry = entries
      .filter(
        (e: { type: string; customType?: string }) =>
          e.type === 'custom' && e.customType === 'plan-mode',
      )
      .pop() as {
        data?: { state: string; tier?: string; todos?: TodoItem[] };
      } | undefined;

    if (planModeEntry?.data) {
      const savedState = planModeEntry.data.state;
      const savedTier = planModeEntry.data.tier as PlanTier | undefined;
      const savedTodos = planModeEntry.data.todos ?? [];

      if (savedState === 'plan') {
        planController.enter(pi, ctx);
      } else if (savedState === 'execute' && savedTodos.length > 0) {
        planController.setTodoItems(savedTodos);
        if (savedTier) planController.setResolvedTier(savedTier);
        planController.enterExecute(pi, ctx);

        let executeIndex = -1;
        for (let i = entries.length - 1; i >= 0; i--) {
          const entry = entries[i] as { type: string; customType?: string };
          if (entry.customType === 'plan-mode-execute') {
            executeIndex = i;
            break;
          }
        }

        const messages: AssistantMessage[] = [];
        for (let i = executeIndex + 1; i < entries.length; i++) {
          const entry = entries[i];
          if (
            entry.type === 'message' &&
            'message' in entry &&
            isAssistantMessage(
              (entry as { message: { role: string; content: unknown } }).message,
            )
          ) {
            messages.push((entry as { message: AssistantMessage }).message);
          }
        }
        if (messages.length > 0) {
          const allText = messages.map(getTextContent).join('\n');
          markCompletedSteps(allText, planController.getTodoItems());
        }
      }
    }
  });

  function persistPlanState(): void {
    pi.appendEntry('plan-mode', {
      state: planController.getState(),
      tier: planController.getResolvedTier(),
      todos: planController.getTodoItems(),
    });
  }
}
