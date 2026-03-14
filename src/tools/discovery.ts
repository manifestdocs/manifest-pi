/**
 * Discovery tools — orient, find, and inspect features.
 */

import type { ManifestClient } from '../client.js';
import { renderTree, stateSymbol, markdownTable, lodBreadcrumb } from '../format.js';

// ============================================================
// list_projects
// ============================================================

interface ListProjectsParams {
  directory_path?: string;
}

export async function handleListProjects(
  client: ManifestClient,
  params: ListProjectsParams,
): Promise<string> {
  if (params.directory_path) {
    const resp = await client.listProjectsByDirectory(params.directory_path);
    return formatResponse(resp);
  }
  const projects = await client.listProjects();
  if (projects.length === 0) return 'No projects found.';
  if (projects.length === 1) return formatResponse(projects[0]);
  const rows = projects.map((p: any) => [p.id, p.name, p.description ?? '']);
  return markdownTable(['ID', 'Name', 'Description'], rows);
}

// ============================================================
// find_features
// ============================================================

interface FindFeaturesParams {
  project_id?: string;
  version_id?: string;
  state?: string;
  query?: string;
  search_mode?: string;
  limit?: number;
  offset?: number;
}

export async function handleFindFeatures(
  client: ManifestClient,
  params: FindFeaturesParams,
): Promise<string> {
  const features = await client.findFeatures(params) as any[];
  if (!features || features.length === 0) return 'No features found.';

  const rows = features.map((f: any) => [
    f.display_id ?? f.id.slice(0, 8),
    stateSymbol(f.state),
    String(f.priority),
    f.title,
  ]);
  return markdownTable(['ID', 'State', 'P', 'Title'], rows);
}

// ============================================================
// get_feature
// ============================================================

interface GetFeatureParams {
  feature_id: string;
  include_history?: boolean;
  depth?: string;
}

export async function handleGetFeature(
  client: ManifestClient,
  params: GetFeatureParams,
): Promise<string> {
  const ctx = await client.getFeatureContext(params.feature_id);
  const parts: string[] = [];

  // Header
  parts.push(`Feature: '${ctx.title}' (${ctx.state})`);
  if (ctx.display_id) parts.push(`Display ID: ${ctx.display_id}`);
  parts.push(`ID: ${ctx.id}`);
  parts.push(`Priority: ${ctx.priority}`);
  if (ctx.parent) parts.push(`Parent: ${ctx.parent.title}`);

  // Breadcrumb context
  if (ctx.breadcrumb.length > 0) {
    const budgeted = lodBreadcrumb(ctx.breadcrumb);
    const withDetails = budgeted.filter((b) => b.details);
    if (withDetails.length > 0) {
      parts.push('');
      parts.push('## Ancestor Context');
      for (const item of withDetails) {
        parts.push(`### ${item.title}`);
        parts.push(item.details!);
      }
    }
  }

  // Details
  if (ctx.details) {
    parts.push('');
    parts.push('## Details');
    parts.push(ctx.details);
  }

  // Desired details (change request)
  if (ctx.desired_details) {
    parts.push('');
    parts.push('## Desired Changes');
    parts.push(ctx.desired_details);
  }

  // Children
  if (ctx.children.length > 0) {
    parts.push('');
    parts.push('## Children');
    for (const child of ctx.children) {
      parts.push(`  ${stateSymbol(child.state)} ${child.title}`);
    }
  }

  // Siblings
  if (ctx.siblings.length > 0) {
    parts.push('');
    parts.push('## Siblings');
    for (const sib of ctx.siblings) {
      parts.push(`  ${stateSymbol(sib.state)} ${sib.title}`);
    }
  }

  // History
  if (params.include_history || params.depth === 'deep') {
    const history = await client.getFeatureHistory(params.feature_id);
    if (history.length > 0) {
      parts.push('');
      parts.push('## History');
      for (const entry of history) {
        parts.push(`- ${entry.created_at}: ${entry.summary}`);
      }
    }
  }

  return parts.join('\n');
}

// ============================================================
// get_active_feature
// ============================================================

interface GetActiveFeatureParams {
  project_id: string;
}

export async function handleGetActiveFeature(
  client: ManifestClient,
  params: GetActiveFeatureParams,
): Promise<string> {
  const result = await client.getActiveFeature(params.project_id) as any;
  if (!result || !result.id) return 'No feature is currently selected in the Manifest app.';
  return formatResponse(result);
}

// ============================================================
// get_next_feature
// ============================================================

interface GetNextFeatureParams {
  project_id: string;
  version_id?: string;
}

export async function handleGetNextFeature(
  client: ManifestClient,
  params: GetNextFeatureParams,
): Promise<string> {
  const result = await client.getNextFeature(params.project_id, params.version_id) as any;
  if (!result || !result.id) return 'No workable features found.';
  return formatResponse(result);
}

// ============================================================
// render_feature_tree
// ============================================================

interface RenderFeatureTreeParams {
  project_id: string;
  max_depth?: number;
}

export async function handleRenderFeatureTree(
  client: ManifestClient,
  params: RenderFeatureTreeParams,
): Promise<string> {
  const tree = await client.getFeatureTree(params.project_id);
  if (!tree || tree.length === 0) return 'No features found.';

  // Try to get key_prefix from the project — best effort
  const keyPrefix = ''; // Will be resolved by the tool registration layer
  const output = renderTree(tree, params.max_depth ?? 0, keyPrefix);
  return output;
}

// ============================================================
// Helpers
// ============================================================

function formatResponse(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}
