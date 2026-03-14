/**
 * Verification tools — verify implementation against spec, record results.
 */

import type { ManifestClient } from '../client.js';
import { ApiError } from '../client.js';

// ============================================================
// verify_feature
// ============================================================

interface VerifyFeatureParams {
  feature_id: string;
  commit_range?: string;
}

export async function handleVerifyFeature(
  client: ManifestClient,
  params: VerifyFeatureParams,
): Promise<string> {
  try {
    const result = await client.verifyFeature(params.feature_id, params.commit_range);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// record_verification
// ============================================================

interface RecordVerificationParams {
  feature_id: string;
  comments: Array<{
    severity: string;
    title: string;
    body: string;
    file?: string;
  }>;
}

export async function handleRecordVerification(
  client: ManifestClient,
  params: RecordVerificationParams,
): Promise<string> {
  const { feature_id, ...input } = params;
  try {
    const result = await client.recordVerification(feature_id, input as any);
    const count = params.comments.length;
    if (count === 0) {
      return 'Verification recorded: passed (no comments)';
    }
    return `Verification recorded: ${count} comment${count === 1 ? '' : 's'}\n${formatResponse(result)}`;
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// get_feature_proof
// ============================================================

interface GetFeatureProofParams {
  feature_id: string;
}

export async function handleGetFeatureProof(
  client: ManifestClient,
  params: GetFeatureProofParams,
): Promise<string> {
  try {
    const result = await client.getFeatureProof(params.feature_id);
    return formatResponse(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return `Error (${err.status}): ${err.body}`;
    }
    throw err;
  }
}

// ============================================================
// Helpers
// ============================================================

function formatResponse(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}
