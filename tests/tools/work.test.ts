import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ManifestClient, ConflictError } from '../../src/client.js';
import {
  handleStartFeature,
  handleUpdateFeature,
  handleProveFeature,
  handleCompleteFeature,
} from '../../src/tools/work.js';

function createMockClient(): ManifestClient {
  return {
    startFeature: vi.fn(),
    updateFeature: vi.fn(),
    proveFeature: vi.fn(),
    completeFeature: vi.fn(),
  } as unknown as ManifestClient;
}

describe('work tools', () => {
  let client: ManifestClient;

  beforeEach(() => {
    client = createMockClient();
  });

  describe('handleStartFeature', () => {
    it('calls client.startFeature and returns spec on success', async () => {
      (client.startFeature as any).mockResolvedValue({
        id: '1',
        title: 'OAuth Login',
        state: 'in_progress',
        details: 'Implement OAuth',
        feature_tier: 'leaf',
        spec_status: 'complete',
        breadcrumb: [],
      });

      const result = await handleStartFeature(client, { feature_id: '1' });
      expect(client.startFeature).toHaveBeenCalledWith('1', {
        agent_type: 'pi',
        force: false,
        claim_metadata: undefined,
      });
      expect(result).toContain('OAuth Login');
    });

    it('returns error message on claim conflict', async () => {
      (client.startFeature as any).mockRejectedValue(
        new ConflictError('Feature already claimed by claude'),
      );

      const result = await handleStartFeature(client, { feature_id: '1' });
      expect(result).toContain('already claimed');
    });
  });

  describe('handleUpdateFeature', () => {
    it('calls client.updateFeature with provided fields', async () => {
      (client.updateFeature as any).mockResolvedValue({
        id: '1',
        title: 'Auth',
        state: 'proposed',
        details: 'Updated details',
      });

      const result = await handleUpdateFeature(client, {
        feature_id: '1',
        details: 'Updated details',
      });
      expect(client.updateFeature).toHaveBeenCalledWith('1', {
        details: 'Updated details',
      });
      expect(result).toContain('Updated');
    });
  });

  describe('handleProveFeature', () => {
    it('calls client.proveFeature with structured results', async () => {
      (client.proveFeature as any).mockResolvedValue({
        id: 'proof-1',
        exit_code: 0,
      });

      const result = await handleProveFeature(client, {
        feature_id: '1',
        command: 'vitest run',
        exit_code: 0,
        test_suites: [
          {
            name: 'auth',
            tests: [{ name: 'logs in', state: 'passed' }],
          },
        ],
      });
      expect(client.proveFeature).toHaveBeenCalledWith('1', expect.objectContaining({
        command: 'vitest run',
        exit_code: 0,
      }));
      expect(result).toContain('exit_code: 0');
    });

    it('formats exit code in response', async () => {
      (client.proveFeature as any).mockResolvedValue({
        id: 'proof-1',
        exit_code: 1,
      });

      const result = await handleProveFeature(client, {
        feature_id: '1',
        command: 'vitest run',
        exit_code: 1,
      });
      expect(result).toContain('exit_code: 1');
    });
  });

  describe('handleCompleteFeature', () => {
    it('calls client.completeFeature with summary and commits', async () => {
      (client.completeFeature as any).mockResolvedValue({
        id: '1',
        state: 'implemented',
      });

      const result = await handleCompleteFeature(client, {
        feature_id: '1',
        summary: 'Implemented OAuth login',
        commits: ['abc1234'],
      });
      expect(client.completeFeature).toHaveBeenCalledWith('1', {
        summary: 'Implemented OAuth login',
        commits: ['abc1234'],
        backfill: false,
      });
      expect(result).toContain('implemented');
    });
  });
});
