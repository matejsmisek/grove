import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import type { GroveMetadata, Repository, RepositorySelection, Worktree } from '../storage/types.js';
import { normalizeGroveName } from '../utils/index.js';
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
	 */
	private generateWorktreeName(selection: RepositorySelection, existingNames: Set<string>): string {
		const baseName = selection.projectPath
			? `${selection.repository.name}-${selection.projectPath}`
			: selection.repository.name;

		let name = baseName;
		let counter = 1;

		// Handle duplicate names by appending a counter
		while (existingNames.has(name)) {
			name = `${baseName}-${counter}`;
			counter++;
		}

		existingNames.add(name);
		return name;
	}

	/**
	 * Create a new grove with worktrees for selected repositories
	 * @param name - Name of the grove (will be normalized for folder/branch names)
	 * @param selections - Array of repository selections, each optionally with a project path
	 * @returns The created grove metadata
	 */
	async createGrove(name: string, selections: RepositorySelection[]): Promise<GroveMetadata> {
		const settings = this.settingsService.readSettings();
		const groveId = this.generateGroveId();
		// Normalize the grove name for use in folder paths and branch names
		const normalizedName = normalizeGroveName(name);
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
			const worktreeName = this.generateWorktreeName(selection, worktreeNames);

			try {
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
				const branchSuffix = selection.projectPath ? `-${selection.projectPath}` : '';
				const branchName = branchBase + branchSuffix;

				// Create worktree path
				const worktreePath = path.join(grovePath, `${worktreeName}.worktree`);

				// Add worktree (creates new branch from HEAD)
				const result = await this.gitService.addWorktree(repo.path, worktreePath, branchName, 'HEAD');

				if (!result.success) {
					throw new Error(result.stderr || 'Failed to create worktree');
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

				// Create worktree entry
				const worktree: Worktree = {
					repositoryName: repo.name,
					repositoryPath: repo.path,
					worktreePath,
					branch: branchName,
					projectPath: selection.projectPath,
				};

				worktrees.push(worktree);
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				const displayName = selection.projectPath ? `${repo.name}/${selection.projectPath}` : repo.name;
				errors.push(`${displayName}: ${errorMsg}`);
			}
		}

		// If no worktrees were created, clean up and throw error
		if (worktrees.length === 0) {
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
