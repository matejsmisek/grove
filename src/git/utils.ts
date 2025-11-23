import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Check if the current directory is inside a git repository
 */
export function isGitRepository(cwd?: string): boolean {
	try {
		execSync('git rev-parse --git-dir', {
			cwd: cwd || process.cwd(),
			stdio: 'pipe',
		});
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if the current directory is a git worktree (not the main repository)
 */
export function isGitWorktree(cwd?: string): boolean {
	try {
		const workingDir = cwd || process.cwd();

		// Get the git directory
		const gitDir = execSync('git rev-parse --git-dir', {
			cwd: workingDir,
			stdio: 'pipe',
			encoding: 'utf-8',
		}).trim();

		// Resolve to absolute path
		const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.resolve(workingDir, gitDir);

		// Check if the git directory contains a 'worktrees' folder in its parent
		// Main repo: .git is a directory
		// Worktree: .git is a file pointing to .git/worktrees/<name>
		if (fs.existsSync(path.join(workingDir, '.git'))) {
			const gitPath = path.join(workingDir, '.git');
			const stats = fs.statSync(gitPath);

			// If .git is a file, it's a worktree
			if (stats.isFile()) {
				return true;
			}
		}

		// Alternative check: if git-dir contains '/worktrees/', it's a worktree
		if (absoluteGitDir.includes('/worktrees/')) {
			return true;
		}

		return false;
	} catch {
		return false;
	}
}

/**
 * Get the root directory of the git repository
 */
export function getGitRoot(cwd?: string): string | null {
	try {
		const root = execSync('git rev-parse --show-toplevel', {
			cwd: cwd || process.cwd(),
			stdio: 'pipe',
			encoding: 'utf-8',
		}).trim();

		return root;
	} catch {
		return null;
	}
}

/**
 * Verify that the current directory is a valid git repository (not a worktree)
 * Returns the repository root path if valid, or throws an error
 */
export function verifyValidRepository(cwd?: string): string {
	const workingDir = cwd || process.cwd();

	// Check if it's a git repository
	if (!isGitRepository(workingDir)) {
		throw new Error('Not a git repository');
	}

	// Check if it's a worktree
	if (isGitWorktree(workingDir)) {
		throw new Error('Cannot register a worktree. Please navigate to the main repository folder.');
	}

	// Get the repository root
	const root = getGitRoot(workingDir);
	if (!root) {
		throw new Error('Could not determine git repository root');
	}

	return root;
}
