import { spawn } from 'child_process';

import type {
	BranchUpstreamStatus,
	GitCommandResult,
	IGitService,
	WorktreeInfo,
} from './interfaces.js';

// Re-export types for backward compatibility
export type { BranchUpstreamStatus, GitCommandResult, WorktreeInfo } from './interfaces.js';

/**
 * Stateless Git Service implementation
 * All methods accept repoPath as first argument for flexibility and testability
 */
export class GitService implements IGitService {
	/**
	 * Execute a git command using spawn
	 * @param repoPath - Repository root path (cwd for the command)
	 * @param args - Git command arguments
	 */
	private async executeGitCommand(repoPath: string, args: string[]): Promise<GitCommandResult> {
		return new Promise((resolve) => {
			const gitProcess = spawn('git', args, {
				cwd: repoPath,
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
	 * @param repoPath - Repository root path
	 * @param worktreePath - Path where the worktree will be created
	 * @param branch - Branch name for the worktree (optional, creates new branch if provided)
	 * @param commitish - Commit/branch to check out (optional)
	 */
	async addWorktree(
		repoPath: string,
		worktreePath: string,
		branch?: string,
		commitish?: string
	): Promise<GitCommandResult> {
		const args = ['worktree', 'add'];

		if (branch) {
			args.push('-b', branch);
		}

		args.push(worktreePath);

		if (commitish) {
			args.push(commitish);
		}

		return this.executeGitCommand(repoPath, args);
	}

	/**
	 * List all worktrees
	 * @param repoPath - Repository root path
	 * @param porcelain - Use porcelain format for easier parsing
	 */
	async listWorktrees(repoPath: string, porcelain: boolean = true): Promise<GitCommandResult> {
		const args = ['worktree', 'list'];

		if (porcelain) {
			args.push('--porcelain');
		}

		return this.executeGitCommand(repoPath, args);
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
	 * @param repoPath - Repository root path
	 * @param worktreePath - Path of the worktree to remove
	 * @param force - Force removal even if worktree is dirty
	 */
	async removeWorktree(
		repoPath: string,
		worktreePath: string,
		force: boolean = false
	): Promise<GitCommandResult> {
		const args = ['worktree', 'remove'];

		if (force) {
			args.push('--force');
		}

		args.push(worktreePath);

		return this.executeGitCommand(repoPath, args);
	}

	/**
	 * Prune worktree information
	 * Removes worktree information for worktrees that no longer exist
	 * @param repoPath - Repository root path
	 */
	async pruneWorktrees(repoPath: string): Promise<GitCommandResult> {
		return this.executeGitCommand(repoPath, ['worktree', 'prune']);
	}

	/**
	 * Lock a worktree to prevent it from being pruned
	 * @param repoPath - Repository root path
	 * @param worktreePath - Path of the worktree to lock
	 * @param reason - Optional reason for locking
	 */
	async lockWorktree(
		repoPath: string,
		worktreePath: string,
		reason?: string
	): Promise<GitCommandResult> {
		const args = ['worktree', 'lock'];

		if (reason) {
			args.push('--reason', reason);
		}

		args.push(worktreePath);

		return this.executeGitCommand(repoPath, args);
	}

	/**
	 * Unlock a worktree
	 * @param repoPath - Repository root path
	 * @param worktreePath - Path of the worktree to unlock
	 */
	async unlockWorktree(repoPath: string, worktreePath: string): Promise<GitCommandResult> {
		return this.executeGitCommand(repoPath, ['worktree', 'unlock', worktreePath]);
	}

	/**
	 * Move a worktree to a new location
	 * @param repoPath - Repository root path
	 * @param worktreePath - Current path of the worktree
	 * @param newPath - New location for the worktree
	 */
	async moveWorktree(
		repoPath: string,
		worktreePath: string,
		newPath: string
	): Promise<GitCommandResult> {
		return this.executeGitCommand(repoPath, ['worktree', 'move', worktreePath, newPath]);
	}

	/**
	 * Check if a git repository has uncommitted changes (modified, staged, or untracked files)
	 * @param repoPath - Repository root path
	 */
	async hasUncommittedChanges(repoPath: string): Promise<boolean> {
		const result = await this.executeGitCommand(repoPath, ['status', '--porcelain']);

		if (!result.success) {
			return false;
		}

		// If git status --porcelain returns any output, there are uncommitted changes
		return result.stdout.length > 0;
	}

	/**
	 * Get the current branch name
	 * @param repoPath - Repository root path
	 * @returns Branch name or 'detached' if in detached HEAD state
	 */
	async getCurrentBranch(repoPath: string): Promise<string> {
		const result = await this.executeGitCommand(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);

		if (!result.success) {
			return 'unknown';
		}

		const branch = result.stdout.trim();
		return branch === 'HEAD' ? 'detached' : branch;
	}

	/**
	 * Get the count of changed files (modified, added, deleted, untracked)
	 * @param repoPath - Repository root path
	 * @returns Object with counts for modified, added, deleted, and untracked files
	 */
	async getFileChangeStats(repoPath: string): Promise<{
		modified: number;
		added: number;
		deleted: number;
		untracked: number;
		total: number;
	}> {
		const result = await this.executeGitCommand(repoPath, ['status', '--porcelain']);

		if (!result.success || !result.stdout) {
			return { modified: 0, added: 0, deleted: 0, untracked: 0, total: 0 };
		}

		const lines = result.stdout.split('\n').filter((line) => line.length > 0);
		let modified = 0;
		let added = 0;
		let deleted = 0;
		let untracked = 0;

		for (const line of lines) {
			const status = line.substring(0, 2);
			if (status === '??') {
				untracked++;
			} else if (status.includes('M') || status.includes('R') || status.includes('C')) {
				modified++;
			} else if (status.includes('A')) {
				added++;
			} else if (status.includes('D')) {
				deleted++;
			} else {
				// Other status codes (like 'U' for unmerged) count as modified
				modified++;
			}
		}

		return { modified, added, deleted, untracked, total: lines.length };
	}

	/**
	 * Check if a git repository has unpushed commits on the current branch
	 * @param repoPath - Repository root path
	 */
	async hasUnpushedCommits(repoPath: string): Promise<boolean> {
		// First, check if the current branch has an upstream
		const upstreamResult = await this.executeGitCommand(repoPath, [
			'rev-parse',
			'--abbrev-ref',
			'@{upstream}',
		]);

		if (upstreamResult.success && upstreamResult.stdout) {
			// Branch has upstream - check if there are commits ahead
			const upstream = upstreamResult.stdout.trim();

			const aheadResult = await this.executeGitCommand(repoPath, [
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
		const headResult = await this.executeGitCommand(repoPath, ['rev-parse', 'HEAD']);

		if (!headResult.success) {
			// Can't determine HEAD, treat as unpushed
			return true;
		}

		const currentCommit = headResult.stdout.trim();

		// Check if this commit exists on any remote branch
		const remoteBranchesResult = await this.executeGitCommand(repoPath, [
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

	/**
	 * Detect the main branch of a repository
	 * Tries "master" first, then "main", then returns current branch
	 * @param repoPath - Repository root path
	 * @returns The detected main branch name
	 */
	async detectMainBranch(repoPath: string): Promise<string> {
		// Try to find "master" branch
		const masterResult = await this.executeGitCommand(repoPath, [
			'rev-parse',
			'--verify',
			'refs/heads/master',
		]);

		if (masterResult.success) {
			return 'master';
		}

		// Try to find "main" branch
		const mainResult = await this.executeGitCommand(repoPath, [
			'rev-parse',
			'--verify',
			'refs/heads/main',
		]);

		if (mainResult.success) {
			return 'main';
		}

		// Fall back to current branch
		return this.getCurrentBranch(repoPath);
	}

	/**
	 * Fetch from remote repository
	 * @param repoPath - Repository root path
	 * @param remote - Remote name (defaults to 'origin')
	 */
	async fetch(repoPath: string, remote: string = 'origin'): Promise<GitCommandResult> {
		return this.executeGitCommand(repoPath, ['fetch', remote]);
	}

	/**
	 * Pull from remote repository
	 * @param repoPath - Repository root path
	 * @param remote - Remote name (defaults to 'origin')
	 * @param branch - Branch name (optional, uses current branch if not specified)
	 */
	async pull(
		repoPath: string,
		remote: string = 'origin',
		branch?: string
	): Promise<GitCommandResult> {
		const args = ['pull', remote];
		if (branch) {
			args.push(branch);
		}
		return this.executeGitCommand(repoPath, args);
	}

	/**
	 * Reset repository to a specific commit
	 * @param repoPath - Repository root path
	 * @param ref - Git reference (commit, branch, etc.)
	 * @param hard - Use --hard flag to discard all changes
	 */
	async reset(repoPath: string, ref: string, hard: boolean = false): Promise<GitCommandResult> {
		const args = ['reset'];
		if (hard) {
			args.push('--hard');
		}
		args.push(ref);
		return this.executeGitCommand(repoPath, args);
	}

	/**
	 * Resolve a git reference to its SHA
	 * @param repoPath - Repository root path
	 * @param ref - Git reference to resolve
	 */
	async revParse(repoPath: string, ref: string): Promise<GitCommandResult> {
		return this.executeGitCommand(repoPath, ['rev-parse', ref]);
	}

	/**
	 * Get the upstream status of the current branch
	 * Uses `git branch -vv` to detect if the upstream is marked as :gone
	 * @param repoPath - Repository root path
	 * @returns 'active' if upstream exists, 'gone' if upstream was deleted, 'none' if no upstream
	 */
	async getBranchUpstreamStatus(repoPath: string): Promise<BranchUpstreamStatus> {
		// Get current branch name
		const currentBranch = await this.getCurrentBranch(repoPath);
		if (currentBranch === 'unknown' || currentBranch === 'detached') {
			return 'none';
		}

		// Use git branch -vv to get detailed tracking info
		const result = await this.executeGitCommand(repoPath, ['branch', '-vv']);
		if (!result.success) {
			return 'none';
		}

		// Parse output to find the current branch line
		// Format: * branch-name  commit [origin/branch: gone] commit message
		// or:     * branch-name  commit [origin/branch] commit message
		// or:     * branch-name  commit [origin/branch: ahead 1] commit message
		const lines = result.stdout.split('\n');
		for (const line of lines) {
			// Current branch starts with '* '
			if (line.startsWith('* ')) {
				// Check if the line contains tracking info with :gone
				// The pattern is [remote/branch: gone] or [remote/branch]
				const goneMatch = line.match(/\[.+: gone\]/);
				if (goneMatch) {
					return 'gone';
				}

				// Check if there's any tracking info at all
				const trackingMatch = line.match(/\[.+?\]/);
				if (trackingMatch) {
					return 'active';
				}

				// No tracking info found
				return 'none';
			}
		}

		return 'none';
	}
}
