import { createServer, type ServerHandle } from '../../src/server/index.js';

describe('API', () => {
  let server: ServerHandle;

  beforeEach(async () => {
    server = await createServer();
  });

  afterEach(async () => {
    await server.stop();
  });

  // ============================================================
  // Health
  // ============================================================

  it('health check returns 200', async () => {
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  // ============================================================
  // Full Lifecycle
  // ============================================================

  it('full lifecycle: create project -> create feature -> claim -> prove -> complete', async () => {
    // Create project
    const createRes = await server.app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'Lifecycle App', description: 'E2E test' },
    });
    expect(createRes.statusCode).toBe(201);
    const project = createRes.json();

    // List projects
    const listRes = await server.app.inject({ method: 'GET', url: '/api/v1/projects' });
    expect(listRes.json()).toHaveLength(1);

    // Get project
    const getRes = await server.app.inject({ method: 'GET', url: `/api/v1/projects/${project.id}` });
    expect(getRes.statusCode).toBe(200);

    // Create feature
    const featureRes = await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features`,
      payload: { title: 'User Login', details: 'As a user, I can log in.' },
    });
    expect(featureRes.statusCode).toBe(201);
    const feature = featureRes.json();
    expect(feature.feature_number).toBe(1);

    // Claim
    const claimRes = await server.app.inject({
      method: 'PUT', url: `/api/v1/features/${feature.id}/claim`,
      payload: { agent_type: 'pi' },
    });
    expect(claimRes.json().state).toBe('in_progress');

    // Prove
    const proofRes = await server.app.inject({
      method: 'POST', url: `/api/v1/features/${feature.id}/proofs`,
      payload: { command: 'pnpm test:run', exit_code: 0 },
    });
    expect(proofRes.statusCode).toBe(201);

    // Complete
    const completeRes = await server.app.inject({
      method: 'POST', url: `/api/v1/features/${feature.id}/complete`,
      payload: { summary: 'Implemented login', commits: [{ sha: 'abc', message: 'feat: login' }] },
    });
    expect(completeRes.statusCode).toBe(200);
    expect(completeRes.json().feature.state).toBe('implemented');

    // Tree
    const treeRes = await server.app.inject({
      method: 'GET', url: `/api/v1/projects/${project.id}/features/tree`,
    });
    const tree = treeRes.json();
    const login = tree[0].children.find((c: any) => c.title === 'User Login');
    expect(login.state).toBe('implemented');
  });

  // ============================================================
  // Feature Routes
  // ============================================================

  it('resolves display IDs in feature routes', async () => {
    const projectRes = await server.app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'Display ID App' },
    });
    const project = projectRes.json();
    const featureRes = await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features`,
      payload: { title: 'Test' },
    });
    const feature = featureRes.json();
    const displayId = `${project.key_prefix}-${feature.feature_number}`;

    const getRes = await server.app.inject({ method: 'GET', url: `/api/v1/features/${displayId}` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().id).toBe(feature.id);
  });

  it('returns 404 for unknown feature', async () => {
    const res = await server.app.inject({
      method: 'GET', url: '/api/v1/features/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 409 on duplicate claim', async () => {
    const { project, feature } = await createProjectAndFeature(server, 'Conflict App');
    await server.app.inject({
      method: 'PUT', url: `/api/v1/features/${feature.id}/claim`,
      payload: { agent_type: 'claude' },
    });
    const res = await server.app.inject({
      method: 'PUT', url: `/api/v1/features/${feature.id}/claim`,
      payload: { agent_type: 'pi' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('validates required fields (400)', async () => {
    const { project } = await createProjectAndFeature(server, 'Validation App');
    const res = await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('finds project by directory', async () => {
    await server.app.inject({
      method: 'POST', url: '/api/v1/projects',
      payload: { name: 'Dir App', directory_path: '/tmp/my-project' },
    });
    const res = await server.app.inject({
      method: 'GET', url: '/api/v1/projects/by-directory?path=/tmp/my-project',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Dir App');
  });

  it('returns 422 on completion without proof', async () => {
    const { feature } = await createProjectAndFeature(server, 'No Proof App', 'Unproven', 'Has spec');
    const res = await server.app.inject({
      method: 'POST', url: `/api/v1/features/${feature.id}/complete`,
      payload: { summary: 'Tried' },
    });
    expect(res.statusCode).toBe(422);
  });

  // ============================================================
  // Feature Update & Delete
  // ============================================================

  it('updates a feature', async () => {
    const { feature } = await createProjectAndFeature(server, 'Update App');
    const res = await server.app.inject({
      method: 'PUT', url: `/api/v1/features/${feature.id}`,
      payload: { title: 'Updated Title', priority: 10 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe('Updated Title');
    expect(res.json().priority).toBe(10);
  });

  it('deletes a feature', async () => {
    const { feature } = await createProjectAndFeature(server, 'Delete App');
    const res = await server.app.inject({
      method: 'DELETE', url: `/api/v1/features/${feature.id}`,
    });
    expect(res.statusCode).toBe(204);
    const getRes = await server.app.inject({ method: 'GET', url: `/api/v1/features/${feature.id}` });
    expect(getRes.statusCode).toBe(404);
  });

  // ============================================================
  // Feature Context & Navigation
  // ============================================================

  it('returns feature context with breadcrumb', async () => {
    const { project, feature } = await createProjectAndFeature(server, 'Context App');
    const res = await server.app.inject({
      method: 'GET', url: `/api/v1/features/${feature.id}/context`,
    });
    expect(res.statusCode).toBe(200);
    const ctx = res.json();
    expect(ctx.breadcrumb.length).toBeGreaterThanOrEqual(1);
    expect(ctx.display_id).toBeTruthy();
  });

  it('returns feature children', async () => {
    const { project } = await createProjectAndFeature(server, 'Children App');
    // Create parent and children
    const parentRes = await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features`,
      payload: { title: 'Parent' },
    });
    const parent = parentRes.json();
    await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features`,
      payload: { title: 'Child A', parent_id: parent.id },
    });
    await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features`,
      payload: { title: 'Child B', parent_id: parent.id },
    });

    const res = await server.app.inject({
      method: 'GET', url: `/api/v1/features/${parent.id}/children`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(2);
  });

  // ============================================================
  // Feature Search
  // ============================================================

  it('searches features', async () => {
    const { project } = await createProjectAndFeature(server, 'Search App', 'Authentication');
    await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features`,
      payload: { title: 'Authorization' },
    });

    const res = await server.app.inject({
      method: 'GET', url: `/api/v1/features/search?q=auth&project_id=${project.id}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().length).toBeGreaterThanOrEqual(2);
  });

  // ============================================================
  // Versions
  // ============================================================

  it('lists versions with status', async () => {
    const { project } = await createProjectAndFeature(server, 'Version App');
    const res = await server.app.inject({
      method: 'GET', url: `/api/v1/projects/${project.id}/versions`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.versions).toHaveLength(3);
    expect(body.versions[0].status).toBe('next');
    expect(body.next).toBeTruthy();
  });

  it('creates and releases a version', async () => {
    const { project } = await createProjectAndFeature(server, 'Release App');
    const createRes = await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/versions`,
      payload: { name: '2.0.0' },
    });
    expect(createRes.statusCode).toBe(201);

    const versions = (await server.app.inject({
      method: 'GET', url: `/api/v1/projects/${project.id}/versions`,
    })).json().versions;
    const nextVersion = versions.find((v: any) => v.status === 'next');

    const releaseRes = await server.app.inject({
      method: 'POST', url: `/api/v1/versions/${nextVersion.id}/release`,
    });
    expect(releaseRes.statusCode).toBe(200);
    expect(releaseRes.json().released_at).toBeTruthy();
  });

  it('assigns feature to version', async () => {
    const { project, feature } = await createProjectAndFeature(server, 'Assign App');
    const versions = (await server.app.inject({
      method: 'GET', url: `/api/v1/projects/${project.id}/versions`,
    })).json().versions;

    const res = await server.app.inject({
      method: 'PUT', url: `/api/v1/features/${feature.id}/version`,
      payload: { version_id: versions[1].id },
    });
    expect(res.statusCode).toBe(204);
  });

  // ============================================================
  // Bulk Create
  // ============================================================

  it('creates features in bulk with plan endpoint', async () => {
    const { project } = await createProjectAndFeature(server, 'Bulk App');

    // Preview
    const previewRes = await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features/plan`,
      payload: {
        confirm: false,
        features: [{ title: 'Auth', children: [{ title: 'Login' }, { title: 'Signup' }] }],
      },
    });
    expect(previewRes.statusCode).toBe(200);
    expect(previewRes.json().created).toBe(false);

    // Confirm
    const confirmRes = await server.app.inject({
      method: 'POST', url: `/api/v1/projects/${project.id}/features/plan`,
      payload: {
        confirm: true,
        features: [{ title: 'Auth', children: [{ title: 'Login' }, { title: 'Signup' }] }],
      },
    });
    expect(confirmRes.statusCode).toBe(201);
    expect(confirmRes.json().created_feature_ids).toHaveLength(3);
  });

  // ============================================================
  // History
  // ============================================================

  it('creates and retrieves feature history', async () => {
    const { feature } = await createProjectAndFeature(server, 'History App');
    const createRes = await server.app.inject({
      method: 'POST', url: `/api/v1/features/${feature.id}/history`,
      payload: { summary: 'First pass' },
    });
    expect(createRes.statusCode).toBe(201);

    const listRes = await server.app.inject({
      method: 'GET', url: `/api/v1/features/${feature.id}/history`,
    });
    expect(listRes.json()).toHaveLength(1);
  });

  // ============================================================
  // Proofs
  // ============================================================

  it('lists proofs and gets by ID', async () => {
    const { feature } = await createProjectAndFeature(server, 'Proof App');
    const createRes = await server.app.inject({
      method: 'POST', url: `/api/v1/features/${feature.id}/proofs`,
      payload: { command: 'test', exit_code: 0 },
    });
    const proof = createRes.json();

    const listRes = await server.app.inject({
      method: 'GET', url: `/api/v1/features/${feature.id}/proofs`,
    });
    expect(listRes.json()).toHaveLength(1);

    const getRes = await server.app.inject({
      method: 'GET', url: `/api/v1/proofs/${proof.id}`,
    });
    expect(getRes.statusCode).toBe(200);
  });

  // ============================================================
  // Focus & Templates
  // ============================================================

  it('sets and gets focus', async () => {
    const { project, feature } = await createProjectAndFeature(server, 'Focus App');
    await server.app.inject({
      method: 'PUT', url: `/api/v1/projects/${project.id}/focus`,
      payload: { feature_id: feature.id },
    });
    const res = await server.app.inject({
      method: 'GET', url: `/api/v1/projects/${project.id}/focus`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().feature_id).toBe(feature.id);
  });

  it('gets and updates template', async () => {
    const { project } = await createProjectAndFeature(server, 'Template App');
    const getRes = await server.app.inject({
      method: 'GET', url: `/api/v1/projects/${project.id}/template`,
    });
    expect(getRes.statusCode).toBe(200);

    const updateRes = await server.app.inject({
      method: 'PUT', url: `/api/v1/projects/${project.id}/template`,
      payload: { content: 'Custom template' },
    });
    expect(updateRes.json().content).toBe('Custom template');
  });

  // ============================================================
  // Portfolio
  // ============================================================

  it('returns portfolio data', async () => {
    await createProjectAndFeature(server, 'Portfolio App');
    const res = await server.app.inject({ method: 'GET', url: '/api/v1/portfolio' });
    expect(res.statusCode).toBe(200);
    expect(res.json().projects).toHaveLength(1);
  });

  // ============================================================
  // Next Feature (409 with in-progress)
  // ============================================================

  it('returns 409 on next_feature when in_progress features exist', async () => {
    const { project, feature } = await createProjectAndFeature(server, 'Next App');
    await server.app.inject({
      method: 'PUT', url: `/api/v1/features/${feature.id}/claim`,
      payload: { agent_type: 'pi' },
    });

    const res = await server.app.inject({
      method: 'GET', url: `/api/v1/projects/${project.id}/features/next`,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('in_progress_features_exist');
    expect(res.json().features).toHaveLength(1);
  });
});

// ============================================================
// Helpers
// ============================================================

async function createProjectAndFeature(server: ServerHandle, projectName: string, featureTitle = 'Test Feature', details?: string) {
  const projectRes = await server.app.inject({
    method: 'POST', url: '/api/v1/projects',
    payload: { name: projectName },
  });
  const project = projectRes.json();

  const featureRes = await server.app.inject({
    method: 'POST', url: `/api/v1/projects/${project.id}/features`,
    payload: { title: featureTitle, details },
  });
  const feature = featureRes.json();

  return { project, feature };
}
