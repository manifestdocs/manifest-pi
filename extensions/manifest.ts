/**
 * Manifest extension for Pi coding agent.
 *
 * Entry point that creates the HTTP client and registers
 * all Manifest tools with Pi's ExtensionAPI.
 */

import { ManifestClient } from '../dist/client.js';
import { registerAllTools } from '../dist/tools/index.js';

export default function manifest(pi: any): void {
  const baseUrl = process.env.MANIFEST_URL ?? 'http://localhost:17010';
  const apiKey = process.env.MANIFEST_API_KEY;
  const client = new ManifestClient({ baseUrl, apiKey });
  registerAllTools(pi, client);
}
