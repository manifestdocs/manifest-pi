import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestClient, ApiError, ConnectionError } from '../../src/client.js';
import {
  handleListProjects,
  handleFindFeatures,
  handleGetFeature,
  handleGetActiveFeature,
  handleGetNextFeature,
  handleRenderFeatureTree,
  handleOrient,
} from '../../src/tools/discovery.js';

// Mock the client
function createMockClient(): ManifestClient {
  return {
    listProjectsByDirectory: vi.fn(),
    listProjects: vi.fn(),
    findFeatures: vi.fn(),
    getFeature: vi.fn(),
    getFeatureContext: vi.fn(),
    getFeatureHistory: vi.fn(),
    getFeatureTree: vi.fn(),
    getProject: vi.fn(),
    getActiveFeature: vi.fn(),
    getNextFeature: vi.fn(),
    getProjectHistory: vi.fn(),
  } as unknown as ManifestClient;
}

describe('discovery tools', () => {
  let client: ManifestClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('handleListProjects', () => {
    it('calls listProjectsByDirectory when directory_path provided', async () => {
      const mockResp = {
        project: { id: '1', name: 'Test', key_prefix: 'TST' },
        directories: [],
      };
      (client.listProjectsByDirectory as any).mockResolvedValue(mockResp);

      const result = await handleListProjects(client, { directory_path: '/my/path' });
      expect(client.listProjectsByDirectory).toHaveBeenCalledWith('/my/path');
      expect(result).toContain('Test');
    });

    it('calls listProjects when no directory_path', async () => {
      (client.listProjects as any).mockResolvedValue([
        { id: '1', name: 'P1', key_prefix: 'P1' },
        { id: '2', name: 'P2', key_prefix: 'P2' },
      ]);

      const result = await handleListProjects(client, {});
      expect(client.listProjects).toHaveBeenCalled();
      expect(result).toContain('P1');
      expect(result).toContain('P2');
    });

    it('returns connection error message when server is down', async () => {
      (client.listProjects as any).mockRejectedValue(
        new ConnectionError('http://localhost:17010'),
      );

      const result = await handleListProjects(client, {});
      expect(result).toContain('Cannot connect to Manifest server');
    });

    it('returns API error message on server error', async () => {
      (client.listProjects as any).mockRejectedValue(
        new ApiError(500, 'Internal Server Error', 'something broke'),
      );

      const result = await handleListProjects(client, {});
      expect(result).toContain('Error (500)');
      expect(result).toContain('something broke');
    });
  });

  describe('handleFindFeatures', () => {
    it('calls client.findFeatures with params', async () => {
      (client.findFeatures as any).mockResolvedValue([
        { id: '1', title: 'Auth', state: 'proposed', priority: 0 },
      ]);

      const result = await handleFindFeatures(client, {
        project_id: 'proj-1',
        state: 'proposed',
      });
      expect(client.findFeatures).toHaveBeenCalledWith({
        project_id: 'proj-1',
        state: 'proposed',
      });
      expect(result).toContain('Auth');
    });

    it('returns connection error when server is down', async () => {
      (client.findFeatures as any).mockRejectedValue(
        new ConnectionError('http://localhost:17010'),
      );

      const result = await handleFindFeatures(client, { project_id: 'proj-1' });
      expect(result).toContain('Cannot connect to Manifest server');
    });
  });

  describe('handleGetFeature', () => {
    it('calls client.getFeatureContext and includes breadcrumb', async () => {
      (client.getFeatureContext as any).mockResolvedValue({
        id: '1',
        title: 'OAuth Login',
        state: 'proposed',
        details: 'Login via OAuth',
        priority: 0,
        breadcrumb: [
          { id: '0', title: 'Root', details: 'Project root' },
          { id: '1', title: 'OAuth Login' },
        ],
        parent: null,
        siblings: [],
        children: [],
      });
      (client.getFeatureHistory as any).mockResolvedValue([]);

      const result = await handleGetFeature(client, {
        feature_id: '1',
        include_history: false,
      });
      expect(client.getFeatureContext).toHaveBeenCalledWith('1');
      expect(result).toContain('OAuth Login');
      expect(result).toContain('proposed');
    });

    it('shows history when include_history is true', async () => {
      (client.getFeatureContext as any).mockResolvedValue({
        id: '1',
        title: 'Auth',
        state: 'implemented',
        details: null,
        priority: 0,
        breadcrumb: [],
        parent: null,
        siblings: [],
        children: [],
      });
      (client.getFeatureHistory as any).mockResolvedValue([
        {
          id: 'h1',
          feature_id: '1',
          summary: 'Implemented basic auth',
          author: 'agent',
          created_at: '2024-01-01T00:00:00Z',
        },
      ]);

      const result = await handleGetFeature(client, {
        feature_id: '1',
        view: 'full',
        include_history: true,
      });
      expect(client.getFeatureHistory).toHaveBeenCalledWith('1');
      expect(result).toContain('Implemented basic auth');
    });

    it('returns API error on failure', async () => {
      (client.getFeatureContext as any).mockRejectedValue(
        new ApiError(404, 'Not Found', 'Feature not found'),
      );

      const result = await handleGetFeature(client, { feature_id: 'bad-id' });
      expect(result).toContain('Error (404)');
    });
  });

  describe('handleGetActiveFeature', () => {
    it('calls client.getActiveFeature', async () => {
      (client.getActiveFeature as any).mockResolvedValue({
        id: '1',
        title: 'Active Feature',
        state: 'in_progress',
      });

      const result = await handleGetActiveFeature(client, { project_id: 'proj-1' });
      expect(client.getActiveFeature).toHaveBeenCalledWith('proj-1');
      expect(result).toContain('Active Feature');
    });

    it('returns connection error when server is down', async () => {
      (client.getActiveFeature as any).mockRejectedValue(
        new ConnectionError('http://localhost:17010'),
      );

      const result = await handleGetActiveFeature(client, { project_id: 'proj-1' });
      expect(result).toContain('Cannot connect to Manifest server');
    });
  });

  describe('handleGetNextFeature', () => {
    it('calls client.getNextFeature', async () => {
      (client.getNextFeature as any).mockResolvedValue({
        id: '1',
        title: 'Next Feature',
        state: 'proposed',
        spec_status: 'complete',
      });

      const result = await handleGetNextFeature(client, { project_id: 'proj-1' });
      expect(client.getNextFeature).toHaveBeenCalledWith('proj-1', undefined);
      expect(result).toContain('Next Feature');
    });

    it('returns API error on failure', async () => {
      (client.getNextFeature as any).mockRejectedValue(
        new ApiError(404, 'Not Found', 'No project'),
      );

      const result = await handleGetNextFeature(client, { project_id: 'bad' });
      expect(result).toContain('Error (404)');
    });
  });

  describe('handleRenderFeatureTree', () => {
    it('calls client.getFeatureTree and renders ASCII tree', async () => {
      (client.getFeatureTree as any).mockResolvedValue([
        {
          id: '1',
          title: 'Auth',
          state: 'proposed',
          priority: 0,
          children: [
            {
              id: '2',
              title: 'Login',
              state: 'implemented',
              priority: 0,
              children: [],
            },
          ],
        },
      ]);
      (client.getProject as any).mockResolvedValue({
        id: 'proj-1',
        name: 'Test',
        key_prefix: 'TST',
      });

      const result = await handleRenderFeatureTree(client, {
        project_id: 'proj-1',
        max_depth: 0,
      });
      expect(client.getFeatureTree).toHaveBeenCalledWith('proj-1');
      expect(client.getProject).toHaveBeenCalledWith('proj-1');
      expect(result).toContain('Auth');
      expect(result).toContain('Login');
    });

    it('renders tree even if getProject fails', async () => {
      (client.getFeatureTree as any).mockResolvedValue([
        { id: '1', title: 'Auth', state: 'proposed', priority: 0, children: [] },
      ]);
      (client.getProject as any).mockRejectedValue(new Error('fail'));

      const result = await handleRenderFeatureTree(client, {
        project_id: 'proj-1',
      });
      expect(result).toContain('Auth');
    });

    it('returns connection error when server is down', async () => {
      (client.getFeatureTree as any).mockRejectedValue(
        new ConnectionError('http://localhost:17010'),
      );

      const result = await handleRenderFeatureTree(client, { project_id: 'proj-1' });
      expect(result).toContain('Cannot connect to Manifest server');
    });
  });

  describe('handleOrient', () => {
    it('returns project overview with tree, active, queue, and history', async () => {
      (client.listProjectsByDirectory as any).mockResolvedValue({
        id: 'proj-1',
        name: 'My Project',
      });
      (client.getFeatureTree as any).mockResolvedValue([
        { id: '1', title: 'Auth', state: 'proposed', priority: 0, children: [] },
      ]);
      (client.getProject as any).mockResolvedValue({
        id: 'proj-1',
        name: 'My Project',
        key_prefix: 'MP',
      });
      (client.getActiveFeature as any).mockResolvedValue({
        id: '2',
        title: 'Login',
        state: 'in_progress',
        display_id: 'MP-1',
      });
      (client.findFeatures as any).mockResolvedValue([
        { id: '3', title: 'Signup', state: 'proposed', priority: 0 },
      ]);
      (client.getProjectHistory as any).mockResolvedValue([
        {
          feature_title: 'Init',
          feature_state: 'implemented',
          summary: 'Project initialized',
          created_at: '2024-01-01T00:00:00Z',
          commits: [],
        },
      ]);

      const result = await handleOrient(client, { directory_path: '/my/project' });
      expect(result).toContain('My Project');
      expect(result).toContain('Auth');
      expect(result).toContain('Login');
      expect(result).toContain('Signup');
      expect(result).toContain('Project initialized');
    });

    it('returns message when no project found', async () => {
      const result = await handleOrient(client, {});
      expect(result).toContain('No project found');
    });

    it('works with project_id directly', async () => {
      (client.getFeatureTree as any).mockResolvedValue([]);
      (client.getActiveFeature as any).mockResolvedValue(null);
      (client.findFeatures as any).mockResolvedValue([]);
      (client.getProjectHistory as any).mockResolvedValue([]);

      const result = await handleOrient(client, { project_id: 'proj-1' });
      expect(result).toContain('proj-1');
    });

    it('returns connection error when server is down', async () => {
      (client.listProjectsByDirectory as any).mockRejectedValue(
        new ConnectionError('http://localhost:17010'),
      );

      const result = await handleOrient(client, { directory_path: '/my/project' });
      expect(result).toContain('Cannot connect to Manifest server');
    });
  });
});
