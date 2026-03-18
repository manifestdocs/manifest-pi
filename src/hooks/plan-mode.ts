/**
 * Plan mode state types and tool classification.
 *
 * Defines which tools are available in plan mode (read-only exploration)
 * vs normal mode (full access). The plan mode controller manages
 * state transitions: normal -> plan -> execute -> normal.
 */

import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';
import type { TodoItem } from './plan-utils.js';
import type { PlanTier } from './tier.js';

// ── State ────────────────────────────────────────

export type PlanModeState = 'normal' | 'plan' | 'execute';

// ── Tool Classification ──────────────────────────

/** Manifest tools that only read data (no state changes). */
export const MANIFEST_READ_TOOLS = [
  'manifest_list_projects',
  'manifest_find_features',
  'manifest_get_feature',
  'manifest_get_next_feature',
  'manifest_render_feature_tree',
  'manifest_orient',
  'manifest_get_project_history',
  'manifest_get_feature_proof',
  'manifest_list_versions',
];

/** Pi built-in tools allowed in plan mode. */
const PI_PLAN_TOOLS = ['read', 'bash', 'grep', 'find', 'ls', 'questionnaire'];

/** All tools available in plan mode (read-only). */
export function getPlanModeTools(): string[] {
  return [...PI_PLAN_TOOLS, ...MANIFEST_READ_TOOLS];
}

// ── Controller ───────────────────────────────────

export interface PlanModeController {
  getState(): PlanModeState;
  getTodoItems(): TodoItem[];
  setTodoItems(items: TodoItem[]): void;
  getResolvedTier(): PlanTier | null;
  setResolvedTier(tier: PlanTier): void;
  enter(pi: ExtensionAPI, ctx?: ExtensionContext): void;
  enterExecute(pi: ExtensionAPI, ctx?: ExtensionContext): void;
  exit(pi: ExtensionAPI, ctx?: ExtensionContext): void;
  refreshDisplay(ctx: ExtensionContext): void;
  reset(): void;
}

export function createPlanModeController(): PlanModeController {
  let state: PlanModeState = 'normal';
  let todoItems: TodoItem[] = [];
  let resolvedTier: PlanTier | null = null;

  function updateStatus(ctx: ExtensionContext | undefined): void {
    if (!ctx) return;

    if (state === 'execute' && todoItems.length > 0) {
      const completed = todoItems.filter((t) => t.completed).length;
      const counter = ctx.ui.theme.fg('accent', `${completed}/${todoItems.length}`);
      if (resolvedTier === 'full') {
        ctx.ui.setStatus('plan-mode', `${ctx.ui.theme.fg('warning', 'PLAN')} ${counter}`);
      } else {
        ctx.ui.setStatus('plan-mode', counter);
      }
    } else if (state === 'plan') {
      ctx.ui.setStatus('plan-mode', ctx.ui.theme.fg('warning', 'PLAN'));
    } else {
      ctx.ui.setStatus('plan-mode', undefined);
    }

    if (state === 'execute' && todoItems.length > 0) {
      const lines = todoItems.map((item) => {
        if (item.completed) {
          return (
            ctx.ui.theme.fg('success', '[x] ') + ctx.ui.theme.fg('muted', ctx.ui.theme.strikethrough(item.text))
          );
        }
        return `${ctx.ui.theme.fg('muted', '[ ] ')}${item.text}`;
      });
      ctx.ui.setWidget('plan-todos', lines);
    } else {
      ctx.ui.setWidget('plan-todos', undefined);
    }
  }

  return {
    getState() {
      return state;
    },

    getTodoItems() {
      return todoItems;
    },

    setTodoItems(items: TodoItem[]) {
      todoItems = items;
    },

    getResolvedTier() {
      return resolvedTier;
    },

    setResolvedTier(tier: PlanTier) {
      resolvedTier = tier;
    },

    enter(pi: ExtensionAPI, ctx?: ExtensionContext) {
      state = 'plan';
      todoItems = [];
      resolvedTier = null;
      pi.setActiveTools(getPlanModeTools());
      updateStatus(ctx);
    },

    enterExecute(pi: ExtensionAPI, ctx?: ExtensionContext) {
      state = 'execute';
      const allTools = pi.getAllTools().map((t) => t.name);
      if (allTools.length > 0) {
        pi.setActiveTools(allTools);
      }
      updateStatus(ctx);
    },

    exit(pi: ExtensionAPI, ctx?: ExtensionContext) {
      state = 'normal';
      todoItems = [];
      resolvedTier = null;
      const allTools = pi.getAllTools().map((t) => t.name);
      if (allTools.length > 0) {
        pi.setActiveTools(allTools);
      }
      updateStatus(ctx);
    },

    refreshDisplay(ctx: ExtensionContext) {
      updateStatus(ctx);
    },

    reset() {
      state = 'normal';
      todoItems = [];
      resolvedTier = null;
    },
  };
}
