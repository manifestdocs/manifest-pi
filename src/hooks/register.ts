/**
 * Pi hook registration for workflow gates.
 *
 * Wires gate evaluation to Pi's tool_call (blocking) and
 * tool_result (state tracking + soft warnings) hooks.
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { WorkflowState } from './state.js';
import { evaluateMustStart, evaluateMustProve, evaluateMustUpdateSpec } from './gates.js';

export function registerGates(pi: ExtensionAPI, state: WorkflowState): void {
  // -- tool_call: evaluate hard gates before execution --
  pi.on('tool_call', async (event: any) => {
    if (event.toolName === 'manifest_complete_feature') {
      const featureId = (event.input as any).feature_id as string;
      const backfill = (event.input as any).backfill as boolean | undefined;

      if (!backfill) {
        const proveDecision = evaluateMustProve(state, featureId);
        if (!proveDecision.allow) {
          return { block: true, reason: proveDecision.reason };
        }

        const specDecision = evaluateMustUpdateSpec(state, featureId);
        if (!specDecision.allow) {
          return { block: true, reason: specDecision.reason };
        }
      }
    }

    return undefined;
  });

  // -- tool_result: track state + append soft warnings --
  pi.on('tool_result', async (event: any) => {
    if (event.isError) return undefined;

    // Track state transitions from successful tool results
    if (event.toolName === 'manifest_start_feature') {
      state.featureStarted((event.input as any).feature_id);
    }
    if (event.toolName === 'manifest_prove_feature') {
      const exitCode = (event.input as any).exit_code;
      if (exitCode === 0) {
        state.featureProved((event.input as any).feature_id);
      }
    }
    if (event.toolName === 'manifest_update_feature' && (event.input as any).details) {
      state.featureSpecUpdated((event.input as any).feature_id);
    }
    if (event.toolName === 'manifest_complete_feature') {
      state.featureCompleted((event.input as any).feature_id);
    }

    // Gate 1: soft warn on write/edit without active feature
    if ((event.toolName === 'write' || event.toolName === 'edit') && !state.hasActiveFeature()) {
      const decision = evaluateMustStart(state);
      if (decision.warning) {
        const text = event.content?.[0]?.type === 'text' ? event.content[0].text : '';
        return {
          content: [{ type: 'text' as const, text: text + '\n\n' + decision.warning }],
        };
      }
    }

    return undefined;
  });

  // Reset on session boundaries
  pi.on('session_start', () => {
    state.reset();
  });
}
