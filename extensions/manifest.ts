/**
 * Manifest extension for Pi coding agent.
 *
 * Starts an embedded HTTP server with in-process SQLite, then
 * registers all Manifest tools pointing at it.
 */

import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { ManifestClient } from '../dist/client.js';
import { registerAllTools } from '../dist/tools/index.js';
import { WorkflowState } from '../dist/hooks/state.js';
import { registerGates } from '../dist/hooks/register.js';
import { createServer } from '../dist/server/index.js';

export default async function manifest(pi: ExtensionAPI): Promise<void> {
  const port = parseInt(process.env.MANIFEST_PORT ?? '17010', 10);
  const dbPath = process.env.MANIFEST_DB
    ?? join(homedir(), '.local', 'share', 'manifest', 'manifest.db');

  // Ensure DB directory exists
  mkdirSync(join(dbPath, '..'), { recursive: true });

  const server = await createServer({ port, dbPath });
  const address = await server.start();
  console.log(`Manifest server listening on ${address}`);

  const baseUrl = `http://localhost:${port}`;
  const apiKey = process.env.MANIFEST_API_KEY;
  const client = new ManifestClient({ baseUrl, apiKey });
  const state = new WorkflowState();
  registerAllTools(pi, client);
  registerGates(pi, state);
}
