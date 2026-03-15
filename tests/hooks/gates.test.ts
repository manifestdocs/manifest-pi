import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowState } from '../../src/hooks/state.js';
import { evaluateMustStart, evaluateMustProve, evaluateMustUpdateSpec } from '../../src/hooks/gates.js';

describe('gate evaluation', () => {
  let state: WorkflowState;

  beforeEach(() => {
    state = new WorkflowState();
  });

  describe('evaluateMustStart', () => {
    it('returns warning when no feature is active', () => {
      const decision = evaluateMustStart(state);
      expect(decision.allow).toBe(true);
      expect(decision.warning).toContain('No feature claimed');
    });

    it('returns no warning when a feature is active', () => {
      state.featureStarted('f-1');
      const decision = evaluateMustStart(state);
      expect(decision.allow).toBe(true);
      expect(decision.warning).toBeUndefined();
    });
  });

  describe('evaluateMustProve', () => {
    it('blocks when feature has no state', () => {
      const decision = evaluateMustProve(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('prove_feature');
    });

    it('blocks when feature is not proved', () => {
      state.featureStarted('f-1');
      const decision = evaluateMustProve(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('prove_feature');
    });

    it('allows when feature is proved', () => {
      state.featureStarted('f-1');
      state.featureProved('f-1');
      const decision = evaluateMustProve(state, 'f-1');
      expect(decision.allow).toBe(true);
      expect(decision.reason).toBeUndefined();
    });
  });

  describe('evaluateMustUpdateSpec', () => {
    it('blocks when feature has no state', () => {
      const decision = evaluateMustUpdateSpec(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('update_feature');
    });

    it('blocks when spec is not updated', () => {
      state.featureStarted('f-1');
      const decision = evaluateMustUpdateSpec(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('update_feature');
    });

    it('allows when spec is updated', () => {
      state.featureStarted('f-1');
      state.featureSpecUpdated('f-1');
      const decision = evaluateMustUpdateSpec(state, 'f-1');
      expect(decision.allow).toBe(true);
      expect(decision.reason).toBeUndefined();
    });
  });

  describe('combined gates for complete_feature', () => {
    it('both block when nothing is done', () => {
      state.featureStarted('f-1');
      expect(evaluateMustProve(state, 'f-1').allow).toBe(false);
      expect(evaluateMustUpdateSpec(state, 'f-1').allow).toBe(false);
    });

    it('prove blocks even when spec is updated', () => {
      state.featureStarted('f-1');
      state.featureSpecUpdated('f-1');
      expect(evaluateMustProve(state, 'f-1').allow).toBe(false);
      expect(evaluateMustUpdateSpec(state, 'f-1').allow).toBe(true);
    });

    it('spec blocks even when proved', () => {
      state.featureStarted('f-1');
      state.featureProved('f-1');
      expect(evaluateMustProve(state, 'f-1').allow).toBe(true);
      expect(evaluateMustUpdateSpec(state, 'f-1').allow).toBe(false);
    });

    it('both allow when proved and spec updated', () => {
      state.featureStarted('f-1');
      state.featureProved('f-1');
      state.featureSpecUpdated('f-1');
      expect(evaluateMustProve(state, 'f-1').allow).toBe(true);
      expect(evaluateMustUpdateSpec(state, 'f-1').allow).toBe(true);
    });
  });
});
