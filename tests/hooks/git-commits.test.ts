import { describe, it, expect } from 'vitest';
import { parseGitLog } from '../../src/hooks/git-commits.js';

describe('parseGitLog', () => {
  it('parses standard git log output', () => {
    const output = [
      'abc1234567890def1234567890abcdef12345678 Add pre-completion hook',
      'def4567890abc1234567890abcdef1234567890ab Fix typo in docs',
    ].join('\n');

    const entries = parseGitLog(output);
    expect(entries).toEqual([
      { sha: 'abc1234567890def1234567890abcdef12345678', message: 'Add pre-completion hook' },
      { sha: 'def4567890abc1234567890abcdef1234567890ab', message: 'Fix typo in docs' },
    ]);
  });

  it('handles empty output', () => {
    expect(parseGitLog('')).toEqual([]);
  });

  it('handles output with trailing newline', () => {
    const output = 'abc1234567890def1234567890abcdef12345678 Some commit\n';
    const entries = parseGitLog(output);
    expect(entries).toHaveLength(1);
    expect(entries[0].sha).toBe('abc1234567890def1234567890abcdef12345678');
  });

  it('skips lines without a space separator', () => {
    const output = 'noseparator\nabc1234567890def1234567890abcdef12345678 Valid commit\n';
    const entries = parseGitLog(output);
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe('Valid commit');
  });

  it('skips lines with short SHA (less than 7 chars)', () => {
    const output = 'abc12 Too short\nabc1234567890def1234567890abcdef12345678 Long enough\n';
    const entries = parseGitLog(output);
    expect(entries).toHaveLength(1);
    expect(entries[0].sha).toBe('abc1234567890def1234567890abcdef12345678');
  });

  it('handles commit messages with spaces', () => {
    const output = 'abc1234567890def1234567890abcdef12345678 feat: add the new thing with spaces\n';
    const entries = parseGitLog(output);
    expect(entries[0].message).toBe('feat: add the new thing with spaces');
  });

  it('trims whitespace from lines', () => {
    const output = '  abc1234567890def1234567890abcdef12345678 Indented commit  \n';
    const entries = parseGitLog(output);
    expect(entries).toHaveLength(1);
    expect(entries[0].sha).toBe('abc1234567890def1234567890abcdef12345678');
    expect(entries[0].message).toBe('Indented commit');
  });
});
