/**
 * Tool registration index.
 *
 * Registers all Manifest tools with Pi's ExtensionAPI.
 */

import { Type } from '@sinclair/typebox';
import type { ManifestClient } from '../client.js';
import {
  handleListProjects,
  handleFindFeatures,
  handleGetFeature,
  handleGetActiveFeature,
  handleGetNextFeature,
  handleRenderFeatureTree,
} from './discovery.js';
import {
  handleStartFeature,
  handleUpdateFeature,
  handleProveFeature,
  handleCompleteFeature,
} from './work.js';

// Re-export handlers for direct use
export {
  handleListProjects,
  handleFindFeatures,
  handleGetFeature,
  handleGetActiveFeature,
  handleGetNextFeature,
  handleRenderFeatureTree,
  handleStartFeature,
  handleUpdateFeature,
  handleProveFeature,
  handleCompleteFeature,
};

/**
 * Register all Manifest tools with Pi.
 */
export function registerAllTools(pi: any, client: ManifestClient): void {
  registerDiscoveryTools(pi, client);
  registerWorkTools(pi, client);
}

function toolResult(text: string) {
  return { content: [{ type: 'text' as const, text }] };
}

// ============================================================
// Discovery Tools
// ============================================================

function registerDiscoveryTools(pi: any, client: ManifestClient): void {
  pi.registerTool({
    name: 'manifest_list_projects',
    description: 'List projects. If directory_path is provided, finds the project containing that directory.',
    promptSnippet: 'List Manifest projects (auto-detect from directory)',
    parameters: Type.Object({
      directory_path: Type.Optional(Type.String({
        description: 'Directory path to find the project for (auto-discovery)',
      })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleListProjects(client, params);
      return toolResult(text);
    },
  });

  pi.registerTool({
    name: 'manifest_find_features',
    description: 'Find features by project, state, or search query. Returns summaries only.',
    promptSnippet: 'Search Manifest features by query, state, or project',
    parameters: Type.Object({
      project_id: Type.Optional(Type.String({ description: 'Project UUID to filter by' })),
      version_id: Type.Optional(Type.String({ description: 'Version UUID to filter by' })),
      state: Type.Optional(Type.String({ description: "State filter: 'proposed', 'in_progress', 'implemented', 'archived'" })),
      query: Type.Optional(Type.String({ description: 'Search query for title and details' })),
      limit: Type.Optional(Type.Number({ description: 'Max results to return' })),
      offset: Type.Optional(Type.Number({ description: 'Number to skip for pagination' })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleFindFeatures(client, params);
      return toolResult(text);
    },
  });

  pi.registerTool({
    name: 'manifest_get_feature',
    description: 'Get detailed feature spec with hierarchical context. Returns breadcrumb with ancestor context.',
    promptSnippet: 'Get full Manifest feature details with context',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID (e.g., MAN-42)' }),
      include_history: Type.Optional(Type.Boolean({ description: 'Include implementation history. Default false.' })),
      depth: Type.Optional(Type.String({ description: "Context depth: 'shallow', 'standard', or 'deep'" })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleGetFeature(client, params);
      return toolResult(text);
    },
  });

  pi.registerTool({
    name: 'manifest_get_active_feature',
    description: 'Get the feature currently selected in the Manifest app. Call this first when the user says "this feature" or "work on this".',
    promptSnippet: 'Get the active/selected feature from Manifest UI',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
    }),
    async execute(_id: string, params: any) {
      const text = await handleGetActiveFeature(client, params);
      return toolResult(text);
    },
  });

  pi.registerTool({
    name: 'manifest_get_next_feature',
    description: 'Get the highest-priority workable feature. Use ONLY when the user says "next feature" or "what\'s next".',
    promptSnippet: 'Get next priority feature to work on',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
      version_id: Type.Optional(Type.String({ description: 'Optional version UUID to filter by' })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleGetNextFeature(client, params);
      return toolResult(text);
    },
  });

  pi.registerTool({
    name: 'manifest_render_feature_tree',
    description: 'Render the feature tree as ASCII art with state symbols.',
    promptSnippet: 'Display Manifest feature tree hierarchy',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
      max_depth: Type.Optional(Type.Number({ description: 'Max depth (0 = unlimited). Default 0.' })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleRenderFeatureTree(client, params);
      return toolResult(text);
    },
  });
}

// ============================================================
// Work Tools
// ============================================================

function registerWorkTools(pi: any, client: ManifestClient): void {
  pi.registerTool({
    name: 'manifest_start_feature',
    description: 'Start work on a feature. Transitions to in_progress and records your claim. MUST be called before implementing.',
    promptSnippet: 'Claim and start working on a Manifest feature',
    promptGuidelines: [
      'ALWAYS call manifest_start_feature before implementing a feature.',
      'After starting, follow the spec returned — it is your implementation contract.',
      'Call manifest_prove_feature with test results, then manifest_complete_feature when done.',
    ],
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      agent_type: Type.Optional(Type.String({ description: "Agent type. Defaults to 'pi'." })),
      force: Type.Optional(Type.Boolean({ description: 'Force start even if claimed. Default false.' })),
      claim_metadata: Type.Optional(Type.String({ description: 'JSON metadata (branch, worktree, etc.)' })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleStartFeature(client, params);
      return toolResult(text);
    },
  });

  pi.registerTool({
    name: 'manifest_update_feature',
    description: 'Update any feature field: title, details, state, priority, parent, version. Use to update specs during/after implementation.',
    promptSnippet: 'Update a Manifest feature (details, state, priority, etc.)',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      title: Type.Optional(Type.String({ description: 'New title' })),
      details: Type.Optional(Type.String({ description: 'New details/spec' })),
      desired_details: Type.Optional(Type.String({ description: 'Proposed changes for human review' })),
      details_summary: Type.Optional(Type.String({ description: 'Short summary for root features' })),
      state: Type.Optional(Type.String({ description: "New state: 'proposed', 'blocked', 'in_progress', 'archived'" })),
      priority: Type.Optional(Type.Number({ description: 'Priority (lower = first)' })),
      parent_id: Type.Optional(Type.String({ description: 'Move to different parent UUID' })),
      target_version_id: Type.Optional(Type.String({ description: 'Assign to version UUID' })),
      clear_version: Type.Optional(Type.Boolean({ description: 'Unassign from version' })),
      blocked_by: Type.Optional(Type.Array(Type.String(), { description: 'Feature IDs that block this' })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleUpdateFeature(client, params);
      return toolResult(text);
    },
  });

  pi.registerTool({
    name: 'manifest_prove_feature',
    description: 'Record test evidence for a feature. Creates a proof with command, exit code, and structured results.',
    promptSnippet: 'Record test proof for a Manifest feature',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      command: Type.String({ description: "Test command run (e.g., 'vitest run')" }),
      exit_code: Type.Number({ description: 'Process exit code (0 = pass)' }),
      output: Type.Optional(Type.String({ description: 'Raw stdout/stderr (max 10K chars)' })),
      test_suites: Type.Optional(Type.Array(Type.Object({
        name: Type.String({ description: 'Suite name' }),
        file: Type.Optional(Type.String({ description: 'Source file path' })),
        tests: Type.Array(Type.Object({
          name: Type.String({ description: 'Test name' }),
          state: Type.String({ description: "'passed', 'failed', 'errored', 'skipped'" }),
          file: Type.Optional(Type.String()),
          line: Type.Optional(Type.Number()),
          duration_ms: Type.Optional(Type.Number()),
          message: Type.Optional(Type.String()),
        })),
      }), { description: 'Structured test results grouped by suite (preferred)' })),
      evidence: Type.Optional(Type.Array(Type.Object({
        path: Type.String({ description: 'File path' }),
        note: Type.Optional(Type.String({ description: 'Why this is evidence' })),
      }))),
      commit_sha: Type.Optional(Type.String({ description: 'Git commit SHA at time of proving' })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleProveFeature(client, params);
      return toolResult(text);
    },
  });

  pi.registerTool({
    name: 'manifest_complete_feature',
    description: 'Mark work as done. Records history with summary and commits, sets state to implemented.',
    promptSnippet: 'Complete a Manifest feature with summary and commits',
    promptGuidelines: [
      'ALWAYS call manifest_prove_feature before manifest_complete_feature.',
      'ALWAYS call manifest_update_feature to update the spec before completing.',
      'Include key decisions and rationale in the summary.',
    ],
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      summary: Type.String({ description: 'Work summary. First line = headline. Include decisions, deviations, discoveries.' }),
      commits: Type.Array(Type.Union([
        Type.String(),
        Type.Object({
          sha: Type.String(),
          message: Type.String(),
        }),
      ]), { description: 'Git commit SHAs or {sha, message} objects' }),
      backfill: Type.Optional(Type.Boolean({ description: 'Skip proof/spec requirements for bootstrapping. Default false.' })),
    }),
    async execute(_id: string, params: any) {
      const text = await handleCompleteFeature(client, params);
      return toolResult(text);
    },
  });
}
