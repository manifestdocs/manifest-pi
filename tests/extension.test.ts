import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PI_BUILTIN_COMMANDS = new Set([
  'settings', 'model', 'scoped-models', 'export', 'share', 'copy', 'name',
  'session', 'changelog', 'hotkeys', 'fork', 'tree', 'login', 'logout',
  'new', 'compact', 'resume', 'reload', 'quit',
]);

interface RegisteredCommand {
  name: string;
  description?: string;
  handler: (args: string, ctx: MockCommandContext) => Promise<void>;
}

interface RegisteredTool {
  name: string;
  description: string;
  parameters: unknown;
  execute: (...args: any[]) => any;
}

interface RegisteredFlag {
  name: string;
  options: { description: string; type: string; default?: unknown };
}

interface RegisteredShortcut {
  shortcut: unknown;
  description?: string;
  handler: (ctx: MockContext) => Promise<void>;
}

interface EventHandler {
  event: string;
  handler: (...args: any[]) => any;
}

interface MockUI {
  notify: ReturnType<typeof vi.fn>;
  setStatus: ReturnType<typeof vi.fn>;
  setWidget: ReturnType<typeof vi.fn>;
  setWorkingMessage: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  editor: ReturnType<typeof vi.fn>;
  theme: {
    fg: (token: string, value: string) => string;
    strikethrough: (value: string) => string;
  };
}

interface MockContext {
  ui: MockUI;
  hasUI: boolean;
  cwd: string;
  sessionManager: {
    getEntries: () => any[];
  };
  modelRegistry: Record<string, never>;
  model: undefined;
  isIdle: () => boolean;
  abort: () => void;
  hasPendingMessages: () => boolean;
  shutdown: () => void;
  getContextUsage: () => undefined;
  compact: () => void;
  getSystemPrompt: () => string;
}

interface MockCommandContext extends MockContext {
  waitForIdle: () => Promise<void>;
  newSession: () => Promise<{ cancelled: boolean }>;
  fork: () => Promise<{ cancelled: boolean }>;
  navigateTree: () => Promise<{ cancelled: boolean }>;
  switchSession: () => Promise<{ cancelled: boolean }>;
  reload: () => Promise<void>;
}

function createUi(): MockUI {
  return {
    notify: vi.fn(),
    setStatus: vi.fn(),
    setWidget: vi.fn(),
    setWorkingMessage: vi.fn(),
    select: vi.fn(async () => 'Implement (track progress)'),
    editor: vi.fn(async () => ''),
    theme: {
      fg: (_token: string, value: string) => value,
      strikethrough: (value: string) => value,
    },
  };
}

function createContext(overrides?: Partial<MockContext>): MockContext {
  return {
    ui: createUi(),
    hasUI: true,
    cwd: '/tmp/project',
    sessionManager: {
      getEntries: () => [],
    },
    modelRegistry: {},
    model: undefined,
    isIdle: () => true,
    abort: () => {},
    hasPendingMessages: () => false,
    shutdown: () => {},
    getContextUsage: () => undefined,
    compact: () => {},
    getSystemPrompt: () => 'base-system-prompt',
    ...overrides,
  };
}

function createCommandContext(overrides?: Partial<MockCommandContext>): MockCommandContext {
  const base = createContext(overrides);
  return {
    ...base,
    waitForIdle: async () => {},
    newSession: async () => ({ cancelled: false }),
    fork: async () => ({ cancelled: false }),
    navigateTree: async () => ({ cancelled: false }),
    switchSession: async () => ({ cancelled: false }),
    reload: async () => {},
    ...overrides,
  };
}

function createMockPi() {
  const commands: RegisteredCommand[] = [];
  const tools: RegisteredTool[] = [];
  const flags: RegisteredFlag[] = [];
  const shortcuts: RegisteredShortcut[] = [];
  const eventHandlers: EventHandler[] = [];
  const activeTools: string[] = [];
  const sentMessages: Array<{ message: any; options: any }> = [];
  const appendedEntries: Array<{ customType: string; data: any }> = [];
  const flagValues = new Map<string, unknown>();

  const api = {
    registerCommand: vi.fn((name: string, options: any) => {
      commands.push({ name, ...options });
    }),
    registerTool: vi.fn((tool: any) => {
      tools.push(tool);
    }),
    registerFlag: vi.fn((name: string, options: any) => {
      flags.push({ name, options });
      if (!flagValues.has(name)) {
        flagValues.set(name, options.default);
      }
    }),
    getFlag: vi.fn((name: string) => flagValues.get(name)),
    registerShortcut: vi.fn((shortcut: unknown, options: any) => {
      shortcuts.push({ shortcut, ...options });
    }),
    on: vi.fn((event: string, handler: any) => {
      eventHandlers.push({ event, handler });
    }),
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn((message: any, options: any) => {
      sentMessages.push({ message, options });
    }),
    appendEntry: vi.fn((customType: string, data: any) => {
      appendedEntries.push({ customType, data });
    }),
    getAllTools: vi.fn(() =>
      tools.map((t) => ({ name: t.name, description: t.description })),
    ),
    setActiveTools: vi.fn((names: string[]) => {
      activeTools.length = 0;
      activeTools.push(...names);
    }),
    getActiveTools: vi.fn(() => [...activeTools]),
  };

  return {
    api,
    commands,
    tools,
    flags,
    shortcuts,
    eventHandlers,
    activeTools,
    sentMessages,
    appendedEntries,
    flagValues,
  };
}

async function loadExtension() {
  const mod = await import('../src/feature-workflow.ts');
  return mod.default as (pi: any) => Promise<void>;
}

async function emitHandlers(
  handlers: EventHandler[],
  eventName: string,
  event: any,
  ctx: MockContext,
) {
  const matching = handlers.filter((handler) => handler.event === eventName);
  const results = [];
  for (const handler of matching) {
    results.push(await handler.handler(event, ctx));
  }
  return results;
}

describe('Manifest Pi extension', () => {
  let pi: ReturnType<typeof createMockPi>;
  let extensionFactory: (api: any) => Promise<void>;

  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    pi = createMockPi();
    extensionFactory = await loadExtension();
    await extensionFactory(pi.api);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('registers the current slash commands without Pi built-in conflicts', () => {
    const names = pi.commands.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'next',
        'features',
        'start',
        'review',
        'complete',
        'init',
        'decompose',
        'activity',
        'versions',
        'plan',
        'todos',
        'yolo',
        'manifest-login',
        'manifest-logout',
        'manifest-whoami',
      ]),
    );
    expect(names).not.toContain('tree');

    const conflicts = pi.commands.filter((c) => PI_BUILTIN_COMMANDS.has(c.name));
    expect(conflicts).toHaveLength(0);
  });

  it('includes descriptions for registered commands', () => {
    for (const command of pi.commands) {
      expect(command.description, `Command /${command.name} missing description`).toBeTruthy();
    }
  });

  it('registers the plan flag, shortcut, and manifest tools', () => {
    expect(pi.flags.map((flag) => flag.name)).toContain('plan');
    expect(pi.shortcuts).toHaveLength(1);
    expect(pi.tools.some((tool) => tool.name === 'manifest_start_feature')).toBe(true);
    expect(pi.tools.some((tool) => tool.name === 'manifest_assess_plan')).toBe(true);
    expect(pi.tools.some((tool) => tool.name === 'manifest_get_project_history')).toBe(true);
  });

  it('command handlers send hidden manifest-skill messages', async () => {
    const nextCommand = pi.commands.find((c) => c.name === 'next');
    expect(nextCommand).toBeDefined();

    await nextCommand!.handler('', createCommandContext());

    expect(pi.api.sendMessage).toHaveBeenCalledTimes(1);
    const { message, options } = pi.sentMessages[0];
    expect(message.customType).toBe('manifest-skill');
    expect(message.display).toBe(false);
    expect(message.content).toContain('manifest_get_next_feature');
    expect(options.triggerTurn).toBe(true);
  });

  it('shows auth status through the manifest-whoami command', async () => {
    const authDir = mkdtempSync(join(tmpdir(), 'manifest-pi-auth-'));
    process.env.MANIFEST_API_KEY = 'local-dev-key';
    process.env.MANIFEST_AUTH_PATH = join(authDir, 'auth.json');

    const localPi = createMockPi();
    await extensionFactory(localPi.api);
    const whoamiCommand = localPi.commands.find((c) => c.name === 'manifest-whoami');
    expect(whoamiCommand).toBeDefined();

    const ctx = createCommandContext();
    await whoamiCommand!.handler('', ctx);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Mode: local dev API key'),
      'info',
    );

    delete process.env.MANIFEST_API_KEY;
    delete process.env.MANIFEST_AUTH_PATH;
    rmSync(authDir, { recursive: true, force: true });
  });

  it('command handlers replace $ARGUMENTS and strip frontmatter', async () => {
    const startCommand = pi.commands.find((c) => c.name === 'start');
    expect(startCommand).toBeDefined();

    await startCommand!.handler('MAN-42', createCommandContext());

    const content = pi.sentMessages[0].message.content;
    expect(content).toContain('MAN-42');
    expect(content).not.toContain('$ARGUMENTS');
    expect(content).not.toContain('---');
  });

  it('registers the expected workflow event handlers', () => {
    const names = pi.eventHandlers.map((handler) => handler.event);
    expect(names).toEqual(
      expect.arrayContaining([
        'tool_call',
        'tool_result',
        'tool_execution_end',
        'context',
        'before_agent_start',
        'turn_end',
        'agent_end',
        'session_start',
      ]),
    );
  });

  it('before_agent_start appends manifest context without overriding tools', async () => {
    const handler = pi.eventHandlers.find((h) => h.event === 'before_agent_start');
    expect(handler).toBeDefined();

    const result = await handler!.handler(
      { type: 'before_agent_start', prompt: 'hello', systemPrompt: 'base' },
      createContext({ hasUI: false }),
    );

    expect(result.systemPrompt).toContain('base');
    expect(result.systemPrompt).toContain('## Manifest');
    expect(result.systemPrompt).toContain('CRITICAL REVIEW');
    expect(result).not.toHaveProperty('tools');
  });

  it('session_start honors the --plan flag and activates read-only tools', async () => {
    pi.flagValues.set('plan', true);
    const handler = pi.eventHandlers.find((h) => h.event === 'session_start');
    expect(handler).toBeDefined();

    await handler!.handler({ type: 'session_start' }, createContext({ hasUI: false }));

    expect(pi.api.setActiveTools).toHaveBeenCalledWith(
      expect.arrayContaining(['read', 'bash', 'grep', 'find', 'ls', 'manifest_get_feature']),
    );
  });

  it('only marks execution complete after manifest_complete_feature succeeds', async () => {
    const planCommand = pi.commands.find((command) => command.name === 'plan');
    expect(planCommand).toBeDefined();

    const commandContext = createCommandContext();
    await planCommand!.handler('', commandContext);

    const planMessage = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Plan:\n1. Add tests for the feature\n2. Update the workflow handler\n3. Record proof and completion state',
        },
      ],
    };

    await emitHandlers(
      pi.eventHandlers,
      'agent_end',
      { type: 'agent_end', messages: [planMessage] },
      commandContext,
    );

    const appendCountBeforeComplete = pi.appendedEntries.length;

    await emitHandlers(
      pi.eventHandlers,
      'tool_call',
      {
        type: 'tool_call',
        toolName: 'manifest_complete_feature',
        input: { feature_id: 'feature-123', backfill: true },
      },
      commandContext,
    );

    expect(pi.appendedEntries).toHaveLength(appendCountBeforeComplete);

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_complete_feature',
        input: { feature_id: 'feature-123', backfill: true },
        content: [{ type: 'text', text: 'completed' }],
      },
      commandContext,
    );

    expect(pi.appendedEntries.length).toBeGreaterThan(appendCountBeforeComplete);

    await emitHandlers(
      pi.eventHandlers,
      'agent_end',
      { type: 'agent_end', messages: [] },
      commandContext,
    );

    expect(
      pi.sentMessages.some((entry) => entry.message.customType === 'plan-complete'),
    ).toBe(true);
  });

  it('tracks done markers while stripping them from visible assistant text', async () => {
    const planCommand = pi.commands.find((command) => command.name === 'plan');
    expect(planCommand).toBeDefined();

    const commandContext = createCommandContext();
    await planCommand!.handler('', commandContext);

    const planMessage = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: 'Plan:\n1. Add tests for the feature\n2. Update the workflow handler\n3. Record proof and completion state',
        },
      ],
    };

    await emitHandlers(
      pi.eventHandlers,
      'agent_end',
      { type: 'agent_end', messages: [planMessage] },
      commandContext,
    );

    const executionMessage = {
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '[DONE:1] Added tests\n[DONE:2]\nUpdated the workflow handler',
        },
      ],
    };

    await emitHandlers(
      pi.eventHandlers,
      'turn_end',
      { type: 'turn_end', message: executionMessage },
      commandContext,
    );

    expect(commandContext.ui.setStatus).toHaveBeenLastCalledWith('plan-mode', '2/3');
    expect(executionMessage.content[0].text).toBe(
      'Added tests\nUpdated the workflow handler',
    );
  });

  it('exits plan mode when assess_plan returns tracked tier', async () => {
    // Enter plan mode
    const planCommand = pi.commands.find((c) => c.name === 'plan');
    expect(planCommand).toBeDefined();
    await planCommand!.handler('', createCommandContext());

    // Verify plan mode is active (read-only tools)
    expect(pi.api.setActiveTools).toHaveBeenCalledWith(
      expect.arrayContaining(['read', 'bash', 'grep']),
    );
    const planModeTools = (pi.api.setActiveTools as any).mock.calls.at(-1)[0] as string[];
    expect(planModeTools).not.toContain('write');

    // Simulate assess_plan returning tracked tier
    const ctx = createContext({ hasUI: false });
    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_assess_plan',
        input: { feature_id: 'f1', plan: '1. Add tests\n2. Implement\n3. Record proof' },
        content: [
          {
            type: 'text',
            text: 'Plan assessment: tracked\nFeature: INFI-6 Test\nSteps: 3\nUnchecked acceptance criteria: 4\nEscalated: no\n\nPlan\n1. Add tests\n2. Implement\n3. Record proof',
          },
        ],
      },
      ctx,
    );

    // Should have exited plan mode — full tools restored
    const lastToolCall = (pi.api.setActiveTools as any).mock.calls.at(-1)[0] as string[];
    expect(lastToolCall.length).toBeGreaterThan(planModeTools.length);
  });

  it('requires proof, Critical Reviewer pass, and spec update before completion', async () => {
    const ctx = createContext({ hasUI: false });

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_start_feature',
        input: { feature_id: 'feature-123' },
        content: [{ type: 'text', text: '## Specification\nAs a user, I can do the thing.\n\n- [ ] It works' }],
      },
      ctx,
    );

    let [result] = await emitHandlers(
      pi.eventHandlers,
      'tool_call',
      {
        type: 'tool_call',
        toolName: 'manifest_complete_feature',
        input: { feature_id: 'feature-123' },
      },
      ctx,
    );
    expect(result).toMatchObject({
      block: true,
      reason: expect.stringContaining('passing proof'),
    });

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_prove_feature',
        input: { feature_id: 'feature-123', exit_code: 0 },
        content: [{ type: 'text', text: 'proved' }],
      },
      ctx,
    );

    [result] = await emitHandlers(
      pi.eventHandlers,
      'tool_call',
      {
        type: 'tool_call',
        toolName: 'manifest_complete_feature',
        input: { feature_id: 'feature-123' },
      },
      ctx,
    );
    expect(result).toMatchObject({
      block: true,
      reason: expect.stringContaining('Critical Reviewer'),
    });

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_record_verification',
        input: {
          feature_id: 'feature-123',
          comments: [],
        },
        content: [{ type: 'text', text: 'passed' }],
      },
      ctx,
    );

    [result] = await emitHandlers(
      pi.eventHandlers,
      'tool_call',
      {
        type: 'tool_call',
        toolName: 'manifest_complete_feature',
        input: { feature_id: 'feature-123' },
      },
      ctx,
    );
    expect(result).toMatchObject({
      block: true,
      reason: expect.stringContaining('updating the spec'),
    });

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_update_feature',
        input: {
          feature_id: 'feature-123',
          details: 'As a user, I can do the thing.\n\n- [x] It works',
        },
        content: [{ type: 'text', text: 'updated' }],
      },
      ctx,
    );

    [result] = await emitHandlers(
      pi.eventHandlers,
      'tool_call',
      {
        type: 'tool_call',
        toolName: 'manifest_complete_feature',
        input: { feature_id: 'feature-123' },
      },
      ctx,
    );
    expect(result).toBeUndefined();
  });

  describe('session_start proactive analysis', () => {
    function mockFetch(responses: Record<string, { status: number; body: unknown }>) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          for (const [pattern, resp] of Object.entries(responses)) {
            if (url.includes(pattern)) {
              return new Response(JSON.stringify(resp.body), { status: resp.status });
            }
          }
          return new Response('', { status: 404 });
        }),
      );
    }

    const emptyTree = [{ id: 'root-1', title: 'Root', is_root: true, children: [] }];
    const populatedTree = [
      {
        id: 'root-1',
        title: 'Root',
        is_root: true,
        children: [{ id: 'f-1', title: 'Auth', is_root: false, children: [] }],
      },
    ];

    it('offers codebase analysis when project has code but no features', async () => {
      const tmp = mkdtempSync(join(tmpdir(), 'manifest-test-'));
      writeFileSync(join(tmp, 'index.ts'), 'export {}');
      try {
        mockFetch({
          '/projects?directory=': { status: 200, body: { id: 'proj-1' } },
          '/projects/proj-1/features': { status: 200, body: emptyTree },
        });

        const localPi = createMockPi();
        const factory = await loadExtension();
        await factory(localPi.api);

        const ctx = createContext({ cwd: tmp });
        ctx.ui.select.mockResolvedValueOnce('Analyze codebase and suggest features');

        await emitHandlers(localPi.eventHandlers, 'session_start', { type: 'session_start' }, ctx);

        expect(ctx.ui.select).toHaveBeenCalledWith(
          'This project has no features yet',
          ['Analyze codebase and suggest features', 'Skip'],
        );
        expect(localPi.api.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ customType: 'manifest-skill', display: false }),
          { triggerTurn: true },
        );
      } finally {
        rmSync(tmp, { recursive: true });
      }
    });

    it('offers PRD decompose when PRD exists and no code', async () => {
      const tmp = mkdtempSync(join(tmpdir(), 'manifest-test-'));
      writeFileSync(join(tmp, 'PRD.md'), '# My Product');
      try {
        mockFetch({
          '/projects?directory=': { status: 200, body: { id: 'proj-1' } },
          '/projects/proj-1/features': { status: 200, body: emptyTree },
        });

        const localPi = createMockPi();
        const factory = await loadExtension();
        await factory(localPi.api);

        const ctx = createContext({ cwd: tmp });
        ctx.ui.select.mockResolvedValueOnce('Decompose PRD.md into features');

        await emitHandlers(localPi.eventHandlers, 'session_start', { type: 'session_start' }, ctx);

        expect(ctx.ui.select).toHaveBeenCalledWith(
          'This project has no features yet',
          ['Decompose PRD.md into features', 'Skip'],
        );
        const sentContent = localPi.sentMessages[0]?.message?.content ?? '';
        expect(sentContent).toContain('PRD.md');
      } finally {
        rmSync(tmp, { recursive: true });
      }
    });

    it('skips prompt when empty project has no code and no PRD', async () => {
      const tmp = mkdtempSync(join(tmpdir(), 'manifest-test-'));
      writeFileSync(join(tmp, 'package.json'), '{}');
      try {
        mockFetch({
          '/projects?directory=': { status: 200, body: { id: 'proj-1' } },
          '/projects/proj-1/features': { status: 200, body: emptyTree },
        });

        const localPi = createMockPi();
        const factory = await loadExtension();
        await factory(localPi.api);

        const ctx = createContext({ cwd: tmp });
        await emitHandlers(localPi.eventHandlers, 'session_start', { type: 'session_start' }, ctx);

        expect(ctx.ui.select).not.toHaveBeenCalled();
      } finally {
        rmSync(tmp, { recursive: true });
      }
    });

    it('does nothing when project has features', async () => {
      mockFetch({
        '/projects?directory=': { status: 200, body: { id: 'proj-1' } },
        '/projects/proj-1/features': { status: 200, body: populatedTree },
      });

      const localPi = createMockPi();
      const factory = await loadExtension();
      await factory(localPi.api);

      const ctx = createContext();
      await emitHandlers(localPi.eventHandlers, 'session_start', { type: 'session_start' }, ctx);

      expect(ctx.ui.select).not.toHaveBeenCalled();
    });

    it('does nothing when no project found', async () => {
      mockFetch({
        '/projects?directory=': { status: 200, body: {} },
      });

      const localPi = createMockPi();
      const factory = await loadExtension();
      await factory(localPi.api);

      const ctx = createContext();
      await emitHandlers(localPi.eventHandlers, 'session_start', { type: 'session_start' }, ctx);

      expect(ctx.ui.select).not.toHaveBeenCalled();
    });

    it('does nothing when API is unreachable', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new Error('ECONNREFUSED');
        }),
      );

      const localPi = createMockPi();
      const factory = await loadExtension();
      await factory(localPi.api);

      const ctx = createContext();
      await emitHandlers(localPi.eventHandlers, 'session_start', { type: 'session_start' }, ctx);

      expect(ctx.ui.select).not.toHaveBeenCalled();
    });

    it('does nothing in non-interactive mode', async () => {
      mockFetch({
        '/projects?directory=': { status: 200, body: { id: 'proj-1' } },
        '/projects/proj-1/features': { status: 200, body: emptyTree },
      });

      const localPi = createMockPi();
      const factory = await loadExtension();
      await factory(localPi.api);

      const ctx = createContext({ hasUI: false });
      await emitHandlers(localPi.eventHandlers, 'session_start', { type: 'session_start' }, ctx);

      expect(ctx.ui.select).not.toHaveBeenCalled();
      // Should not even call the API when non-interactive
      expect(fetch).not.toHaveBeenCalledWith(
        expect.stringContaining('/projects?directory='),
        expect.anything(),
      );
    });

    it('respects Skip choice', async () => {
      const tmp = mkdtempSync(join(tmpdir(), 'manifest-test-'));
      writeFileSync(join(tmp, 'index.ts'), 'export {}');
      try {
        mockFetch({
          '/projects?directory=': { status: 200, body: { id: 'proj-1' } },
          '/projects/proj-1/features': { status: 200, body: emptyTree },
        });

        const localPi = createMockPi();
        const factory = await loadExtension();
        await factory(localPi.api);

        const ctx = createContext({ cwd: tmp });
        ctx.ui.select.mockResolvedValueOnce('Skip');

        await emitHandlers(localPi.eventHandlers, 'session_start', { type: 'session_start' }, ctx);

        expect(ctx.ui.select).toHaveBeenCalled();
        expect(localPi.api.sendMessage).not.toHaveBeenCalled();
      } finally {
        rmSync(tmp, { recursive: true });
      }
    });
  });

  it('returns to implementation when Critical Reviewer records findings', async () => {
    const ctx = createContext({ hasUI: false });

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_start_feature',
        input: { feature_id: 'feature-456' },
        content: [{ type: 'text', text: '## Specification\nAs a user, I can do the thing.\n\n- [ ] It works' }],
      },
      ctx,
    );

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_prove_feature',
        input: { feature_id: 'feature-456', exit_code: 0 },
        content: [{ type: 'text', text: 'proved' }],
      },
      ctx,
    );

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_record_verification',
        input: {
          feature_id: 'feature-456',
          comments: [{
            title: 'Missing unhappy-path test',
            severity: 'major',
            body: 'No coverage for storage write failure.',
            file: 'src/routes/assets.test.ts',
          }],
        },
        content: [{ type: 'text', text: '1 comment' }],
      },
      ctx,
    );

    let [result] = await emitHandlers(
      pi.eventHandlers,
      'tool_call',
      {
        type: 'tool_call',
        toolName: 'manifest_complete_feature',
        input: { feature_id: 'feature-456' },
      },
      ctx,
    );

    expect(result).toMatchObject({
      block: true,
      reason: expect.stringContaining('Critical Reviewer phase'),
    });

    await emitHandlers(
      pi.eventHandlers,
      'tool_result',
      {
        type: 'tool_result',
        isError: false,
        toolName: 'manifest_prove_feature',
        input: { feature_id: 'feature-456', exit_code: 0 },
        content: [{ type: 'text', text: 'reproved' }],
      },
      ctx,
    );

    [result] = await emitHandlers(
      pi.eventHandlers,
      'tool_call',
      {
        type: 'tool_call',
        toolName: 'manifest_complete_feature',
        input: { feature_id: 'feature-456' },
      },
      ctx,
    );

    expect(result).toMatchObject({
      block: true,
      reason: expect.stringContaining('Critical Reviewer'),
    });
  });
});
