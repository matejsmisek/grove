import { spawn } from 'child_process';

import type { GitCommandResult, WorktreeInfo } from './types.js';

export type { GitCommandResult, WorktreeInfo } from './types.js';

export class GitService {
	private cwd: string;

	constructor(cwd: string = process.cwd()) {
		this.cwd = cwd;
	}

	/**
	 * Execute a git command using spawn
	 */
	private async executeGitCommand(args: string[]): Promise<GitCommandResult> {
		return new Promise((resolve) => {
			const gitProcess = spawn('git', args, {
				cwd: this.cwd,
				stdio: ['pipe', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';

			gitProcess.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			gitProcess.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			gitProcess.on('close', (exitCode) => {
				resolve({
					success: exitCode === 0,
					stdout: stdout.trim(),
					stderr: stderr.trim(),
					exitCode,
				});
			});

			gitProcess.on('error', (error) => {
				resolve({
					success: false,
					stdout: '',
					stderr: error.message,
					exitCode: null,
				});
			});
		});
	}

	/**
	 * Add a new worktree
	 * @param path - Path where the worktree will be created
	 * @param branch - Branch name for the worktree (optional, creates new branch if provided)
	 * @param commitish - Commit/branch to check out (optional)
	 */
	async addWorktree(path: string, branch?: string, commitish?: string): Promise<GitCommandResult> {
		const args = ['worktree', 'add'];

		if (branch) {
			args.push('-b', branch);
		}

		args.push(path);

		if (commitish) {
			args.push(commitish);
		}

		return this.executeGitCommand(args);
	}

	/**
	 * List all worktrees
	 * @param porcelain - Use porcelain format for easier parsing
	 */
	async listWorktrees(porcelain: boolean = true): Promise<GitCommandResult> {
		const args = ['worktree', 'list'];

		if (porcelain) {
			args.push('--porcelain');
		}

		return this.executeGitCommand(args);
	}

	/**
	 * Parse porcelain worktree list output into structured data
	 */
	parseWorktreeList(porcelainOutput: string): WorktreeInfo[] {
		const worktrees: WorktreeInfo[] = [];
		const lines = porcelainOutput.split('\n');

		let currentWorktree: Partial<WorktreeInfo> = {};

		for (const line of lines) {
			if (line.startsWith('worktree ')) {
				currentWorktree.path = line.substring('worktree '.length);
			} else if (line.startsWith('branch ')) {
				currentWorktree.branch = line.substring('branch '.length);
			} else if (line.startsWith('HEAD ')) {
				currentWorktree.commit = line.substring('HEAD '.length);
			} else if (line === '') {
				// Empty line indicates end of worktree entry
				if (currentWorktree.path && currentWorktree.commit) {
					worktrees.push({
						path: currentWorktree.path,
						branch: currentWorktree.branch || 'detached',
						commit: currentWorktree.commit,
					});
				}
				currentWorktree = {};
			}
		}

		// Handle last worktree if no trailing newline
		if (currentWorktree.path && currentWorktree.commit) {
			worktrees.push({
				path: currentWorktree.path,
				branch: currentWorktree.branch || 'detached',
				commit: currentWorktree.commit,
			});
		}

		return worktrees;
	}

	/**
	 * Remove a worktree
	 * @param path - Path of the worktree to remove
	 * @param force - Force removal even if worktree is dirty
	 */
	async removeWorktree(path: string, force: boolean = false): Promise<GitCommandResult> {
		const args = ['worktree', 'remove'];

		if (force) {
			args.push('--force');
		}

		args.push(path);

		return this.executeGitCommand(args);
	}

	/**
	 * Prune worktree information
	 * Removes worktree information for worktrees that no longer exist
	 */
	async pruneWorktrees(): Promise<GitCommandResult> {
		return this.executeGitCommand(['worktree', 'prune']);
	}

	/**
	 * Lock a worktree to prevent it from being pruned
	 * @param path - Path of the worktree to lock
	 * @param reason - Optional reason for locking
	 */
	async lockWorktree(path: string, reason?: string): Promise<GitCommandResult> {
		const args = ['worktree', 'lock'];

		if (reason) {
			args.push('--reason', reason);
		}

		args.push(path);

		return this.executeGitCommand(args);
	}

	/**
	 * Unlock a worktree
	 * @param path - Path of the worktree to unlock
	 */
	async unlockWorktree(path: string): Promise<GitCommandResult> {
		return this.executeGitCommand(['worktree', 'unlock', path]);
	}

	/**
	 * Move a worktree to a new location
	 * @param worktree - Path of the worktree to move
	 * @param newPath - New location for the worktree
	 */
	async moveWorktree(worktree: string, newPath: string): Promise<GitCommandResult> {
		return this.executeGitCommand(['worktree', 'move', worktree, newPath]);
	}

	/**
	 * Check if a git repository has uncommitted changes (modified, staged, or untracked files)
	 * @param cwd - Optional working directory (defaults to service's cwd)
	 */
	async hasUncommittedChanges(cwd?: string): Promise<boolean> {
		const service = cwd ? new GitService(cwd) : this;
		const result = await service.executeGitCommand(['status', '--porcelain']);

		if (!result.success) {
			return false;
		}

		// If git status --porcelain returns any output, there are uncommitted changes
		return result.stdout.length > 0;
	}

	/**
	 * Check if a git repository has unpushed commits on the current branch
	 * @param cwd - Optional working directory (defaults to service's cwd)
	 */
	async hasUnpushedCommits(cwd?: string): Promise<boolean> {
		const service = cwd ? new GitService(cwd) : this;

		// First, check if the current branch has an upstream
		const upstreamResult = await service.executeGitCommand([
			'rev-parse',
			'--abbrev-ref',
			'@{upstream}',
		]);

		if (upstreamResult.success && upstreamResult.stdout) {
			// Branch has upstream - check if there are commits ahead
			const upstream = upstreamResult.stdout.trim();

			const aheadResult = await service.executeGitCommand([
				'rev-list',
				'--count',
				`${upstream}..HEAD`,
			]);

			if (!aheadResult.success) {
				// If there's an error, treat as unpushed
				return true;
			}

			const ahead = parseInt(aheadResult.stdout.trim(), 10);
			return ahead > 0;
		}

		// No upstream configured - check if current HEAD exists on any remote branch
		const headResult = await service.executeGitCommand(['rev-parse', 'HEAD']);

		if (!headResult.success) {
			// Can't determine HEAD, treat as unpushed
			return true;
		}

		const currentCommit = headResult.stdout.trim();

		// Check if this commit exists on any remote branch
		const remoteBranchesResult = await service.executeGitCommand([
			'branch',
			'-r',
			'--contains',
			currentCommit,
		]);

		if (!remoteBranchesResult.success) {
			// Error checking remote branches, treat as unpushed
			return true;
		}

		// If the output is empty, no remote branch contains this commit
		// If the output has content, at least one remote branch has this commit
		return remoteBranchesResult.stdout.trim().length === 0;
	}
}
