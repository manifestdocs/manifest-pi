import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowState } from '../../src/hooks/state.js';
import {
  evaluateMustStart,
  evaluateMustProve,
  evaluateMustUpdateSpec,
  evaluateSpecQuality,
  evaluateReadyForImplementation,
  evaluateReadyForCompletion,
} from '../../src/hooks/gates.js';

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

  describe('evaluateSpecQuality', () => {
    const validSpec = `As a user, I can create a new project so that I can track features.

The user fills in a project name and clicks create. A new project is initialized with default settings.

- [ ] Project name field is required
- [ ] Clicking create calls the API endpoint
- [ ] Success redirects to the new project page`;

    it('allows a valid spec', () => {
      const decision = evaluateSpecQuality(validSpec);
      expect(decision.allow).toBe(true);
    });

    it('blocks null details', () => {
      const decision = evaluateSpecQuality(null);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('too short');
    });

    it('blocks empty string', () => {
      const decision = evaluateSpecQuality('');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('too short');
    });

    it('blocks details under 50 chars', () => {
      const decision = evaluateSpecQuality('As a user, I can do things.');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('too short');
    });

    it('blocks missing user story', () => {
      const noStory = `This feature lets users create projects.

The user fills in a project name and clicks create.

- [ ] Project name field is required
- [ ] Clicking create calls the API endpoint`;

      const decision = evaluateSpecQuality(noStory);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('user story');
    });

    it('blocks missing acceptance criteria', () => {
      const noCriteria = `As a user, I can create a new project so that I can track features.

The user fills in a project name and clicks create. A new project is initialized with default settings and configuration.`;

      const decision = evaluateSpecQuality(noCriteria);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('acceptance criteria');
    });

    it('accepts "As an" (with article variation)', () => {
      const spec = `As an admin, I can delete projects so that I can remove unused data.

Admins see a delete button on the project settings page.

- [ ] Delete button is visible to admin users only`;

      const decision = evaluateSpecQuality(spec);
      expect(decision.allow).toBe(true);
    });
  });

  describe('evaluateReadyForImplementation', () => {
    it('allows when not in team mode', () => {
      state.featureStarted('f-1');
      const decision = evaluateReadyForImplementation(state, 'f-1');
      expect(decision.allow).toBe(true);
    });

    it('blocks when in team mode and phase is speccing', () => {
      state.enterTeamMode('f-1');
      const decision = evaluateReadyForImplementation(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('spec is approved');
      expect(decision.reason).toContain('DO NOT attempt');
    });

    it('allows when in team mode and phase is spec_approved', () => {
      state.enterTeamMode('f-1');
      state.advancePhase('f-1', 'spec_approved');
      const decision = evaluateReadyForImplementation(state, 'f-1');
      expect(decision.allow).toBe(true);
    });

    it('blocks unknown features in team mode', () => {
      state.enterTeamMode('f-1');
      const decision = evaluateReadyForImplementation(state, 'unknown');
      expect(decision.allow).toBe(false);
    });
  });

  describe('evaluateReadyForCompletion', () => {
    it('blocks unknown features', () => {
      const decision = evaluateReadyForCompletion(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('No workflow state');
    });

    it('blocks when not in Critical Reviewer phase', () => {
      state.featureStarted('f-1');
      state.advancePhase('f-1', 'implementing');
      const decision = evaluateReadyForCompletion(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('Critical Reviewer phase');
    });

    it('blocks when in Critical Reviewer phase but not verified', () => {
      state.featureStarted('f-1');
      state.advancePhase('f-1', 'critical_reviewing');
      const decision = evaluateReadyForCompletion(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('passing proof');
    });

    it('blocks when in Critical Reviewer phase with proof but not verified', () => {
      state.featureStarted('f-1');
      state.advancePhase('f-1', 'critical_reviewing');
      state.featureProved('f-1');
      const decision = evaluateReadyForCompletion(state, 'f-1');
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('Critical Reviewer');
    });

    it('allows when in Critical Reviewer phase and verified', () => {
      state.featureStarted('f-1');
      state.advancePhase('f-1', 'critical_reviewing');
      state.featureProved('f-1');
      state.setVerified('f-1', true);
      const decision = evaluateReadyForCompletion(state, 'f-1');
      expect(decision.allow).toBe(true);
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
