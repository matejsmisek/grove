import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { getBranchNameForRepo, readGroveRepoConfig } from '../storage/groveConfig.js';
import {
	readGroveMetadata,
	readGrovesIndex,
	writeGroveMetadata,
	writeGrovesIndex,
} from '../storage/groves.js';
import { readSettings } from '../storage/storage.js';
import type { GroveMetadata, GroveReference, Repository, Worktree } from '../storage/types.js';
import { ContextService } from './ContextService.js';
import { FileService } from './FileService.js';
import { GitService } from './GitService.js';

export interface CreateGroveResult {
	success: boolean;
	metadata?: GroveMetadata;
	errors: string[];
}

export interface CloseGroveResult {
	success: boolean;
	errors: string[];
	message?: string;
}

/**
 * Service for grove lifecycle operations (create, close)
 * Handles the business logic of grove management while delegating
 * storage operations to the storage layer
 */
export class GroveService {
	private fileService: FileService;
	private contextService: ContextService;

	constructor() {
		this.fileService = new FileService();
		this.contextService = new ContextService();
	}

	/**
	 * Generate a unique ID for a grove
	 */
	private generateGroveId(): string {
		return crypto.randomBytes(16).toString('hex');
	}

	/**
	 * Create a new grove with worktrees for selected repositories
	 * @param name - Name of the grove
	 * @param repositories - Array of repositories to include
	 * @returns The created grove metadata
	 */
	async createGrove(name: string, repositories: Repository[]): Promise<GroveMetadata> {
		const settings = readSettings();
		const groveId = this.generateGroveId();
		const grovePath = path.join(settings.workingFolder, name);

		// Check if grove folder already exists
		if (fs.existsSync(grovePath)) {
			throw new Error(`Grove folder already exists: ${grovePath}`);
		}

		// Create grove folder
		fs.mkdirSync(grovePath, { recursive: true });

		// Create grove metadata
		const now = new Date().toISOString();

		// Create CONTEXT.md file
		this.contextService.createContextFile(grovePath, {
			name,
			createdAt: now,
			repositories,
		});

		const metadata: GroveMetadata = {
			id: groveId,
			name,
			worktrees: [],
			createdAt: now,
			updatedAt: now,
		};

		// Create worktrees for each repository
		const worktrees: Worktree[] = [];
		const errors: string[] = [];

		for (const repo of repositories) {
			try {
				// Read repository grove configuration
				const repoConfig = readGroveRepoConfig(repo.path);

				// Generate branch name for this grove using repo config or default
				const branchName = getBranchNameForRepo(repo.path, name);

				// Create worktree path
				const worktreePath = path.join(grovePath, `${repo.name}.worktree`);

				// Create GitService for the repository
				const gitService = new GitService(repo.path);

				// Add worktree (creates new branch from HEAD)
				const result = await gitService.addWorktree(worktreePath, branchName, 'HEAD');

				if (!result.success) {
					throw new Error(result.stderr || 'Failed to create worktree');
				}

				// Copy files matching patterns from repository to worktree
				if (repoConfig.fileCopyPatterns && repoConfig.fileCopyPatterns.length > 0) {
					const copyResult = await this.fileService.copyFilesFromPatterns(
						repo.path,
						worktreePath,
						repoConfig.fileCopyPatterns
					);

					if (!copyResult.success && copyResult.errors.length > 0) {
						console.warn(
							`Warning: Failed to copy some files for ${repo.name}:\n${copyResult.errors.join('\n')}`
						);
					}
				}

				// Create worktree entry
				const worktree: Worktree = {
					repositoryName: repo.name,
					repositoryPath: repo.path,
					worktreePath,
					branch: branchName,
				};

				worktrees.push(worktree);
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`${repo.name}: ${errorMsg}`);
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
		writeGroveMetadata(grovePath, metadata);

		// Add to groves index
		const index = readGrovesIndex();
		const groveRef: GroveReference = {
			id: groveId,
			name,
			path: grovePath,
			createdAt: now,
			updatedAt: now,
		};
		index.groves.push(groveRef);
		writeGrovesIndex(index);

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
		const index = readGrovesIndex();
		const groveRef = index.groves.find((ref) => ref.id === groveId);

		if (!groveRef) {
			return { success: false, errors: [], message: 'Grove not found' };
		}

		// Read grove metadata to get worktree info
		const metadata = readGroveMetadata(groveRef.path);
		const errors: string[] = [];

		// Remove all worktrees using GitService
		if (metadata && metadata.worktrees.length > 0) {
			for (const worktree of metadata.worktrees) {
				try {
					const gitService = new GitService(worktree.repositoryPath);
					const result = await gitService.removeWorktree(worktree.worktreePath, true);

					if (!result.success) {
						errors.push(`Failed to remove worktree ${worktree.repositoryName}: ${result.stderr}`);
					}
				} catch (error) {
					const errorMsg = error instanceof Error ? error.message : 'Unknown error';
					errors.push(`Error removing worktree ${worktree.repositoryName}: ${errorMsg}`);
				}
			}
		}

		// Remove from groves index
		index.groves = index.groves.filter((ref) => ref.id !== groveId);
		writeGrovesIndex(index);

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
