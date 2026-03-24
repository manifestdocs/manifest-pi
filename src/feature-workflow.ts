/**
 * Feature Workflow — Manifest integration for Pi.
 *
 * Registers Manifest tools, slash commands, workflow gates, system prompt
 * context, and plan mode. The agent works directly with all tools — no
 * subprocess dispatch.
 */

import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
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
import { ManifestAuthManager, type AuthStatus } from './auth.js';
import { ManifestClient } from './client.js';
import { lodBreadcrumb, featureWebUrl } from './format.js';
import { registerAllTools } from './tools/index.js';
import { WorkflowState } from './hooks/state.js';
import { registerGates } from './hooks/register.js';
import { createPlanModeController } from './hooks/plan-mode.js';
import {
  isSafeCommand,
  extractTodoItems,
  markCompletedSteps,
  stripDoneMarkers,
  type TodoItem,
} from './hooks/plan-utils.js';
import {
  countSpecCriteria,
  detectEscalation,
  resolveTier,
  type PlanTier,
} from './hooks/tier.js';
import { MANIFEST_CONTEXT } from './generated/content.js';

const PKG_NAME = '@manifestdocs/pi';

/** Replace `{{include:filename.md}}` directives with file contents from skillsDir (max 3 levels deep). */
function resolveIncludes(body: string, skillsDir: string, depth = 0): string {
  if (depth > 3) return body;
  return body.replace(/\{\{include:([^}]+)\}\}/g, (_match, filename: string) => {
    try {
      const content = readFileSync(join(skillsDir, filename.trim()), 'utf-8');
      return resolveIncludes(content, skillsDir, depth + 1);
    } catch {
      return `[missing include: ${filename.trim()}]`;
    }
  });
}

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

function isAssistantMessage(m: {
  role?: string;
  content?: unknown;
}): m is AssistantMessage {
  return m.role === 'assistant' && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function extractToolResultText(event: ToolResultEvent): string {
  return (event.content ?? [])
    .filter((block): block is TextContent => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

const PRD_PATTERNS = [
  'PRD.md', 'prd.md',
  'SPEC.md', 'spec.md',
  'REQUIREMENTS.md', 'requirements.md',
];

const CODE_EXTENSIONS = new Set([
  '.ts', '.js', '.tsx', '.jsx', '.py', '.rs', '.go', '.rb',
  '.java', '.kt', '.cs', '.swift', '.c', '.cpp', '.h',
]);

const SCAFFOLDING_FILES = new Set([
  'package.json', 'tsconfig.json', 'cargo.toml', 'go.mod',
  'pyproject.toml', 'gemfile', '.gitignore', 'readme.md',
  'license', 'license.md', '.editorconfig',
]);

/** Find a PRD/spec file in the given directory. Returns filename or null. */
function findPrdFile(cwd: string): string | null {
  try {
    const files = readdirSync(cwd);
    for (const pattern of PRD_PATTERNS) {
      if (files.includes(pattern)) return pattern;
    }
    return null;
  } catch {
    return null;
  }
}

/** Check if a directory has code beyond scaffolding (config files, package.json, etc.). */
function hasCodeFiles(cwd: string): boolean {
  try {
    const entries = readdirSync(cwd, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name === 'src') return true;
      if (entry.isDirectory() && entry.name === 'lib') return true;
      if (entry.isDirectory() && entry.name === 'app') return true;
      if (entry.isFile()) {
        const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
        if (CODE_EXTENSIONS.has(ext) && !SCAFFOLDING_FILES.has(entry.name.toLowerCase())) {
          return true;
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

const COMMAND_SKILLS: Array<string | { skill: string; command: string }> = [
  'next',
  'features',
  'start',
  'review',
  'complete',
  'init',
  'decompose',
  'activity',
  'versions',
];

function formatAuthStatus(status: AuthStatus): string {
  if (!status.authenticated) {
    return `Manifest auth: not authenticated\nBase URL: ${status.baseUrl}`;
  }

  const lines = [
    `Manifest auth: ${status.source}`,
    `Base URL: ${status.baseUrl}`,
  ];

  if (status.userId) lines.push(`User: ${status.userId}`);
  if (status.orgId) lines.push(`Org: ${status.orgId}`);
  if (status.role) lines.push(`Role: ${status.role}`);
  if (status.permissions.length > 0) lines.push(`Permissions: ${status.permissions.join(', ')}`);
  if (status.expiresAt) lines.push(`Expires: ${status.expiresAt}`);
  if (status.source === 'local-api-key') lines.push('Mode: local dev API key');

  return lines.join('\n');
}

export default async function featureWorkflow(pi: ExtensionAPI): Promise<void> {
  const configuredBaseUrl = process.env.MANIFEST_URL?.trim();
  const port = parseInt(process.env.MANIFEST_PORT ?? '4242', 10);
  const baseUrl = configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : `http://localhost:${port}`;
  const authManager = new ManifestAuthManager({
    baseUrl,
    clientId: process.env.WORKOS_CLIENT_ID,
    accessToken: process.env.MANIFEST_ACCESS_TOKEN,
    apiKey: process.env.MANIFEST_API_KEY,
    storagePath: process.env.MANIFEST_AUTH_PATH,
  });
  const client = new ManifestClient({
    baseUrl,
    getAccessToken: () => authManager.getAccessToken(),
  });
  const workflowState = new WorkflowState();
  const planController = createPlanModeController();
  let yoloMode = false;
  let completionSucceeded = false;
  let decomposeSkillBody: string | null = null;

  const updatePromise = checkForUpdate();

  registerAllTools(pi, client, workflowState);
  registerGates(pi, workflowState, client, planController);

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

    const body = resolveIncludes(parseFrontmatter(skillContent).body, skillsDir);
    if (skillName === 'decompose') decomposeSkillBody = body;
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

  pi.registerCommand('manifest-login', {
    description: 'Authenticate Manifest Cloud access with WorkOS device login',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const status = await authManager.login({
          onPrompt: async (prompt) => {
            if (!ctx.hasUI) return;
            const destination = prompt.verificationUriComplete ?? prompt.verificationUri;
            ctx.ui.notify(
              `Open ${destination} and complete Manifest login${prompt.verificationUriComplete ? '.' : ` with code ${prompt.userCode}.`}`,
              'info',
            );
          },
        });

        if (ctx.hasUI) {
          ctx.ui.notify(formatAuthStatus(status), 'info');
        }
      } catch (error) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            error instanceof Error ? error.message : 'Manifest login failed.',
            'error',
          );
        }
      }
    },
  });

  pi.registerCommand('manifest-logout', {
    description: 'Remove locally stored Manifest Cloud credentials',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      const removed = authManager.logout();
      if (ctx.hasUI) {
        ctx.ui.notify(
          removed
            ? 'Manifest Cloud credentials removed from local storage.'
            : 'No stored Manifest Cloud credentials found.',
          'info',
        );
      }
    },
  });

  pi.registerCommand('manifest-whoami', {
    description: 'Show the current Manifest auth identity and token source',
    handler: async (_args: string, ctx: ExtensionCommandContext) => {
      try {
        const status = await authManager.getStatus();
        if (ctx.hasUI) {
          ctx.ui.notify(formatAuthStatus(status), 'info');
        }
      } catch (error) {
        if (ctx.hasUI) {
          ctx.ui.notify(
            error instanceof Error ? error.message : 'Unable to load Manifest auth status.',
            'error',
          );
        }
      }
    },
  });

  const MANIFEST_WORKING_MESSAGES: Record<string, string> = {
    manifest_start_feature: 'Claiming feature...',
    manifest_decompose: 'Building feature tree...',
    manifest_prove_feature: 'Recording test evidence...',
    manifest_verify_feature: 'Running Critical Reviewer...',
    manifest_record_verification: 'Recording Critical Reviewer result...',
    manifest_complete_feature: 'Completing feature...',
    manifest_render_feature_tree: 'Rendering feature tree...',
    manifest_update_feature: 'Updating feature spec...',
    manifest_find_features: 'Searching features...',
    manifest_get_feature: 'Loading feature...',
    manifest_list_projects: 'Finding project...',
  };

  pi.on('tool_call', async (event: ToolCallEvent, ctx: ExtensionContext) => {
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
  });

  pi.on(
    'tool_execution_end',
    async (_event: unknown, ctx: ExtensionContext) => {
      if (ctx.hasUI) {
        ctx.ui.setWorkingMessage();
      }
    },
  );

  pi.on(
    'tool_result',
    async (event: ToolResultEvent, extCtx: ExtensionContext) => {
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
              const parts = withDetails.map(
                (b) => `### ${b.title}\n${b.details}`,
              );
              workflowState.setAncestorContext(parts.join('\n\n'));
            }
          }
          const url = featureWebUrl(
            client.webUrl,
            ctx.project_slug,
            ctx.display_id,
          );
          if (url && extCtx.hasUI) {
            extCtx.ui.setStatus('feature-url', url);
          }
        } catch {
          // Best effort — ancestor context is supplementary
        }
        return;
      }

      // When assess_plan returns during plan mode, exit plan immediately
      // so the agent can execute without being blocked by read-only restrictions.
      if (
        event.toolName === 'manifest_assess_plan' &&
        planController.getState() === 'plan'
      ) {
        const text = extractToolResultText(event);
        const tierMatch = text.match(/^Plan assessment: (auto|tracked|full)/m);
        if (tierMatch) {
          const tier = tierMatch[1] as PlanTier;
          planController.setResolvedTier(tier);

          // Extract todo items from the plan text in the result
          const extracted = extractTodoItems(text);
          if (extracted.length > 0) {
            planController.setTodoItems(extracted);
          }

          if (tier === 'auto') {
            planController.exit(pi, extCtx);
          } else {
            // tracked or full — enter execute mode with progress tracking
            planController.enterExecute(pi, extCtx);
          }
          persistPlanState();
        }
        return;
      }

      if (event.toolName === 'manifest_complete_feature') {
        if (extCtx.hasUI) {
          extCtx.ui.setStatus('feature-url', undefined);
        }
        if (planController.getState() === 'execute') {
          const todos = planController.getTodoItems();
          for (const todo of todos) {
            todo.completed = true;
          }
          planController.setTodoItems(todos);
          completionSucceeded = true;
          persistPlanState();
        }
      }
    },
  );

  pi.on('context', async (event: ContextEvent) => {
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
  });

  pi.on(
    'before_agent_start',
    async (event: BeforeAgentStartEvent, _ctx: ExtensionContext) => {
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
- You can only use: read, bash, grep, find, ls + manifest read tools
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

      for (const block of event.message.content) {
        if (block.type !== 'text') continue;
        block.text = stripDoneMarkers(block.text);
      }
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
      if (todos.length > 0 && todos.every((t) => t.completed)) {
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
    const tier =
      stepCount === 0
        ? 'full'
        : resolveTier(stepCount, criteriaCount, agentEscalated);
    planController.setResolvedTier(tier);

    if (todos.length > 0) {
      const todoListText = todos
        .map((t, i) => `${i + 1}. ${t.text}`)
        .join('\n');
      ctx.ui.notify(
        `Plan (${todos.length} steps, ${tier}):\n${todoListText}`,
        'info',
      );
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

    const choice = await ctx.ui.select('Implementation plan ready', [
      todos.length > 0 ? 'Implement (track progress)' : 'Implement',
      'Refine the plan',
    ]);

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
      .pop() as
      | {
          data?: { state: string; tier?: string; todos?: TodoItem[] };
        }
      | undefined;

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
              (entry as { message: { role: string; content: unknown } })
                .message,
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

    // Proactive: offer codebase analysis for empty projects
    if (ctx.hasUI && decomposeSkillBody) {
      try {
        const lookup = await client.listProjectsByDirectory(ctx.cwd);
        const projectId = lookup.project?.id ?? lookup.id;
        if (projectId) {
          const tree = await client.getFeatureTree(projectId);
          const isEmpty =
            tree.length === 1 &&
            tree[0].is_root === true &&
            tree[0].children.length === 0;
          if (isEmpty) {
            const prdFile = findPrdFile(ctx.cwd);
            const hasCode = hasCodeFiles(ctx.cwd);

            let action: string | null = null;
            if (prdFile) {
              action = `Decompose ${prdFile} into features`;
            } else if (hasCode) {
              action = 'Analyze codebase and suggest features';
            }

            if (action) {
              const choice = await ctx.ui.select(
                'This project has no features yet',
                [action, 'Skip'],
              );
              if (choice === action) {
                const arg = prdFile ?? '';
                const instructions = decomposeSkillBody.replace(/\$ARGUMENTS/g, arg);
                pi.sendMessage(
                  { customType: 'manifest-skill', content: instructions, display: false },
                  { triggerTurn: true },
                );
              }
            }
          }
        }
      } catch {
        // Best effort -- don't block session startup if API is unreachable
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
