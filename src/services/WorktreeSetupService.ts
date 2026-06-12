import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import type { InitActionsStatus, Worktree } from '../storage/types.js';
import { getDirenvWarning, wrapSpawnWithDirenv } from '../utils/direnv.js';
import type { IFileService } from './FileService.js';
import type { IGitService } from './GitService.js';
import type { MergedGroveConfig } from './types.js';

/**
 * Parameters describing the single worktree to set up. The caller (GroveService)
 * computes the branch name and worktree path — which differ between fresh grove
 * creation and ad-hoc worktree adds — and passes them in.
 */
export interface SetupWorktreeParams {
	/** Repository root the worktree is created from */
	repoPath: string;
	/** Human-readable repository name (used in messages) */
	repoName: string;
	/** Grove directory (where init-action logs are written) */
	grovePath: string;
	/** Worktree folder name (used for the init-action log filename) */
	worktreeName: string;
	/** Absolute path the worktree is created at */
	worktreePath: string;
	/** Branch to create for the worktree */
	branchName: string;
	/** Optional monorepo project path within the repository */
	projectPath?: string;
	/** Merged repo/project grove configuration (copy patterns, init actions) */
	mergedConfig: MergedGroveConfig;
	/**
	 * When set, branch the new worktree off this branch instead of the repository's
	 * main branch. Skips the main-branch update and reset-to-main behaviour (fork flow).
	 */
	forkFromBranch?: string;
	/** Optional callback for progress logging */
	onLog?: (message: string) => void;
}

/**
 * Result of setting up one worktree.
 */
export interface SetupWorktreeResult {
	/** Status of any init actions that ran (undefined when none were configured) */
	initActionsStatus?: InitActionsStatus;
	/**
	 * Non-fatal per-worktree failures (file-copy errors, init-action failures).
	 * Collected and returned rather than logged-and-dropped so the caller can
	 * surface them in its result.
	 */
	errors: string[];
}

/**
 * Worktree setup service interface
 * Performs the filesystem/git work for ONE worktree: branch creation, optional
 * reset-to-main, file-copy patterns, and init-action execution + logging.
 */
export interface IWorktreeSetupService {
	/**
	 * Create and provision a single worktree: add the git worktree (optionally
	 * forking off another branch), reset to the latest main branch when needed,
	 * copy configured file patterns, and run init actions. Throws if the worktree
	 * itself cannot be created; non-fatal copy/init-action failures are returned in
	 * the result's `errors` array.
	 */
	setupWorktree(params: SetupWorktreeParams): Promise<SetupWorktreeResult>;
	/**
	 * Remove a worktree's git registration (the close-side counterpart of
	 * {@link setupWorktree}). Returns any errors encountered; never throws.
	 */
	teardownWorktree(worktree: Worktree): Promise<string[]>;
}

/**
 * Service that provisions and tears down individual worktrees on behalf of
 * GroveService, which keeps the grove-level orchestration and persistence.
 */
export class WorktreeSetupService implements IWorktreeSetupService {
	constructor(
		private readonly gitService: IGitService,
		private readonly fileService: IFileService
	) {}

	/**
	 * Create and provision a single worktree. See {@link IWorktreeSetupService.setupWorktree}.
	 */
	async setupWorktree(params: SetupWorktreeParams): Promise<SetupWorktreeResult> {
		const {
			repoPath,
			repoName,
			grovePath,
			worktreeName,
			worktreePath,
			branchName,
			projectPath,
			mergedConfig,
			forkFromBranch,
			onLog,
		} = params;
		const displayName = projectPath ? `${repoName}/${projectPath}` : repoName;
		const errors: string[] = [];

		// Ensure repository is up-to-date before creating worktree. When forking, the new
		// worktree branches off an existing worktree's branch, so we skip both the
		// main-branch update and the reset-to-main behaviour.
		let needsReset = false;
		let mainBranch = '';
		let baseRef = 'HEAD';
		if (forkFromBranch) {
			if (onLog) {
				onLog(`Forking from branch ${forkFromBranch}...`);
			}
			baseRef = forkFromBranch;
		} else {
			({ needsReset, mainBranch } = await this.ensureRepoUpToDate(repoPath, onLog));
		}

		// Add worktree (creates the new branch from baseRef)
		const result = await this.gitService.addWorktree(repoPath, worktreePath, branchName, baseRef);
		if (!result.success) {
			throw new Error(result.stderr || 'Failed to create worktree');
		}

		// If we need to reset the worktree to the latest main branch, do it now
		if (needsReset) {
			if (onLog) {
				onLog(`Resetting worktree to latest ${mainBranch}...`);
			}

			// Fetch in the new worktree
			const fetchResult = await this.gitService.fetch(worktreePath);
			if (!fetchResult.success) {
				console.warn(`Warning: Failed to fetch in worktree: ${fetchResult.stderr}`);
			}

			// Get the SHA of the remote main branch
			const revParseResult = await this.gitService.revParse(worktreePath, `origin/${mainBranch}`);

			if (revParseResult.success) {
				const targetCommit = revParseResult.stdout.trim();

				// Reset to the latest remote commit
				const resetResult = await this.gitService.reset(worktreePath, targetCommit, true);

				if (!resetResult.success) {
					console.warn(`Warning: Failed to reset worktree: ${resetResult.stderr}`);
				} else if (onLog) {
					onLog(`Worktree reset to latest ${mainBranch} (${targetCommit.substring(0, 7)})`);
				}
			} else {
				console.warn(`Warning: Failed to resolve origin/${mainBranch}: ${revParseResult.stderr}`);
			}
		}

		// Copy files matching patterns from repository root to worktree
		if (mergedConfig.rootFileCopyPatterns.length > 0) {
			const copyResult = await this.fileService.copyFilesFromPatterns(
				repoPath,
				worktreePath,
				mergedConfig.rootFileCopyPatterns
			);

			if (!copyResult.success && copyResult.errors.length > 0) {
				errors.push(
					`Failed to copy some files from ${repoName} root:\n${copyResult.errors.join('\n')}`
				);
			}
		}

		// Copy files matching patterns from project folder to worktree (for monorepos).
		// These patterns are relative to the project folder, not the repo root.
		if (projectPath && mergedConfig.projectFileCopyPatterns.length > 0) {
			const projectSourcePath = path.join(repoPath, projectPath);
			const projectDestPath = path.join(worktreePath, projectPath);

			const copyResult = await this.fileService.copyFilesFromPatterns(
				projectSourcePath,
				projectDestPath,
				mergedConfig.projectFileCopyPatterns
			);

			if (!copyResult.success && copyResult.errors.length > 0) {
				errors.push(
					`Failed to copy some files from ${repoName}/${projectPath}:\n${copyResult.errors.join('\n')}`
				);
			}
		}

		// Execute initActions if configured. Combine root and project initActions
		// (root first, then project).
		let initActionsStatus: InitActionsStatus | undefined;
		const initActions = [...mergedConfig.rootInitActions, ...mergedConfig.projectInitActions];
		if (initActions.length > 0) {
			try {
				initActionsStatus = await this.executeInitActions(
					initActions,
					grovePath,
					worktreeName,
					worktreePath,
					projectPath,
					onLog
				);

				if (!initActionsStatus.success) {
					errors.push(`InitActions failed for ${displayName}: ${initActionsStatus.errorMessage}`);
				}
			} catch (error) {
				const errMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`Failed to execute initActions for ${displayName}: ${errMsg}`);
			}
		}

		return { initActionsStatus, errors };
	}

	/**
	 * Remove a worktree's git registration. See {@link IWorktreeSetupService.teardownWorktree}.
	 */
	async teardownWorktree(worktree: Worktree): Promise<string[]> {
		const errors: string[] = [];
		try {
			const result = await this.gitService.removeWorktree(
				worktree.repositoryPath,
				worktree.worktreePath,
				true
			);

			if (!result.success) {
				errors.push(`Failed to remove worktree ${worktree.repositoryName}: ${result.stderr}`);
			}
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			errors.push(`Error removing worktree ${worktree.repositoryName}: ${errorMsg}`);
		}
		return errors;
	}

	/**
	 * Ensure repository is up-to-date before creating worktree
	 * @param repoPath - Repository root path
	 * @param onLog - Optional callback for logging
	 * @returns Object with info about whether we need to reset the worktree after creation
	 */
	private async ensureRepoUpToDate(
		repoPath: string,
		onLog?: (message: string) => void
	): Promise<{ needsReset: boolean; mainBranch: string }> {
		// Detect main branch (master, main, or current branch)
		const mainBranch = await this.gitService.detectMainBranch(repoPath);

		if (onLog) {
			onLog(`Detected main branch: ${mainBranch}`);
		}

		// Get current branch
		const currentBranch = await this.gitService.getCurrentBranch(repoPath);

		// Check for uncommitted changes
		const hasChanges = await this.gitService.hasUncommittedChanges(repoPath);

		// If on main branch with no uncommitted changes, fetch and pull
		if (currentBranch === mainBranch && !hasChanges) {
			if (onLog) {
				onLog(`Repository is on ${mainBranch} with no uncommitted changes, updating...`);
			}

			// Fetch from remote
			const fetchResult = await this.gitService.fetch(repoPath);
			if (!fetchResult.success) {
				console.warn(`Warning: Failed to fetch from remote: ${fetchResult.stderr}`);
			}

			// Pull latest changes
			const pullResult = await this.gitService.pull(repoPath);
			if (!pullResult.success) {
				console.warn(`Warning: Failed to pull latest changes: ${pullResult.stderr}`);
			}

			if (onLog) {
				onLog(`Repository updated to latest ${mainBranch}`);
			}

			return { needsReset: false, mainBranch };
		}

		// If on a different branch or has uncommitted changes, we'll reset after worktree creation
		if (onLog) {
			if (currentBranch !== mainBranch) {
				onLog(`Repository is on ${currentBranch}, will reset worktree to latest ${mainBranch}`);
			} else {
				onLog(`Repository has uncommitted changes, will reset worktree to latest ${mainBranch}`);
			}
		}

		return { needsReset: true, mainBranch };
	}

	/**
	 * Execute initActions for a worktree
	 * @param actions - Array of bash commands to execute
	 * @param grovePath - Path to the grove directory (where log will be stored)
	 * @param worktreeName - Name of the worktree (for log file naming)
	 * @param worktreePath - Path to the worktree directory
	 * @param projectPath - Optional project path for monorepos
	 * @param onLog - Optional callback for live log streaming
	 * @returns Status of initActions execution
	 */
	private async executeInitActions(
		actions: string[],
		grovePath: string,
		worktreeName: string,
		worktreePath: string,
		projectPath?: string,
		onLog?: (message: string) => void
	): Promise<InitActionsStatus> {
		const logFileName = `grove-init-${worktreeName}.log`;
		const logFilePath = path.join(grovePath, logFileName);
		const executedAt = new Date().toISOString();

		// Determine the working directory (project path if monorepo, otherwise worktree root)
		const workingDir = projectPath ? path.join(worktreePath, projectPath) : worktreePath;

		// Create log file with header
		const logHeader = `Grove InitActions Execution Log
Executed at: ${executedAt}
Working directory: ${workingDir}
Total actions: ${actions.length}

${'='.repeat(80)}

`;
		await fs.promises.writeFile(logFilePath, logHeader);

		// Log initialization
		if (onLog) {
			onLog(`[${worktreeName}] Starting initActions (${actions.length} commands)...`);
		}

		// Warn once if the directory uses direnv but its .envrc is not yet allowed
		// (init actions would run WITHOUT that environment until `direnv allow` is
		// run), or if a stale direnv environment from another directory is loaded.
		const direnvWarning = getDirenvWarning(workingDir);
		if (direnvWarning) {
			await fs.promises.appendFile(logFilePath, `⚠ ${direnvWarning}\n\n`);
			if (onLog) {
				onLog(`[${worktreeName}] ⚠ ${direnvWarning}`);
			}
		}

		let successfulActions = 0;
		let errorMessage: string | undefined;

		// Execute each action sequentially
		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];
			const actionHeader = `[Action ${i + 1}/${actions.length}] ${action}\n${'-'.repeat(80)}\n`;

			// Append action header to log
			await fs.promises.appendFile(logFilePath, actionHeader);

			// Log command start
			if (onLog) {
				onLog(`[${worktreeName}] Running: ${action}`);
			}

			try {
				// Execute the command
				const { success, stdout, stderr, exitCode } = await this.executeCommand(action, workingDir);

				// Append output to log
				if (stdout) {
					await fs.promises.appendFile(logFilePath, `STDOUT:\n${stdout}\n`);
					// Stream stdout to callback
					if (onLog && stdout.trim()) {
						onLog(`[${worktreeName}] ${stdout.trim()}`);
					}
				}
				if (stderr) {
					await fs.promises.appendFile(logFilePath, `STDERR:\n${stderr}\n`);
				}
				await fs.promises.appendFile(logFilePath, `Exit code: ${exitCode}\n\n`);

				if (!success) {
					errorMessage = `Action ${i + 1} failed with exit code ${exitCode}: ${action}`;
					await fs.promises.appendFile(
						logFilePath,
						`\n${'='.repeat(80)}\nEXECUTION STOPPED: ${errorMessage}\n`
					);
					if (onLog) {
						onLog(`[${worktreeName}] ✗ Failed with exit code ${exitCode}`);
					}
					break;
				}

				successfulActions++;
				if (onLog) {
					onLog(`[${worktreeName}] ✓ Command completed successfully`);
				}
			} catch (error) {
				const errMsg = error instanceof Error ? error.message : 'Unknown error';
				errorMessage = `Action ${i + 1} failed: ${errMsg}`;
				await fs.promises.appendFile(logFilePath, `ERROR: ${errMsg}\n\n`);
				await fs.promises.appendFile(
					logFilePath,
					`\n${'='.repeat(80)}\nEXECUTION STOPPED: ${errorMessage}\n`
				);
				if (onLog) {
					onLog(`[${worktreeName}] ✗ Error: ${errMsg}`);
				}
				break;
			}
		}

		// Log completion
		if (onLog) {
			const status = successfulActions === actions.length ? '✓ SUCCESS' : '✗ FAILED';
			onLog(`[${worktreeName}] ${status}: ${successfulActions}/${actions.length} actions completed`);
		}

		// Append summary to log
		const success = successfulActions === actions.length;
		const summary = `
${'='.repeat(80)}
EXECUTION SUMMARY
${'='.repeat(80)}
Total actions: ${actions.length}
Successful: ${successfulActions}
Status: ${success ? 'SUCCESS' : 'FAILED'}
${errorMessage ? `Error: ${errorMessage}` : ''}
Completed at: ${new Date().toISOString()}
`;
		await fs.promises.appendFile(logFilePath, summary);

		return {
			executed: true,
			success,
			executedAt,
			logFile: logFileName,
			totalActions: actions.length,
			successfulActions,
			errorMessage,
		};
	}

	/**
	 * Execute a single bash command
	 * @param command - The command to execute
	 * @param cwd - Working directory
	 * @returns Execution result
	 */
	private async executeCommand(
		command: string,
		cwd: string
	): Promise<{ success: boolean; stdout: string; stderr: string; exitCode: number }> {
		return new Promise((resolve) => {
			// Wrap with `direnv exec` when the worktree uses direnv so init actions
			// run with the same environment an interactive shell would load.
			const { command: spawnCommand, args } = wrapSpawnWithDirenv(cwd, 'bash', ['-c', command]);
			const childProcess = spawn(spawnCommand, args, {
				cwd,
				stdio: ['ignore', 'pipe', 'pipe'],
			});

			let stdout = '';
			let stderr = '';

			childProcess.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			childProcess.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			childProcess.on('close', (code) => {
				resolve({
					success: code === 0,
					stdout,
					stderr,
					exitCode: code ?? 1,
				});
			});

			childProcess.on('error', (error) => {
				resolve({
					success: false,
					stdout,
					stderr: stderr + error.message,
					exitCode: 1,
				});
			});
		});
	}
}
