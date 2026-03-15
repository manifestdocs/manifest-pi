/**
 * Session-scoped workflow state tracker.
 *
 * Pure TypeScript — no Pi dependencies. Tracks which features
 * have been started, proved, and had their spec updated.
 * Supports team mode for deterministic feature workflow.
 */

export type WorkflowPhase = 'speccing' | 'spec_approved' | 'implementing' | 'reviewing' | 'complete';

export interface FeatureWorkState {
  featureId: string;
  proved: boolean;
  specUpdated: boolean;
  phase: WorkflowPhase;
  verified: boolean;
  dispatched: boolean;
}

export class WorkflowState {
  private features = new Map<string, FeatureWorkState>();
  private _currentFeatureId: string | null = null;
  private _teamMode = false;

  get currentFeatureId(): string | null {
    return this._currentFeatureId;
  }

  get teamMode(): boolean {
    return this._teamMode;
  }

  hasActiveFeature(): boolean {
    return this._currentFeatureId !== null;
  }

  enterTeamMode(featureId: string): void {
    this._teamMode = true;
    this.featureStarted(featureId);
  }

  exitTeamMode(): void {
    this._teamMode = false;
  }

  featureStarted(featureId: string): void {
    this._currentFeatureId = featureId;
    if (!this.features.has(featureId)) {
      this.features.set(featureId, {
        featureId,
        proved: false,
        specUpdated: false,
        phase: 'speccing',
        verified: false,
        dispatched: false,
      });
    }
  }

  featureProved(featureId: string): void {
    const state = this.features.get(featureId);
    if (state) {
      state.proved = true;
    }
  }

  featureSpecUpdated(featureId: string): void {
    const state = this.features.get(featureId);
    if (state) {
      state.specUpdated = true;
    }
  }

  featureCompleted(featureId: string): void {
    this.features.delete(featureId);
    if (this._currentFeatureId === featureId) {
      this._currentFeatureId = null;
      this._teamMode = false;
    }
  }

  getFeatureState(featureId: string): FeatureWorkState | undefined {
    return this.features.get(featureId);
  }

  getPhase(featureId: string): WorkflowPhase | undefined {
    return this.features.get(featureId)?.phase;
  }

  advancePhase(featureId: string, phase: WorkflowPhase): void {
    const state = this.features.get(featureId);
    if (state) {
      state.phase = phase;
    }
  }

  setDispatched(featureId: string, dispatched: boolean): void {
    const state = this.features.get(featureId);
    if (state) {
      state.dispatched = dispatched;
    }
  }

  setVerified(featureId: string, verified: boolean): void {
    const state = this.features.get(featureId);
    if (state) {
      state.verified = verified;
    }
  }

  reset(): void {
    this.features.clear();
    this._currentFeatureId = null;
    this._teamMode = false;
  }
}
