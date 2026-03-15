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
  });

  describe('featureStarted', () => {
    it('sets the current feature', () => {
      state.featureStarted('f-1');
      expect(state.hasActiveFeature()).toBe(true);
      expect(state.currentFeatureId).toBe('f-1');
    });

    it('creates a work state entry', () => {
      state.featureStarted('f-1');
      const ws = state.getFeatureState('f-1');
      expect(ws).toEqual({ featureId: 'f-1', proved: false, specUpdated: false });
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

    it('does not clear current if completing a different feature', () => {
      state.featureStarted('f-1');
      state.featureStarted('f-2');
      state.featureCompleted('f-1');
      expect(state.currentFeatureId).toBe('f-2');
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
    it('clears all state', () => {
      state.featureStarted('f-1');
      state.featureProved('f-1');
      state.featureStarted('f-2');

      state.reset();

      expect(state.hasActiveFeature()).toBe(false);
      expect(state.currentFeatureId).toBeNull();
      expect(state.getFeatureState('f-1')).toBeUndefined();
      expect(state.getFeatureState('f-2')).toBeUndefined();
    });
  });
});
