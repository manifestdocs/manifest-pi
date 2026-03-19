import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowState } from '../../src/hooks/state.js';

describe('WorkflowState', () => {
  let state: WorkflowState;

  beforeEach(() => {
    state = new WorkflowState();
  });

  it('starts with no active feature', () => {
    expect(state.hasActiveFeature()).toBe(false);
    expect(state.currentFeatureId).toBeNull();
    expect(state.teamMode).toBe(false);
  });

  describe('featureStarted', () => {
    it('sets the current feature', () => {
      state.featureStarted('f-1');
      expect(state.hasActiveFeature()).toBe(true);
      expect(state.currentFeatureId).toBe('f-1');
    });

    it('creates a work state entry with default phase', () => {
      state.featureStarted('f-1');
      const ws = state.getFeatureState('f-1');
      expect(ws).toMatchObject({
        featureId: 'f-1',
        proved: false,
        specUpdated: false,
        phase: 'speccing',
        verified: false,
        dispatched: false,
      });
      expect(ws?.claimedAt).toBeDefined();
      expect(typeof ws?.claimedAt).toBe('string');
    });

    it('switches current when starting a second feature', () => {
      state.featureStarted('f-1');
      state.featureStarted('f-2');
      expect(state.currentFeatureId).toBe('f-2');
      // first feature state still exists
      expect(state.getFeatureState('f-1')).toBeDefined();
    });

    it('is idempotent — does not reset proved/specUpdated', () => {
      state.featureStarted('f-1');
      state.featureProved('f-1');
      state.featureSpecUpdated('f-1');
      state.featureStarted('f-1');
      const ws = state.getFeatureState('f-1');
      expect(ws?.proved).toBe(true);
      expect(ws?.specUpdated).toBe(true);
    });
  });

  describe('featureProved', () => {
    it('marks a started feature as proved', () => {
      state.featureStarted('f-1');
      state.featureProved('f-1');
      expect(state.getFeatureState('f-1')?.proved).toBe(true);
    });

    it('is a no-op for unknown features', () => {
      state.featureProved('unknown');
      expect(state.getFeatureState('unknown')).toBeUndefined();
    });
  });

  describe('featureSpecUpdated', () => {
    it('marks a started feature spec as updated', () => {
      state.featureStarted('f-1');
      state.featureSpecUpdated('f-1');
      expect(state.getFeatureState('f-1')?.specUpdated).toBe(true);
    });

    it('is a no-op for unknown features', () => {
      state.featureSpecUpdated('unknown');
      expect(state.getFeatureState('unknown')).toBeUndefined();
    });
  });

  describe('featureCompleted', () => {
    it('removes the feature state entry', () => {
      state.featureStarted('f-1');
      state.featureCompleted('f-1');
      expect(state.getFeatureState('f-1')).toBeUndefined();
    });

    it('clears current if completing the current feature', () => {
      state.featureStarted('f-1');
      state.featureCompleted('f-1');
      expect(state.hasActiveFeature()).toBe(false);
      expect(state.currentFeatureId).toBeNull();
    });

    it('exits team mode when completing current feature', () => {
      state.enterTeamMode('f-1');
      expect(state.teamMode).toBe(true);
      state.featureCompleted('f-1');
      expect(state.teamMode).toBe(false);
    });

    it('does not clear current if completing a different feature', () => {
      state.featureStarted('f-1');
      state.featureStarted('f-2');
      state.featureCompleted('f-1');
      expect(state.currentFeatureId).toBe('f-2');
    });
  });

  describe('teamMode', () => {
    it('enterTeamMode sets teamMode and starts the feature', () => {
      state.enterTeamMode('f-1');
      expect(state.teamMode).toBe(true);
      expect(state.currentFeatureId).toBe('f-1');
      expect(state.hasActiveFeature()).toBe(true);
    });

    it('exitTeamMode clears teamMode but keeps feature', () => {
      state.enterTeamMode('f-1');
      state.exitTeamMode();
      expect(state.teamMode).toBe(false);
      expect(state.currentFeatureId).toBe('f-1');
    });
  });

  describe('phase tracking', () => {
    it('getPhase returns phase for tracked feature', () => {
      state.featureStarted('f-1');
      expect(state.getPhase('f-1')).toBe('speccing');
    });

    it('getPhase returns undefined for unknown feature', () => {
      expect(state.getPhase('unknown')).toBeUndefined();
    });

    it('advancePhase changes the phase', () => {
      state.featureStarted('f-1');
      state.advancePhase('f-1', 'spec_approved');
      expect(state.getPhase('f-1')).toBe('spec_approved');
    });

    it('supports full phase lifecycle', () => {
      state.featureStarted('f-1');
      expect(state.getPhase('f-1')).toBe('speccing');

      state.advancePhase('f-1', 'spec_approved');
      expect(state.getPhase('f-1')).toBe('spec_approved');

      state.advancePhase('f-1', 'implementing');
      expect(state.getPhase('f-1')).toBe('implementing');

      state.advancePhase('f-1', 'reviewing');
      expect(state.getPhase('f-1')).toBe('reviewing');

      state.advancePhase('f-1', 'complete');
      expect(state.getPhase('f-1')).toBe('complete');
    });
  });

  describe('dispatched flag', () => {
    it('setDispatched updates the flag', () => {
      state.featureStarted('f-1');
      state.setDispatched('f-1', true);
      expect(state.getFeatureState('f-1')?.dispatched).toBe(true);
      state.setDispatched('f-1', false);
      expect(state.getFeatureState('f-1')?.dispatched).toBe(false);
    });
  });

  describe('verified flag', () => {
    it('setVerified updates the flag', () => {
      state.featureStarted('f-1');
      state.setVerified('f-1', true);
      expect(state.getFeatureState('f-1')?.verified).toBe(true);
    });
  });

  describe('multiple features in different phases', () => {
    it('tracks features independently', () => {
      state.featureStarted('f-1');
      state.featureStarted('f-2');
      state.featureStarted('f-3');

      state.advancePhase('f-1', 'implementing');
      state.advancePhase('f-2', 'reviewing');
      state.featureProved('f-3');

      expect(state.getPhase('f-1')).toBe('implementing');
      expect(state.getPhase('f-2')).toBe('reviewing');
      expect(state.getPhase('f-3')).toBe('speccing');
      expect(state.getFeatureState('f-3')?.proved).toBe(true);
    });
  });

  describe('full lifecycle', () => {
    it('tracks start -> prove -> update -> complete', () => {
      state.featureStarted('f-1');
      expect(state.getFeatureState('f-1')?.proved).toBe(false);
      expect(state.getFeatureState('f-1')?.specUpdated).toBe(false);

      state.featureProved('f-1');
      expect(state.getFeatureState('f-1')?.proved).toBe(true);

      state.featureSpecUpdated('f-1');
      expect(state.getFeatureState('f-1')?.specUpdated).toBe(true);

      state.featureCompleted('f-1');
      expect(state.getFeatureState('f-1')).toBeUndefined();
      expect(state.hasActiveFeature()).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears all state including teamMode', () => {
      state.enterTeamMode('f-1');
      state.featureProved('f-1');
      state.featureStarted('f-2');

      state.reset();

      expect(state.hasActiveFeature()).toBe(false);
      expect(state.currentFeatureId).toBeNull();
      expect(state.teamMode).toBe(false);
      expect(state.getFeatureState('f-1')).toBeUndefined();
      expect(state.getFeatureState('f-2')).toBeUndefined();
    });
  });
});
