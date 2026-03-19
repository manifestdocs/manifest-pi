import { describe, it, expect } from 'vitest';
import {
  isSafeCommand,
  cleanStepText,
  extractTodoItems,
  extractDoneSteps,
  markCompletedSteps,
  type TodoItem,
} from '../../src/hooks/plan-utils.js';

describe('isSafeCommand', () => {
  it('allows read-only commands', () => {
    expect(isSafeCommand('ls -la')).toBe(true);
    expect(isSafeCommand('cat src/index.ts')).toBe(true);
    expect(isSafeCommand('grep -r "TODO" .')).toBe(true);
    expect(isSafeCommand('find . -name "*.ts"')).toBe(true);
    expect(isSafeCommand('git status')).toBe(true);
    expect(isSafeCommand('git log --oneline')).toBe(true);
    expect(isSafeCommand('git diff HEAD')).toBe(true);
    expect(isSafeCommand('rg "pattern" src/')).toBe(true);
  });

  it('allows test runner commands', () => {
    expect(isSafeCommand('pnpm list')).toBe(true);
    expect(isSafeCommand('pnpm audit')).toBe(true);
    expect(isSafeCommand('pnpm test')).toBe(true);
    expect(isSafeCommand('pnpm test:run')).toBe(true);
    expect(isSafeCommand('pnpm check')).toBe(true);
    expect(isSafeCommand('pnpm build')).toBe(true);
    expect(isSafeCommand('pnpm run test')).toBe(true);
    expect(isSafeCommand('pnpm --filter ./manifest-api test:run src/core/storage.test.ts')).toBe(true);
    expect(isSafeCommand('npm test')).toBe(true);
    expect(isSafeCommand('npm run build')).toBe(true);
    expect(isSafeCommand('dotnet test')).toBe(true);
    expect(isSafeCommand('cargo test --all')).toBe(true);
    expect(isSafeCommand('vitest run')).toBe(true);
  });

  it('allows branch creation in plan mode', () => {
    expect(isSafeCommand('git checkout -b feature/my-branch')).toBe(true);
    expect(isSafeCommand('git checkout -B feature/my-branch')).toBe(true);
    expect(isSafeCommand('git switch -c feature/my-branch')).toBe(true);
  });

  it('blocks destructive commands', () => {
    expect(isSafeCommand('rm -rf /')).toBe(false);
    expect(isSafeCommand('mv file.txt /tmp/')).toBe(false);
    expect(isSafeCommand('git commit -m "test"')).toBe(false);
    expect(isSafeCommand('git push origin main')).toBe(false);
    expect(isSafeCommand('git checkout main')).toBe(false);
    expect(isSafeCommand('npm install express')).toBe(false);
    expect(isSafeCommand('pnpm add lodash')).toBe(false);
  });

  it('blocks write redirections', () => {
    expect(isSafeCommand('echo "test" > file.txt')).toBe(false);
    expect(isSafeCommand('cat foo >> bar')).toBe(false);
  });

  it('blocks interactive editors', () => {
    expect(isSafeCommand('vim file.txt')).toBe(false);
    expect(isSafeCommand('nano file.txt')).toBe(false);
    expect(isSafeCommand('code .')).toBe(false);
  });

  it('rejects unknown commands', () => {
    expect(isSafeCommand('some-random-binary')).toBe(false);
  });
});

describe('cleanStepText', () => {
  it('removes markdown formatting', () => {
    expect(cleanStepText('**bold text**')).toBe('Bold text');
    expect(cleanStepText('`code here`')).toBe('Code here');
  });

  it('strips imperative prefixes', () => {
    expect(cleanStepText('Create the new component')).toBe('New component');
    expect(cleanStepText('Update the config file')).toBe('Config file');
  });

  it('truncates long text', () => {
    const long = 'A'.repeat(80);
    const result = cleanStepText(long);
    expect(result.length).toBe(72);
    expect(result.endsWith('...')).toBe(true);
  });

  it('capitalizes first letter', () => {
    expect(cleanStepText('lowercase start')).toBe('Lowercase start');
  });
});

describe('extractTodoItems', () => {
  it('extracts numbered steps after Plan: header', () => {
    const message = `
Some preamble text.

Plan:
1. Set up the database schema
2. Write the API endpoint handler
3. Add validation middleware
`;
    const items = extractTodoItems(message);
    expect(items).toHaveLength(3);
    expect(items[0].step).toBe(1);
    expect(items[0].completed).toBe(false);
    expect(items[1].step).toBe(2);
    expect(items[2].step).toBe(3);
  });

  it('returns empty array when no Plan: header', () => {
    const items = extractTodoItems('Just some regular text without a plan.');
    expect(items).toHaveLength(0);
  });

  it('handles bold Plan: header', () => {
    const message = `
**Plan:**
1. First step here
2. Second step here
`;
    const items = extractTodoItems(message);
    expect(items).toHaveLength(2);
  });

  it('filters out short or code-prefixed items', () => {
    const message = `
Plan:
1. Ok
2. \`/bin/sh\` something
3. A real step with enough content
`;
    const items = extractTodoItems(message);
    expect(items).toHaveLength(1);
    expect(items[0].text).toContain('A real step');
  });
});

describe('extractDoneSteps', () => {
  it('extracts DONE markers', () => {
    const text = 'Did the thing [DONE:1] and also [DONE:3]';
    expect(extractDoneSteps(text)).toEqual([1, 3]);
  });

  it('is case-insensitive', () => {
    const text = '[done:2] completed';
    expect(extractDoneSteps(text)).toEqual([2]);
  });

  it('returns empty for no markers', () => {
    expect(extractDoneSteps('no markers here')).toEqual([]);
  });
});

describe('markCompletedSteps', () => {
  it('marks matching steps as completed', () => {
    const items: TodoItem[] = [
      { step: 1, text: 'First', completed: false },
      { step: 2, text: 'Second', completed: false },
      { step: 3, text: 'Third', completed: false },
    ];

    const count = markCompletedSteps('Done with [DONE:1] and [DONE:3]', items);
    expect(count).toBe(2);
    expect(items[0].completed).toBe(true);
    expect(items[1].completed).toBe(false);
    expect(items[2].completed).toBe(true);
  });

  it('returns 0 when no markers match', () => {
    const items: TodoItem[] = [
      { step: 1, text: 'First', completed: false },
    ];
    const count = markCompletedSteps('no markers', items);
    expect(count).toBe(0);
    expect(items[0].completed).toBe(false);
  });
});
