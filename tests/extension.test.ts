import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
        'complete',
        'init',
        'decompose',
        'activity',
        'versions',
        'plan',
        'todos',
        'yolo',
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
});
