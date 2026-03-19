/**
 * Git commit capture for pre-completion hook.
 *
 * Runs `git log` in the project directory to find commits
 * made since the feature was claimed. Pure function with
 * no Pi dependencies — takes a shell executor for testability.
 */

import { execFile } from 'node:child_process';

export interface CommitEntry {
  sha: string;
  message: string;
}

/**
 * Get git commits made since a given ISO timestamp.
 *
 * Returns commits newest-first. Falls back to empty array
 * if git is unavailable, the directory isn't a repo, or
 * no commits exist since the timestamp.
 */
export async function getCommitsSince(
  cwd: string,
  sinceIso: string,
): Promise<CommitEntry[]> {
  try {
    const output = await execGitLog(cwd, sinceIso);
    return parseGitLog(output);
  } catch {
    return [];
  }
}

/** Run git log and return raw output. */
function execGitLog(cwd: string, sinceIso: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['log', `--since=${sinceIso}`, '--format=%H %s', '--no-merges'],
      { cwd, timeout: 5000 },
      (error, stdout) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout);
        }
      },
    );
  });
}

/** Parse `git log --format="%H %s"` output into CommitEntry[]. */
export function parseGitLog(output: string): CommitEntry[] {
  const entries: CommitEntry[] = [];
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) continue;
    const sha = trimmed.slice(0, spaceIndex);
    const message = trimmed.slice(spaceIndex + 1);
    if (sha.length >= 7) {
      entries.push({ sha, message });
    }
  }
  return entries;
}
