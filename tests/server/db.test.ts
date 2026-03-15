import { Database, NotFoundError, ValidationError, ConflictError } from '../../src/server/db.js';

describe('Database', () => {
  let db: Database;

  beforeEach(async () => {
    db = await Database.openMemory();
  });

  afterEach(async () => {
    await db.close();
  });

  // ============================================================
  // Migration
  // ============================================================

  it('migrates cleanly', async () => {
    const projects = await db.getAllProjects();
    expect(projects).toEqual([]);
  });

  // ============================================================
  // Projects
  // ============================================================

  it('creates a project with root feature and default versions', async () => {
    const project = await db.createProject({
      name: 'My App',
      description: 'A test project',
    });

    expect(project.id).toBeTruthy();
    expect(project.name).toBe('My App');
    expect(project.key_prefix).toBe('MA');
    expect(project.description).toBe('A test project');
    expect(project.directories).toEqual([]);

    const all = await db.getAllProjects();
    expect(all).toHaveLength(1);

    // Root feature exists
    const tree = await db.getFeatureTree(project.id);
    expect(tree).toHaveLength(1);
    expect(tree[0].title).toBe('My App');
    expect(tree[0].is_root).toBe(true);
    expect(tree[0].state).toBe('implemented');

    // Default versions created
    const versions = await db.getVersionsByProject(project.id);
    expect(versions).toHaveLength(3);
    expect(versions.map((v) => v.name)).toEqual(['0.1.0', '0.2.0', '0.3.0']);
  });

  it('creates a project with directory', async () => {
    const project = await db.createProject({
      name: 'Rails App',
      directory_path: '/home/user/rails-app',
    });
    expect(project.directories).toHaveLength(1);
    expect(project.directories[0].path).toBe('/home/user/rails-app');
    expect(project.directories[0].is_primary).toBe(true);
  });

  it('skips default versions when requested', async () => {
    const project = await db.createProject({ name: 'No Versions', skip_default_versions: true });
    const versions = await db.getVersionsByProject(project.id);
    expect(versions).toHaveLength(0);
  });

  it('updates a project', async () => {
    const project = await db.createProject({ name: 'Old Name' });
    const updated = await db.updateProject(project.id, { name: 'New Name', description: 'Updated desc' });
    expect(updated!.name).toBe('New Name');
    expect(updated!.description).toBe('Updated desc');
  });

  it('deletes a project', async () => {
    const project = await db.createProject({ name: 'To Delete' });
    const deleted = await db.deleteProject(project.id);
    expect(deleted).toBe(true);
    const all = await db.getAllProjects();
    expect(all).toHaveLength(0);
  });

  it('finds project by slug', async () => {
    await db.createProject({ name: 'My App' });
    const found = await db.getProjectBySlug('my-app');
    expect(found).toBeTruthy();
    expect(found!.name).toBe('My App');
  });

  it('finds project by directory path', async () => {
    const project = await db.createProject({ name: 'Dir Test', directory_path: '/home/user/myapp' });
    const found = await db.getProjectByDirectory('/home/user/myapp');
    expect(found!.id).toBe(project.id);
    expect(found!.directories).toHaveLength(1);
  });

  // ============================================================
  // Directories
  // ============================================================

  it('adds and removes directories', async () => {
    const project = await db.createProject({ name: 'Dir CRUD' });
    const dir = await db.addDirectory(project.id, { path: '/tmp/test', git_remote: 'https://github.com/test' });
    expect(dir.path).toBe('/tmp/test');
    expect(dir.git_remote).toBe('https://github.com/test');

    const dirs = await db.getDirectories(project.id);
    expect(dirs).toHaveLength(1);

    const deleted = await db.deleteDirectory(dir.id);
    expect(deleted).toBe(true);
    expect(await db.getDirectories(project.id)).toHaveLength(0);
  });

  // ============================================================
  // Focus
  // ============================================================

  it('sets and gets focus', async () => {
    const project = await db.createProject({ name: 'Focus Test' });
    const feature = await db.createFeature(project.id, { title: 'Focused' });

    await db.setFocus(project.id, feature.id);
    const focus = await db.getFocus(project.id);
    expect(focus!.feature_id).toBe(feature.id);
    expect(focus!.feature_title).toBe('Focused');

    // Clear focus
    await db.setFocus(project.id, null);
    const cleared = await db.getFocus(project.id);
    expect(cleared).toBeNull();
  });

  // ============================================================
  // Features — CRUD
  // ============================================================

  it('creates a feature with auto-numbered feature_number', async () => {
    const project = await db.createProject({ name: 'Test' });
    const f1 = await db.createFeature(project.id, { title: 'First feature' });
    expect(f1.feature_number).toBe(1);
    expect(f1.state).toBe('proposed');
    const f2 = await db.createFeature(project.id, { title: 'Second feature' });
    expect(f2.feature_number).toBe(2);
  });

  it('updates a feature', async () => {
    const project = await db.createProject({ name: 'Update Test' });
    const feature = await db.createFeature(project.id, { title: 'Original' });

    const updated = await db.updateFeature(feature.id, {
      title: 'Updated Title',
      details: 'New details',
      priority: 5,
    });
    expect(updated!.title).toBe('Updated Title');
    expect(updated!.details).toBe('New details');
    expect(updated!.priority).toBe(5);
  });

  it('handles desired_details for non-implemented features', async () => {
    const project = await db.createProject({ name: 'Desired Test' });
    const feature = await db.createFeature(project.id, { title: 'Test' });

    // For proposed features, desired_details applies directly to details
    const updated = await db.updateFeature(feature.id, {
      desired_details: 'New spec content',
    });
    expect(updated!.details).toBe('New spec content');
    expect(updated!.desired_details).toBeNull();
  });

  it('deletes a feature and its descendants', async () => {
    const project = await db.createProject({ name: 'Delete Test' });
    const parent = await db.createFeature(project.id, { title: 'Parent' });
    await db.createFeature(project.id, { title: 'Child', parent_id: parent.id });

    const deleted = await db.deleteFeature(parent.id);
    expect(deleted).toBe(true);

    const parentCheck = await db.getFeature(parent.id);
    expect(parentCheck).toBeNull();
  });

  it('gets children', async () => {
    const project = await db.createProject({ name: 'Children Test' });
    const parent = await db.createFeature(project.id, { title: 'Parent' });
    await db.createFeature(project.id, { title: 'Child A', parent_id: parent.id });
    await db.createFeature(project.id, { title: 'Child B', parent_id: parent.id });

    const children = await db.getChildren(parent.id);
    expect(children).toHaveLength(2);
  });

  it('gets root features', async () => {
    const project = await db.createProject({ name: 'Roots Test' });
    await db.createFeature(project.id, { title: 'Top-level 1' });
    await db.createFeature(project.id, { title: 'Top-level 2' });

    const roots = await db.getRootFeatures(project.id);
    expect(roots).toHaveLength(2);
  });

  // ============================================================
  // Features — Tree
  // ============================================================

  it('builds feature tree with derived state', async () => {
    const project = await db.createProject({ name: 'Tree Test' });
    const parent = await db.createFeature(project.id, { title: 'Auth' });
    await db.createFeature(project.id, { title: 'Login', parent_id: parent.id });
    await db.createFeature(project.id, { title: 'Signup', parent_id: parent.id });

    const tree = await db.getFeatureTree(project.id);
    expect(tree).toHaveLength(1);
    expect(tree[0].is_root).toBe(true);

    const auth = tree[0].children.find((c) => c.title === 'Auth');
    expect(auth).toBeTruthy();
    expect(auth!.children).toHaveLength(2);
    // Both children proposed → parent derives proposed
    expect(auth!.state).toBe('proposed');
  });

  // ============================================================
  // Features — Search
  // ============================================================

  it('searches features by title', async () => {
    const project = await db.createProject({ name: 'Search Test' });
    await db.createFeature(project.id, { title: 'User Authentication' });
    await db.createFeature(project.id, { title: 'User Profile' });
    await db.createFeature(project.id, { title: 'Settings' });

    const results = await db.searchFeatures('user', { project_id: project.id });
    expect(results).toHaveLength(2);
  });

  it('searches by feature number', async () => {
    const project = await db.createProject({ name: 'Num Search', key_prefix: 'NS' });
    const f1 = await db.createFeature(project.id, { title: 'First' });
    await db.createFeature(project.id, { title: 'Second' });

    const results = await db.searchFeatures('NS-1', { project_id: project.id });
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe(f1.id);
  });

  // ============================================================
  // Features — Context
  // ============================================================

  it('gets feature context with breadcrumb', async () => {
    const project = await db.createProject({ name: 'Context Test', key_prefix: 'CT' });
    const parent = await db.createFeature(project.id, { title: 'Auth', details: 'Auth module' });
    const child = await db.createFeature(project.id, { title: 'Login', details: 'Login feature', parent_id: parent.id });

    const context = await db.getFeatureContext(child.id);
    expect(context).toBeTruthy();
    expect(context!.title).toBe('Login');
    expect(context!.breadcrumb.length).toBeGreaterThanOrEqual(2);
    expect(context!.parent).toBeTruthy();
    expect(context!.parent!.title).toBe('Auth');
    expect(context!.display_id).toBe('CT-2');
  });

  it('gets feature diff', async () => {
    const project = await db.createProject({ name: 'Diff Test' });
    const feature = await db.createFeature(project.id, { title: 'Test', details: 'Original' });

    const diff = await db.getFeatureDiff(feature.id);
    expect(diff!.has_changes).toBe(false);
  });

  // ============================================================
  // Features — Blockers
  // ============================================================

  it('blocks and unblocks features', async () => {
    const project = await db.createProject({ name: 'Blocker Test' });
    const blocker = await db.createFeature(project.id, { title: 'Prerequisite' });
    const blocked = await db.createFeature(project.id, { title: 'Dependent' });

    // Block feature
    const result = await db.updateFeature(blocked.id, {
      state: 'blocked',
      blocked_by: [blocker.id],
    });
    expect(result!.state).toBe('blocked');

    // Check blockers
    const blockers = await db.getFeatureBlockers(blocked.id);
    expect(blockers).toHaveLength(1);
    expect(blockers[0].id).toBe(blocker.id);

    // Check dependents
    const dependents = await db.getFeatureDependents(blocker.id);
    expect(dependents).toHaveLength(1);
    expect(dependents[0].id).toBe(blocked.id);

    // Unblock
    const unblocked = await db.updateFeature(blocked.id, { state: 'proposed' });
    expect(unblocked!.state).toBe('proposed');
  });

  it('auto-resolves blocked features when blocker is implemented', async () => {
    const project = await db.createProject({ name: 'Auto Resolve Test' });
    const blocker = await db.createFeature(project.id, { title: 'Blocker', details: 'Has spec' });
    const blocked = await db.createFeature(project.id, { title: 'Blocked' });

    // Block
    await db.updateFeature(blocked.id, { state: 'blocked', blocked_by: [blocker.id] });

    // Complete the blocker
    await db.claimFeature(blocker.id, { agent_type: 'pi' });
    await db.createProof(blocker.id, { command: 'test', exit_code: 0 });
    await db.completeFeature(blocker.id, { summary: 'Done' });

    // Blocked feature should auto-transition to proposed
    const resolved = await db.getFeature(blocked.id);
    expect(resolved!.state).toBe('proposed');
  });

  it('rejects self-blocking', async () => {
    const project = await db.createProject({ name: 'Self Block Test' });
    const feature = await db.createFeature(project.id, { title: 'Test' });

    await expect(
      db.updateFeature(feature.id, { state: 'blocked', blocked_by: [feature.id] }),
    ).rejects.toThrow('cannot block itself');
  });

  it('finds blocked ancestor', async () => {
    const project = await db.createProject({ name: 'Ancestor Test' });
    const grandparent = await db.createFeature(project.id, { title: 'GP' });
    const parent = await db.createFeature(project.id, { title: 'Parent', parent_id: grandparent.id });
    const child = await db.createFeature(project.id, { title: 'Child', parent_id: parent.id });

    // Block grandparent
    const blocker = await db.createFeature(project.id, { title: 'Blocker' });
    await db.updateFeature(grandparent.id, { state: 'blocked', blocked_by: [blocker.id] });

    const ancestor = await db.findBlockedAncestor(child.id);
    expect(ancestor).toBeTruthy();
    expect(ancestor!.title).toBe('GP');
  });

  // ============================================================
  // Features — Bulk Create
  // ============================================================

  it('creates features in bulk', async () => {
    const project = await db.createProject({ name: 'Bulk Test' });
    const features = await db.createFeaturesBulk(project.id, [
      { title: 'Feature 1' },
      { title: 'Feature 2' },
      { title: 'Feature 3' },
    ]);
    expect(features).toHaveLength(3);
    expect(features.map((f) => f.feature_number)).toEqual([1, 2, 3]);
  });

  // ============================================================
  // Features — Claim & Complete
  // ============================================================

  it('claims a feature (transitions to in_progress)', async () => {
    const project = await db.createProject({ name: 'Claim Test' });
    const feature = await db.createFeature(project.id, { title: 'Feature A' });
    const claimed = await db.claimFeature(feature.id, {
      agent_type: 'pi',
      metadata: '{"branch": "feature-a"}',
    });
    expect(claimed.state).toBe('in_progress');
  });

  it('rejects duplicate claim', async () => {
    const project = await db.createProject({ name: 'Conflict Test' });
    const feature = await db.createFeature(project.id, { title: 'Feature B' });
    await db.claimFeature(feature.id, { agent_type: 'claude' });
    await expect(
      db.claimFeature(feature.id, { agent_type: 'pi' }),
    ).rejects.toThrow(ConflictError);
  });

  it('allows force claim', async () => {
    const project = await db.createProject({ name: 'Force Test' });
    const feature = await db.createFeature(project.id, { title: 'Feature C' });
    await db.claimFeature(feature.id, { agent_type: 'claude' });
    const forced = await db.claimFeature(feature.id, { agent_type: 'pi', force: true });
    expect(forced.state).toBe('in_progress');
  });

  it('completes a feature with passing proof', async () => {
    const project = await db.createProject({ name: 'Complete Test' });
    const feature = await db.createFeature(project.id, {
      title: 'Feature E',
      details: 'As a user, I can do things.',
    });
    await db.claimFeature(feature.id, { agent_type: 'pi' });
    await db.createProof(feature.id, { command: 'pnpm test:run', exit_code: 0 });

    const result = await db.completeFeature(feature.id, {
      summary: 'Implemented the feature',
      commits: [{ sha: 'abc123', message: 'feat: add feature E' }],
    });
    expect(result.feature.state).toBe('implemented');
    expect(result.history.summary).toBe('Implemented the feature');
  });

  it('rejects completion without proof', async () => {
    const project = await db.createProject({ name: 'No Proof Test' });
    const feature = await db.createFeature(project.id, { title: 'F', details: 'Has details' });
    await expect(db.completeFeature(feature.id, { summary: 'Done' })).rejects.toThrow(ValidationError);
  });

  it('rejects completion without details', async () => {
    const project = await db.createProject({ name: 'No Details Test' });
    const feature = await db.createFeature(project.id, { title: 'G' });
    await db.createProof(feature.id, { command: 'test', exit_code: 0 });
    await expect(db.completeFeature(feature.id, { summary: 'Done' })).rejects.toThrow(ValidationError);
  });

  it('allows completion with backfill flag', async () => {
    const project = await db.createProject({ name: 'Backfill Test' });
    const feature = await db.createFeature(project.id, { title: 'H' });
    const result = await db.completeFeature(feature.id, { summary: 'Backfilled', backfill: true });
    expect(result.feature.state).toBe('implemented');
  });

  it('rejects completion of non-leaf feature', async () => {
    const project = await db.createProject({ name: 'Non-leaf Test' });
    const parent = await db.createFeature(project.id, { title: 'Parent', details: 'Has details' });
    await db.createFeature(project.id, { title: 'Child', parent_id: parent.id });
    await db.createProof(parent.id, { command: 'test', exit_code: 0 });
    await expect(db.completeFeature(parent.id, { summary: 'Done' })).rejects.toThrow('Cannot complete a non-leaf feature');
  });

  it('returns in_progress leaf features', async () => {
    const project = await db.createProject({ name: 'Leaf Test' });
    const f1 = await db.createFeature(project.id, { title: 'F1' });
    await db.createFeature(project.id, { title: 'F2' });
    await db.claimFeature(f1.id, { agent_type: 'pi' });
    const inProgress = await db.getInProgressLeafFeatures(project.id);
    expect(inProgress).toHaveLength(1);
    expect(inProgress[0].title).toBe('F1');
  });

  // ============================================================
  // Features — Display ID Resolution
  // ============================================================

  it('resolves display ID (KEY-123)', async () => {
    const project = await db.createProject({ name: 'Rails App', key_prefix: 'RAILS' });
    const feature = await db.createFeature(project.id, { title: 'Login' });
    expect(feature.feature_number).toBe(1);

    const resolved = await db.resolveFeatureId('RAILS-1');
    expect(resolved).toBe(feature.id);

    // Case-insensitive
    const resolved2 = await db.resolveFeatureId('rails-1');
    expect(resolved2).toBe(feature.id);
  });

  // ============================================================
  // Proofs
  // ============================================================

  it('creates and retrieves proofs', async () => {
    const project = await db.createProject({ name: 'Proof Test' });
    const feature = await db.createFeature(project.id, { title: 'Feature D' });

    const proof = await db.createProof(feature.id, {
      command: 'pnpm test:run',
      exit_code: 0,
      output: 'All tests passed',
      tests: [{ name: 'test1', state: 'passed' }],
    });
    expect(proof.id).toBeTruthy();
    expect(proof.exit_code).toBe(0);

    const latest = await db.getLatestProof(feature.id);
    expect(latest!.id).toBe(proof.id);

    const all = await db.getProofsForFeature(feature.id);
    expect(all).toHaveLength(1);

    const single = await db.getProof(proof.id);
    expect(single!.command).toBe('pnpm test:run');
  });

  // ============================================================
  // Versions
  // ============================================================

  it('creates and lists versions', async () => {
    const project = await db.createProject({ name: 'Version Test', skip_default_versions: true });
    const v1 = await db.createVersion(project.id, { name: '1.0.0', description: 'Initial' });
    expect(v1.name).toBe('1.0.0');
    expect(v1.description).toBe('Initial');

    const versions = await db.getVersionsByProject(project.id);
    expect(versions).toHaveLength(1);
  });

  it('updates a version', async () => {
    const project = await db.createProject({ name: 'V Update', skip_default_versions: true });
    const v = await db.createVersion(project.id, { name: '1.0.0' });
    const updated = await db.updateVersion(v.id, { description: 'Updated' });
    expect(updated!.description).toBe('Updated');
  });

  it('releases a version and ensures minimum versions', async () => {
    const project = await db.createProject({ name: 'Release Test' });
    const versions = await db.getVersionsByProject(project.id);
    const v1 = versions[0]; // 0.1.0

    const released = await db.releaseVersion(v1.id);
    expect(released!.released_at).toBeTruthy();

    // Should ensure 4 unreleased versions exist
    const afterRelease = await db.getVersionsByProject(project.id);
    const unreleased = afterRelease.filter((v) => !v.released_at);
    expect(unreleased.length).toBeGreaterThanOrEqual(4);
  });

  it('deletes a version', async () => {
    const project = await db.createProject({ name: 'V Delete', skip_default_versions: true });
    const v = await db.createVersion(project.id, { name: '1.0.0' });
    const deleted = await db.deleteVersion(v.id);
    expect(deleted).toBe(true);
    expect(await db.getVersionsByProject(project.id)).toHaveLength(0);
  });

  it('assigns a feature to a version', async () => {
    const project = await db.createProject({ name: 'Assign Test' });
    const feature = await db.createFeature(project.id, { title: 'Test' });
    const versions = await db.getVersionsByProject(project.id);

    await db.setFeatureVersion(feature.id, versions[0].id);
    const updated = await db.getFeature(feature.id);
    expect(updated!.target_version_id).toBe(versions[0].id);
  });

  it('rejects assigning to released version', async () => {
    const project = await db.createProject({ name: 'Released Assign Test' });
    const feature = await db.createFeature(project.id, { title: 'Test' });
    const versions = await db.getVersionsByProject(project.id);

    await db.releaseVersion(versions[0].id);
    await expect(
      db.setFeatureVersion(feature.id, versions[0].id),
    ).rejects.toThrow('Cannot assign to a released version');
  });

  // ============================================================
  // History
  // ============================================================

  it('creates and retrieves history entries', async () => {
    const project = await db.createProject({ name: 'History Test' });
    const feature = await db.createFeature(project.id, { title: 'Test' });

    const entry = await db.createHistoryEntry(feature.id, {
      summary: 'Initial work',
      commits: [{ sha: 'abc', message: 'init' }],
    });
    expect(entry.summary).toBe('Initial work');

    const history = await db.getFeatureHistory(feature.id);
    expect(history).toHaveLength(1);

    const projectHistory = await db.getProjectHistory(project.id);
    expect(projectHistory.length).toBeGreaterThanOrEqual(1);
  });

  // ============================================================
  // Templates
  // ============================================================

  it('gets and upserts templates', async () => {
    const project = await db.createProject({ name: 'Template Test' });

    // Default template created with project
    const template = await db.getDefaultTemplate(project.id);
    expect(template).toBeTruthy();
    expect(template!.name).toBe('Default');

    // Update template
    const updated = await db.upsertTemplate(project.id, { content: 'Custom template content' });
    expect(updated.content).toBe('Custom template content');
  });

  // ============================================================
  // Portfolio
  // ============================================================

  it('returns portfolio data', async () => {
    const project = await db.createProject({ name: 'Portfolio Test' });
    await db.createFeature(project.id, { title: 'Feature 1' });
    await db.createFeature(project.id, { title: 'Feature 2' });

    const portfolio = await db.getPortfolio();
    expect(portfolio).toHaveLength(1);
    expect(portfolio[0].name).toBe('Portfolio Test');
    expect(portfolio[0].next_feature).toBeTruthy();
  });
});
