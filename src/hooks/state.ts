/**
 * Session-scoped workflow state tracker.
 *
 * Pure TypeScript — no Pi dependencies. Tracks which features
 * have been started, proved, and had their spec updated.
 */

export interface FeatureWorkState {
  featureId: string;
  proved: boolean;
  specUpdated: boolean;
}

export class WorkflowState {
  private features = new Map<string, FeatureWorkState>();
  private _currentFeatureId: string | null = null;

  get currentFeatureId(): string | null {
    return this._currentFeatureId;
  }

  hasActiveFeature(): boolean {
    return this._currentFeatureId !== null;
  }

  featureStarted(featureId: string): void {
    this._currentFeatureId = featureId;
    if (!this.features.has(featureId)) {
      this.features.set(featureId, { featureId, proved: false, specUpdated: false });
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
    }
  }

  getFeatureState(featureId: string): FeatureWorkState | undefined {
    return this.features.get(featureId);
  }

  reset(): void {
    this.features.clear();
    this._currentFeatureId = null;
  }
}
