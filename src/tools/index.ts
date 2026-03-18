/**
 * Tool registration index.
 *
 * Registers all Manifest tools with Pi's ExtensionAPI.
 */

import { Type } from '@sinclair/typebox';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import type { ManifestClient } from '../client.js';
import {
  handleListProjects,
  handleFindFeatures,
  handleGetFeature,

  handleGetNextFeature,
  handleRenderFeatureTree,
  handleOrient,
} from './discovery.js';
import {
  handleStartFeature,
  handleAssessPlan,
  handleUpdateFeature,
  handleProveFeature,
  handleCompleteFeature,
} from './work.js';
import {
  handleInitProject,
  handleAddProjectDirectory,
  handleCreateFeature,
  handleDeleteFeature,
  handlePlan,
  handleGetProjectHistory,
  handleGenerateFeatureTree,
  handleSync,
} from './setup.js';
import {
  handleListVersions,
  handleCreateVersion,
  handleSetFeatureVersion,
  handleReleaseVersion,
} from './versions.js';
import {
  handleVerifyFeature,
  handleRecordVerification,
  handleGetFeatureProof,
} from './verification.js';

// Re-export all handlers for direct use
export {
  handleListProjects,
  handleFindFeatures,
  handleGetFeature,

  handleGetNextFeature,
  handleRenderFeatureTree,
  handleOrient,
  handleStartFeature,
  handleAssessPlan,
  handleUpdateFeature,
  handleProveFeature,
  handleCompleteFeature,
  handleInitProject,
  handleAddProjectDirectory,
  handleCreateFeature,
  handleDeleteFeature,
  handlePlan,
  handleGetProjectHistory,
  handleGenerateFeatureTree,
  handleSync,
  handleListVersions,
  handleCreateVersion,
  handleSetFeatureVersion,
  handleReleaseVersion,
  handleVerifyFeature,
  handleRecordVerification,
  handleGetFeatureProof,
};

/**
 * Register all Manifest tools with Pi.
 */
export function registerAllTools(pi: ExtensionAPI, client: ManifestClient): void {
  registerDiscoveryTools(pi, client);
  registerWorkTools(pi, client);
  registerSetupTools(pi, client);
  registerVersionTools(pi, client);
  registerVerificationTools(pi, client);
}

function toolResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: undefined };
}

function createExecuteHandler<P>(
  client: ManifestClient,
  handler: (client: ManifestClient, params: P) => Promise<string>,
) {
  return async (_id: string, params: unknown) => {
    const text = await handler(client, params as P);
    return toolResult(text);
  };
}

// ============================================================
// Discovery Tools
// ============================================================

function registerDiscoveryTools(pi: ExtensionAPI, client: ManifestClient): void {
  pi.registerTool({
    name: 'manifest_list_projects',
    description: 'List projects. If directory_path is provided, finds the project containing that directory.',
    label: 'List Manifest projects (auto-detect from directory)',
    parameters: Type.Object({
      directory_path: Type.Optional(Type.String({
        description: 'Directory path to find the project for (auto-discovery)',
      })),
    }),
    execute: createExecuteHandler(client, handleListProjects),
  });

  pi.registerTool({
    name: 'manifest_find_features',
    description: 'Find features by project, state, or search query. Returns summaries only.',
    label: 'Search Manifest features by query, state, or project',
    parameters: Type.Object({
      project_id: Type.Optional(Type.String({ description: 'Project UUID to filter by' })),
      version_id: Type.Optional(Type.String({ description: 'Version UUID to filter by' })),
      state: Type.Optional(StringEnum(["proposed", "blocked", "in_progress", "implemented", "archived"] as const, { description: "State filter" })),
      query: Type.Optional(Type.String({ description: 'Search query for title and details' })),
      limit: Type.Optional(Type.Number({ description: 'Max results to return' })),
      offset: Type.Optional(Type.Number({ description: 'Number to skip for pagination' })),
    }),
    execute: createExecuteHandler(client, handleFindFeatures),
  });

  pi.registerTool({
    name: 'manifest_get_feature',
    description: 'Get feature details. Default view is a compact card. Use view="full" for breadcrumb context, siblings, and history.',
    label: 'Get Manifest feature details',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID (e.g., MAN-42)' }),
      view: Type.Optional(StringEnum(["card", "full"] as const, { description: 'Display format. "card" (default): compact feature card. "full": includes breadcrumb, siblings, history.' })),
      include_history: Type.Optional(Type.Boolean({ description: 'Include implementation history. Only used with view="full". Default false.' })),
    }),
    execute: createExecuteHandler(client, handleGetFeature),
  });

  pi.registerTool({
    name: 'manifest_get_next_feature',
    description: 'Get the highest-priority workable feature. Use ONLY when the user says "next feature" or "what\'s next".',
    label: 'Get next priority feature to work on',
    parameters: Type.Object({
      project_id: Type.Optional(Type.String({ description: 'Project UUID' })),
      directory_path: Type.Optional(Type.String({ description: 'Directory path for auto-discovery (alternative to project_id)' })),
      version_id: Type.Optional(Type.String({ description: 'Optional version UUID to filter by' })),
    }),
    execute: createExecuteHandler(client, handleGetNextFeature),
  });

  pi.registerTool({
    name: 'manifest_render_feature_tree',
    description: 'Render the feature tree as ASCII art with state symbols. Optionally filter by leaf state.',
    label: 'Display Manifest feature tree hierarchy',
    parameters: Type.Object({
      project_id: Type.Optional(Type.String({ description: 'Project UUID' })),
      directory_path: Type.Optional(Type.String({ description: 'Directory path for auto-discovery (alternative to project_id)' })),
      max_depth: Type.Optional(Type.Number({ description: 'Max depth (0 = unlimited). Default 0.' })),
      state: Type.Optional(StringEnum(["proposed", "blocked", "in_progress", "implemented", "archived"] as const, { description: "Filter tree to branches containing leaves in this state" })),
    }),
    execute: createExecuteHandler(client, handleRenderFeatureTree),
  });

  pi.registerTool({
    name: 'manifest_orient',
    description: 'Session bootloader. Returns project overview: feature tree (depth 2), work queue, recent activity. Call at session start.',
    label: 'Get full project orientation (tree, queue, history)',
    parameters: Type.Object({
      project_id: Type.Optional(Type.String({ description: 'Project UUID (optional if directory_path provided)' })),
      directory_path: Type.Optional(Type.String({ description: 'Directory path to auto-discover project' })),
    }),
    execute: createExecuteHandler(client, handleOrient),
  });
}

// ============================================================
// Work Tools
// ============================================================

function registerWorkTools(pi: ExtensionAPI, client: ManifestClient): void {
  pi.registerTool({
    name: 'manifest_start_feature',
    description: 'Start work on a feature. Transitions to in_progress and records your claim. MUST be called before implementing.',
    label: 'Claim and start working on a Manifest feature',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      agent_type: Type.Optional(StringEnum(["claude", "gemini", "codex", "pi", "copilot"] as const, { description: "Agent type. Defaults to 'pi'." })),
      force: Type.Optional(Type.Boolean({ description: 'Force start even if claimed. Default false.' })),
      claim_metadata: Type.Optional(Type.String({ description: 'JSON metadata (branch, worktree, etc.)' })),
    }),
    execute: createExecuteHandler(client, handleStartFeature),
  });

  pi.registerTool({
    name: 'manifest_assess_plan',
    description: 'Assess a numbered implementation plan for a feature and return a graded ceremony tier: auto, tracked, or full. Use after manifest_start_feature.',
    label: 'Assess a Manifest implementation plan',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      plan: Type.String({ description: 'Implementation plan text. Prefer a `Plan:` header followed by numbered steps. Include `[COMPLEX]` to escalate.' }),
    }),
    execute: createExecuteHandler(client, handleAssessPlan),
  });

  pi.registerTool({
    name: 'manifest_update_feature',
    description: 'Update any feature field: title, details, state, priority, parent, version.',
    label: 'Update a Manifest feature (details, state, priority, etc.)',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      title: Type.Optional(Type.String({ description: 'New title' })),
      details: Type.Optional(Type.String({ description: 'New details/spec' })),
      desired_details: Type.Optional(Type.String({ description: 'Proposed changes for human review' })),
      details_summary: Type.Optional(Type.String({ description: 'Short summary for root features' })),
      state: Type.Optional(StringEnum(["proposed", "blocked", "in_progress", "archived"] as const, { description: "New state" })),
      priority: Type.Optional(Type.Number({ description: 'Priority (lower = first)' })),
      parent_id: Type.Optional(Type.String({ description: 'Move to different parent UUID' })),
      target_version_id: Type.Optional(Type.String({ description: 'Assign to version UUID' })),
      clear_version: Type.Optional(Type.Boolean({ description: 'Unassign from version' })),
      blocked_by: Type.Optional(Type.Array(Type.String(), { description: 'Feature IDs that block this' })),
    }),
    execute: createExecuteHandler(client, handleUpdateFeature),
  });

  pi.registerTool({
    name: 'manifest_prove_feature',
    description: 'Record test evidence for a feature. Creates a proof with command, exit code, and structured results. IMPORTANT: Parse test output into individual test entries (one per test case). Use verbose flags (rspec --format documentation, pytest -v, go test -v) to get parseable output. Never collapse multiple tests into one entry.',
    label: 'Record test proof for a Manifest feature',
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
          state: StringEnum(["passed", "failed", "errored", "skipped"] as const, { description: "Test result state" }),
          file: Type.Optional(Type.String({ description: 'Source file path for the test case' })),
          line: Type.Optional(Type.Number({ description: '1-based source line number for the test case' })),
          duration_ms: Type.Optional(Type.Number({ description: 'Test duration in milliseconds' })),
          message: Type.Optional(Type.String({ description: 'Failure or diagnostic message' })),
        })),
      }), { description: 'Structured test results grouped by suite (preferred)' })),
      evidence: Type.Optional(Type.Array(Type.Object({
        path: Type.String({ description: 'File path' }),
        note: Type.Optional(Type.String({ description: 'Why this is evidence' })),
      }))),
      commit_sha: Type.Optional(Type.String({ description: 'Git commit SHA at time of proving' })),
    }),
    execute: createExecuteHandler(client, handleProveFeature),
  });

  pi.registerTool({
    name: 'manifest_complete_feature',
    description: 'Mark work as done. Records history with summary and commits, sets state to implemented.',
    label: 'Complete a Manifest feature with summary and commits',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      summary: Type.String({ description: 'Work summary. First line = headline.' }),
      commits: Type.Array(Type.Union([
        Type.String({ description: 'Git commit SHA' }),
        Type.Object({
          sha: Type.String({ description: 'Git commit SHA' }),
          message: Type.String({ description: 'Commit message' }),
        }),
      ]), { description: 'Git commit SHAs or {sha, message} objects' }),
      backfill: Type.Optional(Type.Boolean({ description: 'Skip proof/spec requirements. Default false.' })),
    }),
    execute: createExecuteHandler(client, handleCompleteFeature),
  });
}

// ============================================================
// Setup Tools
// ============================================================

function registerSetupTools(pi: ExtensionAPI, client: ManifestClient): void {
  pi.registerTool({
    name: 'manifest_init_project',
    description: 'Initialize a project from a directory. Analyzes codebase, creates project, returns size signals.',
    label: 'Initialize a Manifest project from a directory',
    parameters: Type.Object({
      directory_path: Type.String({ description: 'Absolute path to the project directory' }),
      skip_default_versions: Type.Optional(Type.Boolean({ description: 'Skip creating default versions. Default false.' })),
    }),
    execute: createExecuteHandler(client, handleInitProject),
  });

  pi.registerTool({
    name: 'manifest_add_project_directory',
    description: 'Associate an additional directory with a project (monorepo support).',
    label: 'Add a directory to a Manifest project',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
      path: Type.String({ description: 'Absolute directory path' }),
      git_remote: Type.Optional(Type.String({ description: 'Git remote URL' })),
      is_primary: Type.Optional(Type.Boolean({ description: 'Is primary directory. Default false.' })),
      instructions: Type.Optional(Type.String({ description: 'Directory-specific instructions' })),
    }),
    execute: createExecuteHandler(client, handleAddProjectDirectory),
  });

  pi.registerTool({
    name: 'manifest_create_feature',
    description: 'Create a single feature. Check find_features for duplicates first.',
    label: 'Create a new Manifest feature',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
      parent_id: Type.Optional(Type.String({ description: 'Parent feature UUID' })),
      title: Type.String({ description: 'Short capability name (2-5 words)' }),
      details: Type.Optional(Type.String({ description: 'Feature spec or shared context' })),
      state: Type.Optional(StringEnum(["proposed", "blocked", "in_progress", "implemented", "archived"] as const, { description: "Initial state. Default 'proposed'." })),
      priority: Type.Optional(Type.Number({ description: 'Priority (lower = first). Default 0.' })),
    }),
    execute: createExecuteHandler(client, handleCreateFeature),
  });

  pi.registerTool({
    name: 'manifest_delete_feature',
    description: 'Permanently delete a feature and descendants. Use only for archived features.',
    label: 'Delete an archived Manifest feature',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID' }),
    }),
    execute: createExecuteHandler(client, handleDeleteFeature),
  });

  pi.registerTool({
    name: 'manifest_decompose',
    description: 'Decompose a PRD or vision into a feature tree. Use confirm=false to preview, confirm=true to create.',
    label: 'Decompose a PRD into a Manifest feature tree',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
      features: Type.Array(Type.Recursive((Self) => Type.Object({
        title: Type.String({ description: 'Feature capability name' }),
        details: Type.Optional(Type.String({ description: 'Spec or shared context' })),
        priority: Type.Number({ description: 'Priority (lower = first)' }),
        state: Type.Optional(StringEnum(["proposed", "blocked", "in_progress", "implemented", "archived"] as const, { description: "Initial state. Default 'proposed'." })),
        children: Type.Array(Self, { description: 'Nested child features' }),
      })), { description: 'Proposed feature tree' }),
      confirm: Type.Boolean({ description: 'true to create, false to preview' }),
      target_version_id: Type.Optional(Type.String({ description: 'Version UUID for all features' })),
    }),
    execute: createExecuteHandler(client, handlePlan),
  });

  pi.registerTool({
    name: 'manifest_get_project_history',
    description: 'Get recent activity timeline. Display directly without reformatting.',
    label: 'Get Manifest project activity history',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
      feature_id: Type.Optional(Type.String({ description: 'Filter to feature and descendants' })),
      limit: Type.Optional(Type.Number({ description: 'Max entries. Default 20.' })),
    }),
    execute: createExecuteHandler(client, handleGetProjectHistory),
  });

  pi.registerTool({
    name: 'manifest_generate_feature_tree',
    description: 'Analyze a codebase directory and generate a proposed feature tree from its structure.',
    label: 'Generate Manifest feature tree from codebase analysis',
    parameters: Type.Object({
      directory_path: Type.String({ description: 'Absolute path to the project directory to analyze' }),
    }),
    execute: createExecuteHandler(client, handleGenerateFeatureTree),
  });

  pi.registerTool({
    name: 'manifest_sync',
    description: 'Reconcile the feature tree with git history. Returns sync proposals.',
    label: 'Sync Manifest features with git history',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
    }),
    execute: createExecuteHandler(client, handleSync),
  });
}

// ============================================================
// Version Tools
// ============================================================

function registerVersionTools(pi: ExtensionAPI, client: ManifestClient): void {
  pi.registerTool({
    name: 'manifest_list_versions',
    description: 'List versions with status indicators (next, planned, released).',
    label: 'List Manifest version roadmap',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
    }),
    execute: createExecuteHandler(client, handleListVersions),
  });

  pi.registerTool({
    name: 'manifest_create_version',
    description: 'Create a release milestone. Name must be semantic version (e.g., 0.2.0).',
    label: 'Create a Manifest version milestone',
    parameters: Type.Object({
      project_id: Type.String({ description: 'Project UUID' }),
      name: Type.String({ description: "Version name (e.g., '0.2.0')" }),
      description: Type.Optional(Type.String({ description: 'Version description' })),
    }),
    execute: createExecuteHandler(client, handleCreateVersion),
  });

  pi.registerTool({
    name: 'manifest_set_feature_version',
    description: 'Assign a feature to a version. Pass null to unassign.',
    label: 'Assign a Manifest feature to a version',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID' }),
      version_id: Type.Optional(Type.String({ description: 'Version UUID to assign. Omit to unassign.' })),
    }),
    execute: createExecuteHandler(client, handleSetFeatureVersion),
  });

  pi.registerTool({
    name: 'manifest_release_version',
    description: 'Mark a version as shipped.',
    label: 'Release a Manifest version',
    parameters: Type.Object({
      version_id: Type.String({ description: 'Version UUID' }),
    }),
    execute: createExecuteHandler(client, handleReleaseVersion),
  });
}

// ============================================================
// Verification Tools
// ============================================================

function registerVerificationTools(pi: ExtensionAPI, client: ManifestClient): void {
  pi.registerTool({
    name: 'manifest_verify_feature',
    description: 'Assemble spec + diff for checking implementation against spec. You are the LLM.',
    label: 'Verify a Manifest feature implementation against spec',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      commit_range: Type.Optional(Type.String({ description: "Git commit range (e.g., 'abc123..HEAD')" })),
    }),
    execute: createExecuteHandler(client, handleVerifyFeature),
  });

  pi.registerTool({
    name: 'manifest_record_verification',
    description: 'Store verification comments. Pass empty array if implementation satisfies spec.',
    label: 'Record verification results for a Manifest feature',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
      comments: Type.Array(Type.Object({
        severity: StringEnum(["critical", "major", "minor"] as const, { description: "Comment severity" }),
        title: Type.String({ description: 'One-line summary of the gap' }),
        body: Type.String({ description: 'Actionable explanation' }),
        file: Type.Optional(Type.String({ description: 'Affected file path' })),
      }), { description: 'Verification comments (empty = passed)' }),
    }),
    execute: createExecuteHandler(client, handleRecordVerification),
  });

  pi.registerTool({
    name: 'manifest_get_feature_proof',
    description: 'Get latest proof and verification status for a feature.',
    label: 'Get test proof for a Manifest feature',
    parameters: Type.Object({
      feature_id: Type.String({ description: 'Feature UUID or display ID' }),
    }),
    execute: createExecuteHandler(client, handleGetFeatureProof),
  });
}
