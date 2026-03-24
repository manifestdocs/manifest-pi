import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MANIFEST_CONTEXT } from '../src/generated/content.js';

const PROMPT_PATH = fileURLToPath(
  new URL('../prompts/manifest.md', import.meta.url),
);
const START_OVERVIEW_PATH = fileURLToPath(
  new URL('../skills/_generated_start-overview.md', import.meta.url),
);
const START_SKILL_PATH = fileURLToPath(
  new URL('../skills/start.md', import.meta.url),
);

describe('generated Pi content', () => {
  it('includes shared sections in the extension context', () => {
    expect(MANIFEST_CONTEXT).toContain('## Manifest');
    expect(MANIFEST_CONTEXT).toContain('### Domain terms');
    expect(MANIFEST_CONTEXT).toContain('### Spec Format');
    expect(MANIFEST_CONTEXT).toContain('### Output rules');
  });

  it('generates the shipped prompt asset', () => {
    const prompt = readFileSync(PROMPT_PATH, 'utf-8');
    expect(prompt).toContain('You are the orchestrator.');
    expect(prompt).toContain('All 4 phases must run');
  });

  it('injects the shared workflow overview into the start skill', () => {
    const overview = readFileSync(START_OVERVIEW_PATH, 'utf-8');
    const skill = readFileSync(START_SKILL_PATH, 'utf-8');

    expect(overview).toContain('SPEC -> CLAIM -> PLAN -> BUILD -> PROVE -> CRITICAL REVIEW -> DOCUMENT -> COMPLETE');
    expect(skill).toContain('{{include:_generated_start-overview.md}}');
  });
});
