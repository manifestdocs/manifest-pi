import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPlanModeController,
  getPlanModeTools,
  MANIFEST_READ_TOOLS,
} from '../../src/hooks/plan-mode.js';

function mockPi() {
  return {
    setActiveTools: vi.fn(),
    getAllTools: vi.fn(() =>
      ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls', 'questionnaire',
       ...MANIFEST_READ_TOOLS, 'manifest_start_feature', 'manifest_update_feature',
      ].map((name) => ({ name, description: '' }))
    ),
  };
}

describe('getPlanModeTools', () => {
  it('includes Pi read tools and manifest read tools', () => {
    const tools = getPlanModeTools();
    expect(tools).toContain('read');
    expect(tools).toContain('bash');
    expect(tools).toContain('grep');
    expect(tools).toContain('find');
    expect(tools).toContain('ls');
    expect(tools).toContain('manifest_list_projects');
    expect(tools).toContain('manifest_get_feature');
    expect(tools).toContain('manifest_orient');
  });

  it('does not include write tools', () => {
    const tools = getPlanModeTools();
    expect(tools).not.toContain('edit');
    expect(tools).not.toContain('write');
    expect(tools).not.toContain('manifest_start_feature');
    expect(tools).not.toContain('manifest_update_feature');
    expect(tools).not.toContain('manifest_complete_feature');
  });
});

describe('PlanModeController', () => {
  let controller: ReturnType<typeof createPlanModeController>;
  let pi: ReturnType<typeof mockPi>;

  beforeEach(() => {
    controller = createPlanModeController();
    pi = mockPi();
  });

  it('starts in normal state', () => {
    expect(controller.getState()).toBe('normal');
    expect(controller.getTodoItems()).toEqual([]);
  });

  describe('enter', () => {
    it('transitions to plan state', () => {
      controller.enter(pi as any);
      expect(controller.getState()).toBe('plan');
    });

    it('sets active tools to plan mode tools', () => {
      controller.enter(pi as any);
      expect(pi.setActiveTools).toHaveBeenCalledWith(getPlanModeTools());
    });

    it('clears todo items', () => {
      controller.setTodoItems([{ step: 1, text: 'test', completed: false }]);
      controller.enter(pi as any);
      expect(controller.getTodoItems()).toEqual([]);
    });
  });

  describe('enterExecute', () => {
    it('transitions to execute state', () => {
      controller.enter(pi as any);
      controller.enterExecute(pi as any);
      expect(controller.getState()).toBe('execute');
    });

    it('restores all tools', () => {
      controller.enterExecute(pi as any);
      const allToolNames = pi.getAllTools().map((t: any) => t.name);
      expect(pi.setActiveTools).toHaveBeenCalledWith(allToolNames);
    });
  });

  describe('exit', () => {
    it('transitions to normal state', () => {
      controller.enter(pi as any);
      controller.exit(pi as any);
      expect(controller.getState()).toBe('normal');
    });

    it('clears todo items', () => {
      controller.setTodoItems([{ step: 1, text: 'test', completed: false }]);
      controller.exit(pi as any);
      expect(controller.getTodoItems()).toEqual([]);
    });

    it('restores all tools', () => {
      controller.enter(pi as any);
      pi.setActiveTools.mockClear();
      controller.exit(pi as any);
      const allToolNames = pi.getAllTools().map((t: any) => t.name);
      expect(pi.setActiveTools).toHaveBeenCalledWith(allToolNames);
    });
  });

  describe('reset', () => {
    it('resets to normal without calling pi', () => {
      controller.enter(pi as any);
      controller.setTodoItems([{ step: 1, text: 'test', completed: false }]);
      pi.setActiveTools.mockClear();
      controller.reset();
      expect(controller.getState()).toBe('normal');
      expect(controller.getTodoItems()).toEqual([]);
      expect(pi.setActiveTools).not.toHaveBeenCalled();
    });
  });

  describe('todoItems', () => {
    it('gets and sets todo items', () => {
      const items = [
        { step: 1, text: 'First', completed: false },
        { step: 2, text: 'Second', completed: true },
      ];
      controller.setTodoItems(items);
      expect(controller.getTodoItems()).toBe(items);
    });
  });
});
