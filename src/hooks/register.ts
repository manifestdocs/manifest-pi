/**
 * Pi hook registration for workflow gates.
 *
 * Wires gate evaluation to Pi's tool_call (blocking) and
 * tool_result (state tracking + soft warnings) hooks.
 */

import type { ExtensionAPI, ExtensionContext, ToolCallEvent, ToolResultEvent } from '@mariozechner/pi-coding-agent';
import type { ManifestClient } from '../client.js';
import type { WorkflowState } from './state.js';
import type { PlanModeController } from './plan-mode.js';
import {
  evaluateMustStart,
  evaluateMustProve,
  evaluateMustUpdateSpec,
  evaluateSpecQuality,
  evaluateReadyForImplementation,
  evaluateReadyForCompletion,
} from './gates.js';

export function registerGates(
  pi: ExtensionAPI,
  state: WorkflowState,
  client: ManifestClient,
  planController?: PlanModeController,
): void {
  // -- tool_call: evaluate hard gates before execution --
  pi.on('tool_call', async (event: ToolCallEvent, _ctx: ExtensionContext) => {
    if (event.toolName === 'manifest_start_feature') {
      const featureId =
        typeof event.input.feature_id === 'string'
          ? event.input.feature_id
          : undefined;
      if (!featureId) return undefined;

      // Team mode gate: block start unless spec approved
      const implDecision = evaluateReadyForImplementation(state, featureId);
      if (!implDecision.allow) {
        return { block: true, reason: implDecision.reason };
      }
    }

    if (event.toolName === 'manifest_complete_feature') {
      const featureId =
        typeof event.input.feature_id === 'string'
          ? event.input.feature_id
          : undefined;
      if (!featureId) return undefined;
      const backfill =
        typeof event.input.backfill === 'boolean'
          ? event.input.backfill
          : undefined;

      if (!backfill) {
        const proveDecision = evaluateMustProve(state, featureId);
        if (!proveDecision.allow) {
          return { block: true, reason: proveDecision.reason };
        }

        const completionDecision = evaluateReadyForCompletion(state, featureId);
        if (!completionDecision.allow) {
          return { block: true, reason: completionDecision.reason };
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
  pi.on('tool_result', async (event: ToolResultEvent, _ctx: ExtensionContext) => {
    if (event.isError) return undefined;

    // Track state transitions from successful tool results
    if (event.toolName === 'manifest_start_feature') {
      const featureId =
        typeof event.input.feature_id === 'string'
          ? event.input.feature_id
          : undefined;
      if (!featureId) return undefined;
      state.featureStarted(featureId);
      state.advancePhase(featureId, 'implementing');

      // Hydrate proof/spec state from server (handles re-claims and cross-session resume)
      try {
        const proof = await client.getFeatureProof(featureId);
        if (proof && proof.exit_code === 0) {
          state.featureProved(featureId);
        }
      } catch {
        // No proof yet -- normal for fresh starts
      }

      // Store spec details for tier assessment
      const resultText = event.content?.[0]?.type === 'text' ? event.content[0].text : '';
      const specMatch = resultText.match(/## Specification\n([\s\S]*?)(?=\n## |$)/);
      state.setActiveFeatureDetails(specMatch?.[1]?.trim() ?? null);

      // Auto-enter plan mode for code exploration before implementation
      if (planController && planController.getState() === 'normal') {
        planController.enter(pi);
      }
    }

    if (event.toolName === 'manifest_prove_feature') {
      const featureId =
        typeof event.input.feature_id === 'string'
          ? event.input.feature_id
          : undefined;
      const exitCode =
        typeof event.input.exit_code === 'number'
          ? event.input.exit_code
          : undefined;
      if (exitCode === 0) {
        if (!featureId) return undefined;
        state.featureProved(featureId);
        state.setVerified(featureId, false);
        state.advancePhase(featureId, 'critical_reviewing');
      }
    }

    if (event.toolName === 'manifest_update_feature') {
      const featureId =
        typeof event.input.feature_id === 'string'
          ? event.input.feature_id
          : undefined;
      const details =
        typeof event.input.details === 'string'
          ? event.input.details
          : undefined;
      if (details) {
        if (!featureId) return undefined;
        state.featureSpecUpdated(featureId);

        // Team mode: check if spec passes quality gate → advance to spec_approved
        if (state.teamMode) {
          const phase = state.getPhase(featureId);
          if (phase === 'speccing') {
            const specDecision = evaluateSpecQuality(details);
            if (specDecision.allow) {
              state.advancePhase(featureId, 'spec_approved');
            }
          }
        }
      }
    }

    if (event.toolName === 'manifest_record_verification') {
      const featureId =
        typeof event.input.feature_id === 'string'
          ? event.input.feature_id
          : undefined;
      const comments = event.input.comments;
      if (!featureId || !Array.isArray(comments)) return undefined;

      if (comments.length === 0) {
        state.setVerified(featureId, true);
      } else {
        state.setVerified(featureId, false);
        state.advancePhase(featureId, 'implementing');
      }
    }

    if (event.toolName === 'manifest_complete_feature') {
      const featureId =
        typeof event.input.feature_id === 'string'
          ? event.input.feature_id
          : undefined;
      if (!featureId) return undefined;
      const wasTeamMode = state.teamMode;
      state.featureCompleted(featureId);

      // Restore all tools when exiting team mode after feature completion
      if (wasTeamMode) {
        const allTools = pi.getAllTools().map((t) => t.name);
        if (allTools.length > 0) {
          pi.setActiveTools(allTools);
        }
      }
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
}
