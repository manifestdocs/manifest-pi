import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestClient } from '../../src/client.js';
import {
  handleListProjects,
  handleFindFeatures,
  handleGetFeature,
  handleGetActiveFeature,
  handleGetNextFeature,
  handleRenderFeatureTree,
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
    getActiveFeature: vi.fn(),
    getNextFeature: vi.fn(),
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
        projects: [{ id: '1', name: 'Test', key_prefix: 'TST' }],
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
        include_history: true,
      });
      expect(client.getFeatureHistory).toHaveBeenCalledWith('1');
      expect(result).toContain('Implemented basic auth');
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
  });

  describe('handleRenderFeatureTree', () => {
    it('calls client.getFeatureTree and renders ASCII tree', async () => {
      (client.getFeatureTree as any).mockResolvedValue([
        {
          feature: {
            id: '1',
            title: 'Auth',
            state: 'proposed',
            priority: 0,
          },
          children: [
            {
              feature: {
                id: '2',
                title: 'Login',
                state: 'implemented',
                priority: 0,
              },
              children: [],
            },
          ],
        },
      ]);

      const result = await handleRenderFeatureTree(client, {
        project_id: 'proj-1',
        max_depth: 0,
      });
      expect(client.getFeatureTree).toHaveBeenCalledWith('proj-1');
      expect(result).toContain('Auth');
      expect(result).toContain('Login');
    });
  });
});
