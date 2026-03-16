/**
 * Integration tests for the Manifest Pi extension.
 *
 * These tests load the extension factory and validate that it registers
 * correctly against the Pi ExtensionAPI contract — catching issues like
 * command name conflicts and invalid event handler signatures before
 * they surface at runtime.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pi's built-in slash commands — commands registered with these names are
// silently dropped by ExtensionRunner.getRegisteredCommands().
// Source: @mariozechner/pi-coding-agent/dist/core/slash-commands.js
// Keep in sync when upgrading Pi.
const PI_BUILTIN_COMMANDS = new Set([
  'settings', 'model', 'scoped-models', 'export', 'share', 'copy', 'name',
  'session', 'changelog', 'hotkeys', 'fork', 'tree', 'login', 'logout',
  'new', 'compact', 'resume', 'reload', 'quit',
]);

// Stub types matching Pi's ExtensionAPI surface used by the extension
interface RegisteredCommand {
  name: string;
  description?: string;
  handler: (args: string, ctx: any) => Promise<void>;
}

interface RegisteredTool {
  name: string;
  description: string;
  parameters: any;
  execute: (...args: any[]) => any;
}

interface EventHandler {
  event: string;
  handler: (...args: any[]) => any;
}

/**
 * Creates a mock ExtensionAPI that records all registrations.
 * Mirrors the shape of Pi's real API so we can inspect what the
 * extension registered without spinning up a full Pi runtime.
 */
function createMockPi() {
  const commands: RegisteredCommand[] = [];
  const tools: RegisteredTool[] = [];
  const eventHandlers: EventHandler[] = [];
  const activeTools: string[] = [];
  const sentMessages: Array<{ message: any; options: any }> = [];

  const api = {
    registerCommand: vi.fn((name: string, options: any) => {
      commands.push({ name, ...options });
    }),
    registerTool: vi.fn((tool: any) => {
      tools.push(tool);
    }),
    on: vi.fn((event: string, handler: any) => {
      eventHandlers.push({ event, handler });
    }),
    sendUserMessage: vi.fn(),
    sendMessage: vi.fn((message: any, options: any) => {
      sentMessages.push({ message, options });
    }),
    getAllTools: vi.fn(() =>
      tools.map((t) => ({ name: t.name, description: t.description })),
    ),
    setActiveTools: vi.fn((names: string[]) => {
      activeTools.length = 0;
      activeTools.push(...names);
    }),
    getActiveTools: vi.fn(() => [...activeTools]),
    exec: vi.fn(async () => ({ stdout: '', stderr: '', code: 0, killed: false })),
  };

  return { api, commands, tools, eventHandlers, activeTools, sentMessages };
}

// Dynamically import the extension factory — it reads skill files from disk
// so we need the real filesystem available.
async function loadExtension() {
  // Import from the compiled output since the extension is in extensions/ (not src/)
  const mod = await import('../extensions/manifest.js');
  return mod.default as (pi: any) => Promise<void>;
}

describe('Manifest Pi extension', () => {
  let pi: ReturnType<typeof createMockPi>;
  let extensionFactory: (api: any) => Promise<void>;

  beforeEach(async () => {
    pi = createMockPi();
    extensionFactory = await loadExtension();
    await extensionFactory(pi.api);
  });

  // ============================================================
  // Command registration
  // ============================================================

  describe('command registration', () => {
    it('registers expected slash commands', () => {
      const names = pi.commands.map((c) => c.name);
      expect(names).toContain('next');
      expect(names).toContain('start');
      expect(names).toContain('complete');
      expect(names).toContain('init');
      expect(names).toContain('plan');
      expect(names).toContain('activity');
      expect(names).toContain('versions');
      expect(names).toContain('features');
    });

    it('does not register commands that conflict with Pi built-ins', () => {
      const conflicts = pi.commands.filter((c) => PI_BUILTIN_COMMANDS.has(c.name));
      expect(conflicts, `Conflicting commands: ${conflicts.map((c) => c.name).join(', ')}`).toHaveLength(0);
    });

    it('renames tree skill to features command', () => {
      const names = pi.commands.map((c) => c.name);
      expect(names).not.toContain('tree');
      expect(names).toContain('features');
    });

    it('includes descriptions from skill frontmatter', () => {
      for (const cmd of pi.commands) {
        expect(cmd.description, `Command /${cmd.name} missing description`).toBeTruthy();
      }
    });

    it('command handlers send hidden message with skill content', async () => {
      const nextCmd = pi.commands.find((c) => c.name === 'next');
      expect(nextCmd).toBeDefined();

      await nextCmd!.handler('', {} as any);
      expect(pi.api.sendMessage).toHaveBeenCalledTimes(1);
      expect(pi.api.sendUserMessage).not.toHaveBeenCalled();

      const { message, options } = pi.sentMessages[0];
      expect(message.customType).toBe('manifest-skill');
      expect(message.display).toBe(false);
      expect(message.content).toContain('manifest_get_next_feature');
      expect(options.triggerTurn).toBe(true);
    });

    it('command handlers replace $ARGUMENTS in skill content', async () => {
      const startCmd = pi.commands.find((c) => c.name === 'start');
      expect(startCmd).toBeDefined();

      await startCmd!.handler('my-feature', {} as any);
      expect(pi.api.sendMessage).toHaveBeenCalledTimes(1);

      const content = pi.sentMessages[0].message.content;
      expect(content).toContain('my-feature');
      expect(content).not.toContain('$ARGUMENTS');
    });

    it('command handlers strip frontmatter from skill content', async () => {
      const nextCmd = pi.commands.find((c) => c.name === 'next');
      await nextCmd!.handler('', {} as any);

      const content = pi.sentMessages[0].message.content;
      expect(content).not.toContain('---');
      expect(content).not.toContain('disable-model-invocation');
    });
  });

  // ============================================================
  // Tool registration
  // ============================================================

  describe('tool registration', () => {
    it('registers dispatch_agent tool', () => {
      const tool = pi.tools.find((t) => t.name === 'dispatch_agent');
      expect(tool).toBeDefined();
    });

    it('registers manifest_* tools via registerAllTools', () => {
      // registerAllTools is called before our dispatch_agent, so tools should exist
      expect(pi.api.registerTool).toHaveBeenCalled();
    });
  });

  // ============================================================
  // Event handlers
  // ============================================================

  describe('event handlers', () => {
    it('registers input handler', () => {
      const inputHandlers = pi.eventHandlers.filter((h) => h.event === 'input');
      expect(inputHandlers.length).toBeGreaterThanOrEqual(1);
    });

    it('registers before_agent_start handler', () => {
      const handlers = pi.eventHandlers.filter((h) => h.event === 'before_agent_start');
      expect(handlers.length).toBeGreaterThanOrEqual(1);
    });

    it('registers session_start handler', () => {
      const handlers = pi.eventHandlers.filter((h) => h.event === 'session_start');
      expect(handlers.length).toBeGreaterThanOrEqual(1);
    });

    it('input handler returns { action: "continue" } for empty input', async () => {
      const handler = pi.eventHandlers.find((h) => h.event === 'input')!.handler;
      const result = await handler({ type: 'input', text: '', source: 'interactive' }, {});
      expect(result).toEqual({ action: 'continue' });
    });

    it('input handler returns { action: "continue" } for non-matching input', async () => {
      const handler = pi.eventHandlers.find((h) => h.event === 'input')!.handler;
      const result = await handler({ type: 'input', text: 'hello world', source: 'interactive' }, {});
      expect(result).toEqual({ action: 'continue' });
    });

    it('input handler returns { action: "continue" } for team-mode trigger', async () => {
      const handler = pi.eventHandlers.find((h) => h.event === 'input')!.handler;
      const result = await handler({ type: 'input', text: 'work on MAN-42', source: 'interactive' }, {});
      expect(result).toEqual({ action: 'continue' });
    });

    it('before_agent_start handler appends manifest context to system prompt', async () => {
      const handler = pi.eventHandlers.find((h) => h.event === 'before_agent_start')!.handler;
      const result = await handler({ type: 'before_agent_start', prompt: 'hello', systemPrompt: 'base' }, {});
      expect(result).toBeDefined();
      expect(result.systemPrompt).toContain('base');
      expect(result.systemPrompt).toContain('Manifest');
    });

    it('before_agent_start handler does NOT return a tools property', async () => {
      const handler = pi.eventHandlers.find((h) => h.event === 'before_agent_start')!.handler;
      const result = await handler({ type: 'before_agent_start', prompt: 'hello', systemPrompt: 'base' }, {});
      expect(result).not.toHaveProperty('tools');
    });
  });

  // ============================================================
  // dispatch_agent tool
  // ============================================================

  describe('dispatch_agent', () => {
    it('uses pi.exec instead of child_process.spawn', async () => {
      const tool = pi.tools.find((t) => t.name === 'dispatch_agent')!;

      await tool.execute('test-id', {
        agent: 'feature-engineer',
        task: 'do something',
      });

      expect(pi.api.exec).toHaveBeenCalledWith(
        'pi',
        expect.arrayContaining(['--no-session', '--no-extensions']),
        expect.any(Object),
      );
    });

    it('returns error text for unknown agent type', async () => {
      const tool = pi.tools.find((t) => t.name === 'dispatch_agent')!;
      const result = await tool.execute('test-id', { agent: 'unknown', task: 'test' });
      expect(result.content[0].text).toContain('Unknown agent');
    });

    it('returns error text when pi.exec fails with non-zero code', async () => {
      pi.api.exec.mockResolvedValueOnce({ stdout: '', stderr: 'something broke', code: 1, killed: false });

      const tool = pi.tools.find((t) => t.name === 'dispatch_agent')!;
      const result = await tool.execute('test-id', { agent: 'feature-engineer', task: 'test' });
      expect(result.content[0].text).toContain('exited with code 1');
    });
  });
});
