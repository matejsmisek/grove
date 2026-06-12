import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import type { IGroveConfigService } from '../storage/GroveConfigService.js';
import type { IGrovesService } from '../storage/GrovesService.js';
import type { ISettingsService } from '../storage/SettingsService.js';
import type {
	GroveMetadata,
	Repository,
	RepositorySelection,
	Worktree,
	WorktreeReference,
} from '../storage/types.js';
import { generateGroveIdentifier, normalizeGroveName, normalizeName } from '../utils/index.js';
import type { IContextService } from './ContextService.js';
import type { IWorktreeSetupService } from './WorktreeSetupService.js';
import type { CloseGroveResult, CloseWorktreeResult } from './types.js';

// Re-export types for convenience
export type { CloseGroveResult, CloseWorktreeResult, CreateGroveResult } from './types.js';

/**
 * Grove service interface
 * Orchestrates grove lifecycle operations
 */
export interface IGroveService {
	/** Create a new grove with worktrees for selected repositories */
	createGrove(
		name: string,
		selections: RepositorySelection[],
		onLog?: (message: string) => void,
		reference?: WorktreeReference
	): Promise<GroveMetadata>;
	/** Add a worktree to an existing grove */
	addWorktreeToGrove(
		groveId: string,
		selection: RepositorySelection,
		worktreeName: string,
		onLog?: (message: string) => void,
		forkFromWorktreePath?: string,
		reference?: WorktreeReference
	): Promise<GroveMetadata>;
	/** Attach (or replace) an external reference on a worktree; returns updated metadata. */
	setWorktreeReference(
		groveId: string,
		worktreePath: string,
		reference: WorktreeReference
	): GroveMetadata;
	/** Record (or clear, with `undefined`) a worktree's background session; returns updated metadata. */
	setWorktreeBackgroundSession(
		groveId: string,
		worktreePath: string,
		sessionId: string | undefined,
		sessionName?: string
	): GroveMetadata;
	/**
	 * Read the init-actions execution log for a worktree.
	 * @returns The full log file contents
	 * @throws if the grove or worktree is missing, no init actions ran, or the log file can't be read
	 */
	readWorktreeInitLog(groveId: string, worktreePath: string): string;
	/** Close a grove - removes worktrees and deletes folder */
	closeGrove(groveId: string): Promise<CloseGroveResult>;
	/** Close a single worktree within a grove */
	closeWorktree(groveId: string, worktreePath: string): Promise<CloseWorktreeResult>;
}

/**
 * Service for grove lifecycle operations (create, close).
 * Owns grove-level orchestration and persistence, delegating the per-worktree
 * filesystem/git work to WorktreeSetupService.
 *
 * Uses dependency injection for all dependencies
 */
export class GroveService implements IGroveService {
	constructor(
		private readonly settingsService: ISettingsService,
		private readonly grovesService: IGrovesService,
		private readonly groveConfigService: IGroveConfigService,
		private readonly contextService: IContextService,
		private readonly worktreeSetupService: IWorktreeSetupService
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
		// Lowercase for uniform identifiers across grove/folders/worktrees/branches; flatten
		// nested project paths (e.g. "packages/core") so the folder and branch name stay valid.
		const baseName = selection.projectPath
			? `${selection.repository.name}-${selection.projectPath.replace(/[\\/]+/g, '-')}`.toLowerCase()
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
	 * Build the branch name for a grove-creation selection: the configured branch
	 * base plus a lowercased, flattened project-path suffix for monorepo projects.
	 */
	private branchNameForSelection(
		repoPath: string,
		normalizedGroveName: string,
		projectPath?: string
	): string {
		const branchBase = this.groveConfigService.getBranchNameForSelection(
			repoPath,
			normalizedGroveName,
			projectPath
		);
		return branchBase + this.projectBranchSuffix(projectPath);
	}

	/**
	 * Lowercased, flattened branch suffix for a monorepo project path (nested paths
	 * like "packages/core" must not introduce slashes into the branch name).
	 */
	private projectBranchSuffix(projectPath?: string): string {
		return projectPath ? `-${projectPath.replace(/[\\/]+/g, '-').toLowerCase()}` : '';
	}

	/**
	 * Create a new grove with worktrees for selected repositories. The grove name is
	 * normalized for folder/branch names; `reference` (e.g. an Asana task) is attached
	 * to each created worktree. Returns the created grove metadata.
	 */
	async createGrove(
		name: string,
		selections: RepositorySelection[],
		onLog?: (message: string) => void,
		reference?: WorktreeReference
	): Promise<GroveMetadata> {
		const settings = this.settingsService.readSettings();
		const groveId = this.generateGroveId();
		const groveIdentifier = generateGroveIdentifier(name);
		const normalizedName = normalizeGroveName(name, groveIdentifier);
		const grovePath = path.join(settings.workingFolder, normalizedName);

		if (fs.existsSync(grovePath)) {
			throw new Error(`Grove folder already exists: ${grovePath}`);
		}

		fs.mkdirSync(grovePath, { recursive: true });

		const now = new Date().toISOString();

		// Extract unique repositories for CONTEXT.md
		const uniqueRepos = new Map<string, Repository>();
		for (const selection of selections) {
			uniqueRepos.set(selection.repository.path, selection.repository);
		}

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

		const worktrees: Worktree[] = [];
		const errors: string[] = [];
		const worktreeNames = new Set<string>();

		for (const selection of selections) {
			const repo = selection.repository;
			const worktreeName = this.generateWorktreeName(selection, worktreeNames, groveIdentifier);
			const displayName = selection.projectPath ? `${repo.name}/${selection.projectPath}` : repo.name;

			try {
				if (onLog) {
					onLog(`Creating worktree for ${displayName}...`);
				}

				const mergedConfig = this.groveConfigService.readMergedConfig(repo.path, selection.projectPath);
				const branchName = this.branchNameForSelection(
					repo.path,
					normalizedName,
					selection.projectPath
				);
				const worktreePath = path.join(grovePath, worktreeName);

				// Provision the worktree (branch creation, reset, file copy, init actions)
				const setup = await this.worktreeSetupService.setupWorktree({
					repoPath: repo.path,
					repoName: repo.name,
					grovePath,
					worktreeName,
					worktreePath,
					branchName,
					projectPath: selection.projectPath,
					mergedConfig,
					onLog,
				});
				// Surface any non-fatal per-worktree failures (copy/init actions).
				errors.push(...setup.errors);

				// For single-worktree groves, use the grove name; for multiple, the repo (or repo/project) name.
				const worktreeDisplayName =
					selections.length === 1
						? name
						: selection.projectPath
							? `${repo.name}/${selection.projectPath}`
							: repo.name;

				worktrees.push({
					name: worktreeDisplayName,
					repositoryName: repo.name,
					repositoryPath: repo.path,
					worktreePath,
					branch: branchName,
					projectPath: selection.projectPath,
					initActionsStatus: setup.initActionsStatus,
					reference,
				});
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`${displayName}: ${errorMsg}`);
			}
		}

		// If selections were provided but no worktrees were created, that's an error.
		// Empty selections (empty grove) is allowed - worktrees can be added later
		if (selections.length > 0 && worktrees.length === 0) {
			fs.rmSync(grovePath, { recursive: true, force: true });
			throw new Error(`Failed to create any worktrees:\n${errors.join('\n')}`);
		}

		metadata.worktrees = worktrees;

		this.grovesService.writeGroveMetadata(grovePath, metadata);
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
	 * Add a worktree to an existing grove. `worktreeName` is normalized for the folder
	 * and branch. When `forkFromWorktreePath` is set, the new worktree branches off that
	 * worktree's branch (instead of the repo's main branch), skips the reset-to-main
	 * behaviour, and records the parent for tree display. `reference` (e.g. an Asana
	 * task) is attached to the worktree. Returns the updated grove metadata.
	 */
	async addWorktreeToGrove(
		groveId: string,
		selection: RepositorySelection,
		worktreeName: string,
		onLog?: (message: string) => void,
		forkFromWorktreePath?: string,
		reference?: WorktreeReference
	): Promise<GroveMetadata> {
		const groveRef = this.grovesService.getGroveById(groveId);
		if (!groveRef) {
			throw new Error('Grove not found');
		}

		const metadata = this.grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			throw new Error('Grove metadata not found');
		}

		const grovePath = groveRef.path;
		const repo = selection.repository;

		// Resolve the fork parent (if any). We branch off the parent worktree's current branch and
		// record the parentage so the grove detail view can render the fork as a child.
		let forkFromBranch: string | undefined;
		if (forkFromWorktreePath) {
			const parent = metadata.worktrees.find((w) => w.worktreePath === forkFromWorktreePath);
			if (!parent) {
				throw new Error('Worktree to fork from was not found in this grove');
			}
			forkFromBranch = parent.branch;
		}

		// Get grove identifier from metadata, or generate for backward compatibility with existing groves
		let groveIdentifier = metadata.identifier;
		if (!groveIdentifier) {
			groveIdentifier = generateGroveIdentifier(metadata.name);
			metadata.identifier = groveIdentifier;
		}

		// Normalize worktree name (same normalization as grove names), then append the
		// grove identifier for consistency with other worktrees in the grove.
		const baseWorktreeName = normalizeName(worktreeName, 40, 'worktree');
		const normalizedWorktreeName = `${baseWorktreeName}-${groveIdentifier}`;

		const existingWorktreeNames = new Set(
			metadata.worktrees.map((w) => path.basename(w.worktreePath))
		);
		if (existingWorktreeNames.has(normalizedWorktreeName)) {
			throw new Error(`Worktree with name "${normalizedWorktreeName}" already exists in this grove`);
		}

		const displayName = selection.projectPath ? `${repo.name}/${selection.projectPath}` : repo.name;

		try {
			if (onLog) {
				onLog(`Creating worktree for ${displayName}...`);
			}

			const mergedConfig = this.groveConfigService.readMergedConfig(repo.path, selection.projectPath);

			// Generate branch name using the custom worktree name and the configured template.
			const branchTemplate = mergedConfig.branchNameTemplate || '${GROVE_NAME}';
			const branchBase = this.groveConfigService.applyBranchNameTemplate(
				branchTemplate,
				normalizedWorktreeName
			);
			const branchName = branchBase + this.projectBranchSuffix(selection.projectPath);

			const worktreePath = path.join(grovePath, normalizedWorktreeName);

			// Provision the worktree. When forking, branch off the source worktree's branch;
			// otherwise branch off HEAD (and reset to main below if needed).
			const setup = await this.worktreeSetupService.setupWorktree({
				repoPath: repo.path,
				repoName: repo.name,
				grovePath,
				worktreeName: normalizedWorktreeName,
				worktreePath,
				branchName,
				projectPath: selection.projectPath,
				mergedConfig,
				forkFromBranch,
				onLog,
			});
			// Surface any non-fatal per-worktree failures (copy/init actions) in the log.
			if (onLog) {
				for (const err of setup.errors) {
					onLog(err);
				}
			}

			const worktree: Worktree = {
				name: worktreeName,
				repositoryName: repo.name,
				repositoryPath: repo.path,
				worktreePath,
				branch: branchName,
				projectPath: selection.projectPath,
				initActionsStatus: setup.initActionsStatus,
				forkedFromPath: forkFromWorktreePath,
				reference,
			};

			metadata.worktrees.push(worktree);
			metadata.updatedAt = new Date().toISOString();

			this.grovesService.writeGroveMetadata(grovePath, metadata);
			this.grovesService.updateGroveInIndex(groveId, { updatedAt: metadata.updatedAt });

			return metadata;
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Unknown error';
			throw new Error(`Failed to add worktree for ${displayName}: ${errorMsg}`);
		}
	}

	/**
	 * Look up a worktree in a grove, apply `mutate` to it, then persist the updated
	 * metadata (bumping `updatedAt` and the index). Throws if the grove, its
	 * metadata, or the worktree cannot be found.
	 */
	private updateWorktree(
		groveId: string,
		worktreePath: string,
		mutate: (worktree: Worktree) => void
	): GroveMetadata {
		const groveRef = this.grovesService.getGroveById(groveId);
		if (!groveRef) {
			throw new Error('Grove not found');
		}

		const metadata = this.grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			throw new Error('Grove metadata not found');
		}

		const worktree = metadata.worktrees.find((w) => w.worktreePath === worktreePath);
		if (!worktree) {
			throw new Error('Worktree not found in grove');
		}

		mutate(worktree);
		metadata.updatedAt = new Date().toISOString();

		this.grovesService.writeGroveMetadata(groveRef.path, metadata);
		this.grovesService.updateGroveInIndex(groveId, { updatedAt: metadata.updatedAt });

		return metadata;
	}

	/**
	 * Attach (or replace) an external reference on an existing worktree.
	 * @returns The updated grove metadata
	 */
	setWorktreeReference(
		groveId: string,
		worktreePath: string,
		reference: WorktreeReference
	): GroveMetadata {
		return this.updateWorktree(groveId, worktreePath, (worktree) => {
			worktree.reference = reference;
		});
	}

	/**
	 * Record (or clear) the background Claude session launched for a worktree.
	 * Pass `undefined` for sessionId to clear it.
	 * @returns The updated grove metadata
	 */
	setWorktreeBackgroundSession(
		groveId: string,
		worktreePath: string,
		sessionId: string | undefined,
		sessionName?: string
	): GroveMetadata {
		return this.updateWorktree(groveId, worktreePath, (worktree) => {
			if (sessionId) {
				worktree.bgSessionId = sessionId;
				worktree.bgSessionName = sessionName;
			} else {
				delete worktree.bgSessionId;
				delete worktree.bgSessionName;
			}
		});
	}

	/**
	 * Read the init-actions execution log for a worktree. The log lives in the grove
	 * directory (next to CONTEXT.md) under the file name recorded on the worktree's
	 * initActionsStatus.
	 * @returns The full log file contents
	 * @throws if the grove or worktree is missing, no init actions ran, or the log file can't be read
	 */
	readWorktreeInitLog(groveId: string, worktreePath: string): string {
		const groveRef = this.grovesService.getGroveById(groveId);
		if (!groveRef) {
			throw new Error('Grove not found');
		}

		const metadata = this.grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			throw new Error('Grove metadata not found');
		}

		const worktree = metadata.worktrees.find((w) => w.worktreePath === worktreePath);
		if (!worktree) {
			throw new Error('Worktree not found in grove');
		}

		if (!worktree.initActionsStatus) {
			throw new Error('No init actions were executed for this worktree');
		}

		const logPath = path.join(groveRef.path, worktree.initActionsStatus.logFile);
		try {
			return fs.readFileSync(logPath, 'utf-8');
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			throw new Error(`Failed to read init log: ${message}`);
		}
	}

	/**
	 * Close a grove: remove its worktrees and delete the grove folder. Returns the
	 * success status and any error messages.
	 */
	async closeGrove(groveId: string): Promise<CloseGroveResult> {
		const groveRef = this.grovesService.removeGroveFromIndex(groveId);

		if (!groveRef) {
			return { success: false, errors: [], message: 'Grove not found' };
		}

		const metadata = this.grovesService.readGroveMetadata(groveRef.path);
		const errors: string[] = [];

		if (metadata && metadata.worktrees.length > 0) {
			for (const worktree of metadata.worktrees) {
				// Skip worktrees that have already been closed - their working
				// tree no longer exists on disk, so git would error out.
				if (worktree.closed) {
					continue;
				}
				errors.push(...(await this.worktreeSetupService.teardownWorktree(worktree)));
			}
		}

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

	/**
	 * Close a single worktree within a grove: remove the git worktree from disk and
	 * mark it closed in grove metadata. Returns the success status and any errors.
	 */
	async closeWorktree(groveId: string, worktreePath: string): Promise<CloseWorktreeResult> {
		const groveRef = this.grovesService.getGroveById(groveId);
		if (!groveRef) {
			return { success: false, errors: [], message: 'Grove not found' };
		}

		const metadata = this.grovesService.readGroveMetadata(groveRef.path);
		if (!metadata) {
			return { success: false, errors: [], message: 'Grove metadata not found' };
		}

		const worktree = metadata.worktrees.find((w) => w.worktreePath === worktreePath);
		if (!worktree) {
			return { success: false, errors: [], message: 'Worktree not found in grove' };
		}

		if (worktree.closed) {
			return { success: false, errors: [], message: 'Worktree is already closed' };
		}

		const errors = await this.worktreeSetupService.teardownWorktree(worktree);

		// Mark worktree as closed in metadata (keep the entry)
		worktree.closed = true;
		worktree.closedAt = new Date().toISOString();
		metadata.updatedAt = new Date().toISOString();

		this.grovesService.writeGroveMetadata(groveRef.path, metadata);

		if (fs.existsSync(worktree.worktreePath)) {
			try {
				fs.rmSync(worktree.worktreePath, { recursive: true, force: true });
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Unknown error';
				errors.push(`Failed to delete worktree folder: ${errorMsg}`);
			}
		}

		if (errors.length > 0) {
			return {
				success: false,
				errors,
				message: 'Worktree closed with some errors',
			};
		}

		return { success: true, errors: [], message: 'Worktree closed successfully' };
	}
}
