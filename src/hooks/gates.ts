/**
 * Gate evaluation functions.
 *
 * Pure decision logic — no Pi dependencies. Each function
 * evaluates a workflow gate and returns a decision.
 */

import type { WorkflowState } from './state.js';

export interface GateDecision {
  allow: boolean;
  reason?: string;
  warning?: string;
}

/** Soft gate: warn when editing/writing without an active feature. */
export function evaluateMustStart(state: WorkflowState): GateDecision {
  if (!state.hasActiveFeature()) {
    return {
      allow: true,
      warning: '[Manifest] No feature claimed. Call manifest_start_feature to track your work.',
    };
  }
  return { allow: true };
}

/** Hard gate: block complete_feature without a passing proof. */
export function evaluateMustProve(state: WorkflowState, featureId: string): GateDecision {
  const feature = state.getFeatureState(featureId);
  if (!feature || !feature.proved) {
    return {
      allow: false,
      reason: 'Cannot complete feature without passing proof. Call manifest_prove_feature with exit_code 0 first.',
    };
  }
  return { allow: true };
}

/** Hard gate: block complete_feature without a spec update. */
export function evaluateMustUpdateSpec(state: WorkflowState, featureId: string): GateDecision {
  const feature = state.getFeatureState(featureId);
  if (!feature || !feature.specUpdated) {
    return {
      allow: false,
      reason: 'Cannot complete feature without updating the spec. Call manifest_update_feature with details first.',
    };
  }
  return { allow: true };
}

// ============================================================
// Team Mode Gates (only active when state.teamMode === true)
// ============================================================

/**
 * Evaluate spec quality for the speccing → spec_approved transition.
 *
 * Checks structural markers:
 * - Non-null, >= 50 chars
 * - Contains user story: line matching /^As an?\s/im
 * - Contains >= 1 acceptance criterion: line matching /^-\s\[\s\]/m
 */
export function evaluateSpecQuality(details: string | null): GateDecision {
  if (!details || details.length < 50) {
    return {
      allow: false,
      reason: 'Spec too short. Must be at least 50 characters with a user story and acceptance criteria.',
    };
  }

  const hasUserStory = /^As an?\s/im.test(details);
  if (!hasUserStory) {
    return {
      allow: false,
      reason: 'Spec missing user story. Must include a line starting with "As a [user], I can [capability] so that [benefit]."',
    };
  }

  const criteria = details.match(/^-\s\[\s\]/gm);
  if (!criteria || criteria.length === 0) {
    return {
      allow: false,
      reason: 'Spec missing acceptance criteria. Must include at least one checkbox item: "- [ ] criterion".',
    };
  }

  return { allow: true };
}

/** Hard gate: block start_feature unless spec is approved (team mode only). */
export function evaluateReadyForImplementation(state: WorkflowState, featureId: string): GateDecision {
  if (!state.teamMode) return { allow: true };

  const feature = state.getFeatureState(featureId);
  if (!feature || feature.phase !== 'spec_approved') {
    return {
      allow: false,
      reason: 'Cannot start implementation until spec is approved. Current phase: ' +
        (feature?.phase ?? 'unknown') +
        '. Dispatch product-manager to write/refine the spec first. DO NOT attempt to work around this restriction.',
    };
  }
  return { allow: true };
}

/** Hard gate: block complete_feature unless reviewed, proved, and verified (team mode only). */
export function evaluateReadyForCompletion(state: WorkflowState, featureId: string): GateDecision {
  if (!state.teamMode) return { allow: true };

  const feature = state.getFeatureState(featureId);
  if (!feature) {
    return {
      allow: false,
      reason: 'No workflow state for this feature. DO NOT attempt to work around this restriction.',
    };
  }

  if (feature.phase !== 'reviewing') {
    return {
      allow: false,
      reason: 'Cannot complete feature — not in reviewing phase. Current phase: ' +
        feature.phase +
        '. DO NOT attempt to work around this restriction.',
    };
  }

  if (!feature.proved) {
    return {
      allow: false,
      reason: 'Cannot complete feature without passing proof. Call manifest_prove_feature with exit_code 0 first. DO NOT attempt to work around this restriction.',
    };
  }

  if (!feature.verified) {
    return {
      allow: false,
      reason: 'Cannot complete feature without verification. Dispatch code-reviewer first. DO NOT attempt to work around this restriction.',
    };
  }

  return { allow: true };
}
