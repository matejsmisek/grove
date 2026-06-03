import fs from 'fs';
import path from 'path';

const GROVE_EXCLUDE_ENTRY = '.grove/';

/**
 * Ensure the repo-scoped Grove data directory (.grove/) is git-ignored locally.
 *
 * Appends `.grove/` to `<repoRoot>/.git/info/exclude` if not already present.
 * Uses the local exclude file (not a tracked .gitignore) so it never produces a
 * committed diff in the user's repository. Idempotent and best-effort: failures
 * are swallowed so they can never break Grove startup.
 */
export function ensureGroveGitExcluded(repoRoot: string): void {
	try {
		const gitDir = path.join(repoRoot, '.git');
		// Only handle the main repository (.git is a directory). For worktrees we
		// never reach here because repo detection resolves to the main root.
		if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
			return;
		}

		const infoDir = path.join(gitDir, 'info');
		const excludePath = path.join(infoDir, 'exclude');

		let existing = '';
		if (fs.existsSync(excludePath)) {
			existing = fs.readFileSync(excludePath, 'utf-8');
			const alreadyExcluded = existing
				.split('\n')
				.map((line) => line.trim())
				.some((line) => line === GROVE_EXCLUDE_ENTRY || line === '.grove');
			if (alreadyExcluded) {
				return;
			}
		}

		if (!fs.existsSync(infoDir)) {
			fs.mkdirSync(infoDir, { recursive: true });
		}

		const needsNewline = existing.length > 0 && !existing.endsWith('\n');
		fs.appendFileSync(excludePath, `${needsNewline ? '\n' : ''}${GROVE_EXCLUDE_ENTRY}\n`, 'utf-8');
	} catch {
		// Best-effort only; never block startup on exclude bookkeeping.
	}
}
