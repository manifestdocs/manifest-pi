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
