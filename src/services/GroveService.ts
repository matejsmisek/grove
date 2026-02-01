import { spawn } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import type {
	GroveMetadata,
	InitActionsStatus,
	Repository,
	RepositorySelection,
	Worktree,
} from '../storage/types.js';
import { generateGroveIdentifier, normalizeGroveName, normalizeName } from '../utils/index.js';
import type {
	CloseGroveResult,
	IContextService,
	IFileService,
	IGitService,
	IGroveConfigService,
	IGroveService,
	IGrovesService,
	ISettingsService,
} from './interfaces.js';

// Re-export types for backward compatibility
export type { CloseGroveResult, CreateGroveResult } from './interfaces.js';

/**
 * Service for grove lifecycle operations (create, close)
 * Handles the business logic of grove management while delegating
 * storage operations to the storage layer
 *
 * Uses dependency injection for all dependencies
 */
export class GroveService implements IGroveService {
	constructor(
		private readonly settingsService: ISettingsService,
		private readonly grovesService: IGrovesService,
		private readonly groveConfigService: IGroveConfigService,
		private readonly gitService: IGitService,
		private readonly contextService: IContextService,
		private readonly fileService: IFileService
	) {}

	/**
	 * Generate a unique ID for a grove
	 */
	private generateGroveId(): string {
		return crypto.randomBytes(16).toString('hex');
	}

	/**
	 * Generate a unique worktree name for a selection
	 * Handles monorepo projects by appending project name
	 * Includes grove suffix to make worktree folders globally unique
	 */
	private generateWorktreeName(
		selection: RepositorySelection,
		existingNames: Set<string>,
		groveSuffix: string
	): string {
		// Lowercase the base name for uniform identifiers across grove, folders, worktrees, and branches
		const baseName = selection.projectPath
			? `${selection.repository.name}-${selection.projectPath}`.toLowerCase()
			: selection.repository.name.toLowerCase();

		// Include grove suffix to make the worktree folder globally unique
		const baseNameWithSuffix = groveSuffix ? `${baseName}-${groveSuffix}` : baseName;

		let name = baseNameWithSuffix;
		let counter = 1;

		// Handle duplicate names by appending a counter
		while (existingNames.has(name)) {
			name = `${baseNameWithSuffix}-${counter}`;
			counter++;
		}

		existingNames.add(name);
		return name;
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
		fs.writeFileSync(logFilePath, logHeader);

		// Log initialization
		if (onLog) {
			onLog(`[${worktreeName}] Starting initActions (${actions.length} commands)...`);
		}

		let successfulActions = 0;
		let errorMessage: string | undefined;

		// Execute each action sequentially
		for (let i = 0; i < actions.length; i++) {
			const action = actions[i];
			const actionHeader = `[Action ${i + 1}/${actions.length}] ${action}\n${'-'.repeat(80)}\n`;

			// Append action header to log
			fs.appendFileSync(logFilePath, actionHeader);

			// Log command start
			if (onLog) {
				onLog(`[${worktreeName}] Running: ${action}`);
			}

			try {
				// Execute the command
				const { success, stdout, stderr, exitCode } = await this.executeCommand(action, workingDir);

				// Append output to log
				if (stdout) {
					fs.appendFileSync(logFilePath, `STDOUT:\n${stdout}\n`);
					// Stream stdout to callback
					if (onLog && stdout.trim()) {
						onLog(`[${worktreeName}] ${stdout.trim()}`);
					}
				}
				if (stderr) {
					fs.appendFileSync(logFilePath, `STDERR:\n${stderr}\n`);
				}
				fs.appendFileSync(logFilePath, `Exit code: ${exitCode}\n\n`);

				if (!success) {
					errorMessage = `Action ${i + 1} failed with exit code ${exitCode}: ${action}`;
					fs.appendFileSync(logFilePath, `\n${'='.repeat(80)}\nEXECUTION STOPPED: ${errorMessage}\n`);
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
				fs.appendFileSync(logFilePath, `ERROR: ${errMsg}\n\n`);
				fs.appendFileSync(logFilePath, `\n${'='.repeat(80)}\nEXECUTION STOPPED: ${errorMessage}\n`);
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
		fs.appendFileSync(logFilePath, summary);

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
			const childProcess = spawn('bash', ['-c', command], {
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
	 * Create a new grove with worktrees for selected repositories
	 * @param name - Name of the grove (will be normalized for folder/branch names)
	 * @param selections - Array of repository selections, each optionally with a project path
	 * @param onLog - Optional callback for progress logging
	 * @returns The created grove metadata
	 */
	async createGrove(
		name: string,
		selections: RepositorySelection[],
		onLog?: (message: string) => void
	): Promise<GroveMetadata> {
		const settings = this.settingsService.readSettings();
		const groveId = this.generateGroveId();
		// Generate the unique grove identifier first
		const groveIdentifier = generateGroveIdentifier(name);
		// Normalize the grove name for use in folder paths and branch names
		const normalizedName = normalizeGroveName(name, groveIdentifier);
		const grovePath = path.join(settings.workingFolder, normalizedName);

		// Check if grove folder already exists
		if (fs.existsSync(grovePath)) {
			throw new Error(`Grove folder already exists: ${grovePath}`);
		}

		// Create grove folder
		fs.mkdirSync(grovePath, { recursive: true });

		// Create grove metadata
		const now = new Date().toISOString();

		// Extract unique repositories for CONTEXT.md
		const uniqueRepos = new Map<string, Repository>();
		for (const selection of selections) {
			uniqueRepos.set(selection.repository.path, selection.repository);
		}

		// Create CONTEXT.md file
		this.contextService.createContextFile(grovePath, {
			name,
			createdAt: now,
			repositories: Array.from(uniqueRepos.values()),
		});

		const metadata: GroveMetadata = {
			id: groveId,
			name,
			identifier: groveIdentifier,
			worktrees: [],
			createdAt: now,
			updatedAt: now,
		};

		// Create worktrees for each selection
		const worktrees: Worktree[] = [];
		const errors: string[] = [];
		const worktreeNames = new Set<string>();

		for (const selection of selections) {
			const repo = selection.repository;
			const worktreeName = this.generateWorktreeName(selection, worktreeNames, groveIdentifier);

			try {
				// Log worktree creation start
				const displayName = selection.projectPath ? `${repo.name}/${selection.projectPath}` : repo.name;
				if (onLog) {
					onLog(`Creating worktree for ${displayName}...`);
				}

				// Ensure repository is up-to-date before creating worktree
				const { needsReset, mainBranch } = await this.ensureRepoUpToDate(repo.path, onLog);

				// Read merged repository/project grove configuration
				const mergedConfig = this.groveConfigService.readMergedConfig(repo.path, selection.projectPath);

				// Generate branch name for this grove using merged config
				// Use normalized name for consistency with folder naming
				// For monorepo projects, the branch suffix is added automatically
				const branchBase = this.groveConfigService.getBranchNameForSelection(
					repo.path,
					normalizedName,
					selection.projectPath
				);
				// Lowercase the project path suffix for uniform identifiers
				const branchSuffix = selection.projectPath ? `-${selection.projectPath.toLowerCase()}` : '';
				const branchName = branchBase + branchSuffix;

				// Create worktree path (identifier already included in worktreeName)
				const worktreePath = path.join(grovePath, worktreeName);

				// Add worktree (creates new branch from HEAD)
				const result = await this.gitService.addWorktree(repo.path, worktreePath, branchName, 'HEAD');

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
						repo.path,
						worktreePath,
						mergedConfig.rootFileCopyPatterns
					);

					if (!copyResult.success && copyResult.errors.length > 0) {
						console.warn(
							`Warning: Failed to copy some files from ${repo.name} root:\n${copyResult.errors.join('\n')}`
						);
					}
				}

				// Copy files matching patterns from project folder to worktree (for monorepos)
				// These patterns are relative to the project folder, not the repo root
				if (selection.projectPath && mergedConfig.projectFileCopyPatterns.length > 0) {
					const projectSourcePath = path.join(repo.path, selection.projectPath);
					const projectDestPath = path.join(worktreePath, selection.projectPath);

					const copyResult = await this.fileService.copyFilesFromPatterns(
						projectSourcePath,
						projectDestPath,
						mergedConfig.projectFileCopyPatterns
					);

					if (!copyResult.success && copyResult.errors.length > 0) {
						console.warn(
							`Warning: Failed to copy some files from ${repo.name}/${selection.projectPath}:\n${copyResult.errors.join('\n')}`
						);
					}
				}

				// Execute initActions if configured
				// Combine root and project initActions (root first, then project)
				let initActionsStatus: InitActionsStatus | undefined;
				const initActions = [...mergedConfig.rootInitActions, ...mergedConfig.projectInitActions];
				if (initActions.length > 0) {
					try {
						initActionsStatus = await this.executeInitActions(
							initActions,
							grovePath,
							worktreeName,
							worktreePath,
							selection.projectPath,
							onLog
						);

						// If initActions failed, add a warning
						if (!initActionsStatus.success) {
							console.warn(
								`Warning: InitActions failed for ${repo.name}${selection.projectPath ? `/${selection.projectPath}` : ''}: ${initActionsStatus.errorMessage}`
							);
						}
					} catch (error) {
						const errMsg = error instanceof Error ? error.message : 'Unknown error';
						console.warn(
							`Warning: Failed to execute initActions for ${repo.name}${selection.projectPath ? `/${selection.projectPath}` : ''}: ${errMsg}`
						);
					}
				}

				// Determine worktree display name
				// For single worktree groves, use the grove name
				// For multiple worktrees, use repo name (or repo/project for monorepos)
				const worktreeDisplayName =
					selections.length === 1
						? name
						: selection.projectPath
							? `${repo.name}/${selection.projectPath}`
							: repo.name;

				// Create worktree entry
				const worktree: Worktree = {
					name: worktreeDisplayName,
					repositoryName: repo.name,
					repositoryPath: repo.path,
					worktreePath,
					branch: branchName,
					projectPath: selection.projectPath,
					initActionsStatus,
				};

				worktrees.push(worktree);
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				const displayName = selection.projectPath ? `${repo.name}/${selection.projectPath}` : repo.name;
				errors.push(`${displayName}: ${errorMsg}`);
			}
		}

		// If selections were provided but no worktrees were created, that's an error
		// Empty selections (empty grove) is allowed - worktrees can be added later
		if (selections.length > 0 && worktrees.length === 0) {
			fs.rmSync(grovePath, { recursive: true, force: true });
			throw new Error(`Failed to create any worktrees:\n${errors.join('\n')}`);
		}

		// Update metadata with created worktrees
		metadata.worktrees = worktrees;

		// Save grove metadata to grove.json
		this.grovesService.writeGroveMetadata(grovePath, metadata);

		// Add to groves index
		this.grovesService.addGroveToIndex({
			id: groveId,
			name,
			path: grovePath,
			createdAt: now,
			updatedAt: now,
		});

		// If there were partial errors, include them in the error message
		if (errors.length > 0) {
			throw new Error(
				`Grove created with ${worktrees.length} worktree(s), but ${errors.length} failed:\n${errors.join('\n')}`
			);
		}

		return metadata;
	}

	/**
	 * Add a worktree to an existing grove
	 * @param groveId - ID of the grove to add the worktree to
	 * @param selection - Repository selection (with optional project path for monorepos)
	 * @param worktreeName - Custom name for the worktree (will be used for folder and branch)
	 * @param onLog - Optional callback for progress logging
	 * @returns Updated grove metadata
	 */
	async addWorktreeToGrove(
		groveId: string,
		selection: RepositorySelection,
		worktreeName: string,
		onLog?: (message: string) => void
	): Promise<GroveMetadata> {
		// Get grove reference
		const groveRef = this.grovesService.getGroveById(groveId);
		if (!groveRef) {
			throw new Error('Grove not found');
		}

		// Read existing grove metadata
		const metadata = this.grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			throw new Error('Grove metadata not found');
		}

		const grovePath = groveRef.path;
		const repo = selection.repository;

		// Get grove identifier from metadata, or generate for backward compatibility with existing groves
		let groveIdentifier = metadata.identifier;
		if (!groveIdentifier) {
			// Generate identifier from grove name for backward compatibility
			groveIdentifier = generateGroveIdentifier(metadata.name);
			// Save it to metadata for future use
			metadata.identifier = groveIdentifier;
		}

		// Normalize worktree name for use in folder and branch
		// Uses same normalization as grove names: lowercase, remove special chars, collapse hyphens
		const baseWorktreeName = normalizeName(worktreeName, 40, 'worktree');
		// Append grove identifier for consistency with other worktrees in the grove
		const normalizedWorktreeName = `${baseWorktreeName}-${groveIdentifier}`;

		// Check if worktree name already exists in this grove
		const existingWorktreeNames = new Set(
			metadata.worktrees.map((w) => path.basename(w.worktreePath))
		);
		if (existingWorktreeNames.has(normalizedWorktreeName)) {
			throw new Error(`Worktree with name "${normalizedWorktreeName}" already exists in this grove`);
		}

		try {
			// Log worktree creation start
			const displayName = selection.projectPath ? `${repo.name}/${selection.projectPath}` : repo.name;
			if (onLog) {
				onLog(`Creating worktree for ${displayName}...`);
			}

			// Ensure repository is up-to-date before creating worktree
			const { needsReset, mainBranch } = await this.ensureRepoUpToDate(repo.path, onLog);

			// Read merged repository/project grove configuration
			const mergedConfig = this.groveConfigService.readMergedConfig(repo.path, selection.projectPath);

			// Generate branch name using the custom worktree name
			// Use the branchNameTemplate from config but replace with our custom name
			const branchTemplate = mergedConfig.branchNameTemplate || '${GROVE_NAME}';
			const branchBase = this.groveConfigService.applyBranchNameTemplate(
				branchTemplate,
				normalizedWorktreeName
			);
			// Lowercase the project path suffix for uniform identifiers
			const branchSuffix = selection.projectPath ? `-${selection.projectPath.toLowerCase()}` : '';
			const branchName = branchBase + branchSuffix;

			// Create worktree path
			const worktreePath = path.join(grovePath, normalizedWorktreeName);

			// Add worktree (creates new branch from HEAD)
			const result = await this.gitService.addWorktree(repo.path, worktreePath, branchName, 'HEAD');

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
					repo.path,
					worktreePath,
					mergedConfig.rootFileCopyPatterns
				);

				if (!copyResult.success && copyResult.errors.length > 0) {
					console.warn(
						`Warning: Failed to copy some files from ${repo.name} root:\n${copyResult.errors.join('\n')}`
					);
				}
			}

			// Copy files matching patterns from project folder to worktree (for monorepos)
			if (selection.projectPath && mergedConfig.projectFileCopyPatterns.length > 0) {
				const projectSourcePath = path.join(repo.path, selection.projectPath);
				const projectDestPath = path.join(worktreePath, selection.projectPath);

				const copyResult = await this.fileService.copyFilesFromPatterns(
					projectSourcePath,
					projectDestPath,
					mergedConfig.projectFileCopyPatterns
				);

				if (!copyResult.success && copyResult.errors.length > 0) {
					console.warn(
						`Warning: Failed to copy some files from ${repo.name}/${selection.projectPath}:\n${copyResult.errors.join('\n')}`
					);
				}
			}

			// Execute initActions if configured
			let initActionsStatus: InitActionsStatus | undefined;
			const initActions = [...mergedConfig.rootInitActions, ...mergedConfig.projectInitActions];
			if (initActions.length > 0) {
				try {
					initActionsStatus = await this.executeInitActions(
						initActions,
						grovePath,
						normalizedWorktreeName,
						worktreePath,
						selection.projectPath,
						onLog
					);

					if (!initActionsStatus.success) {
						console.warn(
							`Warning: InitActions failed for ${repo.name}${selection.projectPath ? `/${selection.projectPath}` : ''}: ${initActionsStatus.errorMessage}`
						);
					}
				} catch (error) {
					const errMsg = error instanceof Error ? error.message : 'Unknown error';
					console.warn(
						`Warning: Failed to execute initActions for ${repo.name}${selection.projectPath ? `/${selection.projectPath}` : ''}: ${errMsg}`
					);
				}
			}

			// Create worktree entry
			const worktree: Worktree = {
				name: worktreeName,
				repositoryName: repo.name,
				repositoryPath: repo.path,
				worktreePath,
				branch: branchName,
				projectPath: selection.projectPath,
				initActionsStatus,
			};

			// Add worktree to metadata
			metadata.worktrees.push(worktree);
			metadata.updatedAt = new Date().toISOString();

			// Save updated grove metadata
			this.grovesService.writeGroveMetadata(grovePath, metadata);

			// Update grove in index
			this.grovesService.updateGroveInIndex(groveId, { updatedAt: metadata.updatedAt });

			return metadata;
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			const displayName = selection.projectPath ? `${repo.name}/${selection.projectPath}` : repo.name;
			throw new Error(`Failed to add worktree for ${displayName}: ${errorMsg}`);
		}
	}

	/**
	 * Close a grove - removes worktrees and deletes the grove folder
	 * @param groveId - ID of the grove to close
	 * @returns Success status and any error messages
	 */
	async closeGrove(groveId: string): Promise<CloseGroveResult> {
		// Remove from groves index first to get the grove reference
		const groveRef = this.grovesService.removeGroveFromIndex(groveId);

		if (!groveRef) {
			return { success: false, errors: [], message: 'Grove not found' };
		}

		// Read grove metadata to get worktree info
		const metadata = this.grovesService.readGroveMetadata(groveRef.path);
		const errors: string[] = [];

		// Remove all worktrees using GitService
		if (metadata && metadata.worktrees.length > 0) {
			for (const worktree of metadata.worktrees) {
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
			}
		}

		// Delete the grove folder
		if (fs.existsSync(groveRef.path)) {
			try {
				fs.rmSync(groveRef.path, { recursive: true, force: true });
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`Failed to delete grove folder: ${errorMsg}`);
				return { success: false, errors };
			}
		}

		if (errors.length > 0) {
			return {
				success: false,
				errors,
				message: 'Grove closed with some errors',
			};
		}

		return { success: true, errors: [], message: 'Grove closed successfully' };
	}
}
