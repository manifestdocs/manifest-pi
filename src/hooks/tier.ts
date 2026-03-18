/**
 * Plan tier resolution — determines ceremony level after investigation.
 *
 * Pure functions, no Pi dependencies. The tier is computed from the plan
 * that investigation produced, not from a pre-investigation guess.
 */

export type PlanTier = 'auto' | 'tracked' | 'full';

export function countSpecCriteria(details: string | null): number {
  if (!details) return 0;
  return (details.match(/^- \[ \]/gm) ?? []).length;
}

export function detectEscalation(planText: string): boolean {
  return /\[COMPLEX\]/i.test(planText);
}

export function resolveTier(
  stepCount: number,
  criteriaCount: number,
  agentEscalated: boolean,
): PlanTier {
  if (agentEscalated) return 'full';
  if (stepCount >= 6) return 'full';
  if (criteriaCount >= 7) return 'full';
  if (stepCount <= 2 && criteriaCount <= 3) return 'auto';
  return 'tracked';
}
