import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

interface GitExecResult {
	code: number | null;
	stdout: string;
}

/**
 * Run a git command asynchronously and capture its trimmed stdout.
 * Never rejects; failures are reported via a non-zero/null exit code.
 */
function runGit(args: string[], cwd: string): Promise<GitExecResult> {
	return new Promise((resolve) => {
		const proc = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });

		let stdout = '';
		proc.stdout.on('data', (data) => {
			stdout += data.toString();
		});

		proc.on('close', (code) => {
			resolve({ code, stdout: stdout.trim() });
		});

		proc.on('error', () => {
			resolve({ code: null, stdout: '' });
		});
	});
}

/**
 * Check if the current directory is inside a git repository
 */
export async function isGitRepository(cwd?: string): Promise<boolean> {
	const { code } = await runGit(['rev-parse', '--git-dir'], cwd || process.cwd());
	return code === 0;
}

/**
 * Check if the current directory is a git worktree (not the main repository)
 */
export async function isGitWorktree(cwd?: string): Promise<boolean> {
	const workingDir = cwd || process.cwd();

	// Get the git directory
	const { code, stdout: gitDir } = await runGit(['rev-parse', '--git-dir'], workingDir);
	if (code !== 0) {
		return false;
	}

	// Resolve to absolute path
	const absoluteGitDir = path.isAbsolute(gitDir) ? gitDir : path.resolve(workingDir, gitDir);

	// Check if the git directory contains a 'worktrees' folder in its parent
	// Main repo: .git is a directory
	// Worktree: .git is a file pointing to .git/worktrees/<name>
	try {
		const stats = await fs.promises.stat(path.join(workingDir, '.git'));
		// If .git is a file, it's a worktree
		if (stats.isFile()) {
			return true;
		}
	} catch {
		// .git may not exist at workingDir (e.g. nested dir); fall through to git-dir check
	}

	// Alternative check: if git-dir contains '/worktrees/', it's a worktree
	if (absoluteGitDir.includes('/worktrees/')) {
		return true;
	}

	return false;
}

/**
 * Get the root directory of the git repository
 */
export async function getGitRoot(cwd?: string): Promise<string | null> {
	const { code, stdout } = await runGit(['rev-parse', '--show-toplevel'], cwd || process.cwd());
	return code === 0 ? stdout : null;
}

/**
 * Synchronously find the main git repository root by walking up the directory
 * tree from startDir looking for a `.git` entry.
 *
 * - If `.git` is a directory, the directory containing it is the main repo root.
 * - If `.git` is a file (a linked worktree), it points at
 *   `<main>/.git/worktrees/<name>`; we strip that suffix to resolve back to the
 *   MAIN repository root. This ensures invocations from inside a grove worktree
 *   resolve to the same repo (and the same <repo>/.grove) rather than nesting.
 *
 * Returns the absolute repo root, or undefined when no git repo is found.
 */
export function findMainRepoRootSync(startDir: string): string | undefined {
	let currentDir = path.resolve(startDir);
	const root = path.parse(currentDir).root;

	// Walk up including the filesystem root.
	for (;;) {
		const gitPath = path.join(currentDir, '.git');
		try {
			const stats = fs.statSync(gitPath);
			if (stats.isDirectory()) {
				// Main repository: the directory containing .git is the root.
				return currentDir;
			}
			if (stats.isFile()) {
				// Linked worktree: resolve back to the main repository root.
				return resolveMainRootFromWorktreeGitFile(gitPath) ?? currentDir;
			}
		} catch {
			// .git does not exist here; keep walking up.
		}

		if (currentDir === root) {
			break;
		}
		currentDir = path.dirname(currentDir);
	}

	return undefined;
}

/**
 * Parse a worktree `.git` file (`gitdir: <main>/.git/worktrees/<name>`) and
 * return the main repository root, or undefined if it cannot be determined.
 */
function resolveMainRootFromWorktreeGitFile(gitFilePath: string): string | undefined {
	try {
		const content = fs.readFileSync(gitFilePath, 'utf-8').trim();
		const match = content.match(/^gitdir:\s*(.+)$/m);
		if (!match) {
			return undefined;
		}

		let gitDir = match[1].trim();
		if (!path.isAbsolute(gitDir)) {
			gitDir = path.resolve(path.dirname(gitFilePath), gitDir);
		}

		// gitDir looks like <main>/.git/worktrees/<name>
		const worktreesIndex = gitDir.lastIndexOf(`${path.sep}worktrees${path.sep}`);
		if (worktreesIndex === -1) {
			return undefined;
		}
		const mainGitDir = gitDir.slice(0, worktreesIndex);
		// mainGitDir ends with /.git; the main repo root is its parent.
		if (path.basename(mainGitDir) !== '.git') {
			return undefined;
		}
		return path.dirname(mainGitDir);
	} catch {
		return undefined;
	}
}

/**
 * Verify that the current directory is a valid git repository (not a worktree)
 * Returns the repository root path if valid, or throws an error
 */
export async function verifyValidRepository(cwd?: string): Promise<string> {
	const workingDir = cwd || process.cwd();

	// Check if it's a git repository
	if (!(await isGitRepository(workingDir))) {
		throw new Error('Not a git repository');
	}

	// Check if it's a worktree
	if (await isGitWorktree(workingDir)) {
		throw new Error('Cannot register a worktree. Please navigate to the main repository folder.');
	}

	// Get the repository root
	const root = await getGitRoot(workingDir);
	if (!root) {
		throw new Error('Could not determine git repository root');
	}

	return root;
}

/**
 * Directories that are typically not project folders in a monorepo
 */
const IGNORED_DIRECTORIES = new Set([
	'.git',
	'.github',
	'.vscode',
	'.idea',
	'node_modules',
	'dist',
	'build',
	'out',
	'coverage',
	'.cache',
	'.turbo',
	'.next',
	'.nuxt',
	'__pycache__',
	'.pytest_cache',
	'vendor',
	'target',
]);

/**
 * Get a list of project folders in a monorepo
 * Returns directories in the repository root that could be project folders
 */
export async function getMonorepoProjects(repoPath: string): Promise<string[]> {
	try {
		const entries = await fs.promises.readdir(repoPath, { withFileTypes: true });

		const projects = entries
			.filter((entry) => {
				// Must be a directory
				if (!entry.isDirectory()) {
					return false;
				}

				// Skip hidden directories (except explicitly ignored ones which are already hidden)
				if (entry.name.startsWith('.') && !IGNORED_DIRECTORIES.has(entry.name)) {
					return false;
				}

				// Skip explicitly ignored directories
				if (IGNORED_DIRECTORIES.has(entry.name)) {
					return false;
				}

				return true;
			})
			.map((entry) => entry.name)
			.sort();

		return projects;
	} catch {
		return [];
	}
}
