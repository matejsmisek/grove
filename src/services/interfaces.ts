/**
 * Service Interfaces for Dependency Injection
 * All service interfaces are defined here for clean separation of concerns
 */
import type Anthropic from '@anthropic-ai/sdk';

import type {
	GroveMetadata,
	GroveReference,
	GroveRepoConfig,
	RepositoriesData,
	Repository,
	Settings,
	StorageConfig,
	Worktree,
} from '../storage/types.js';

// ============================================================================
// Storage Service Interfaces
// ============================================================================

/**
 * Settings service interface
 * Manages application settings stored in ~/.grove/settings.json
 */
export interface ISettingsService {
	/**
	 * Get the storage configuration paths
	 */
	getStorageConfig(): StorageConfig;

	/**
	 * Get default settings values
	 */
	getDefaultSettings(): Settings;

	/**
	 * Initialize the .grove folder structure if it doesn't exist
	 */
	initializeStorage(): void;

	/**
	 * Read settings from settings.json
	 */
	readSettings(): Settings;

	/**
	 * Write settings to settings.json
	 */
	writeSettings(settings: Settings): void;

	/**
	 * Update specific settings fields
	 */
	updateSettings(updates: Partial<Settings>): Settings;
}

/**
 * Repository service interface
 * Manages registered repositories stored in ~/.grove/repositories.json
 */
export interface IRepositoryService {
	/**
	 * Get default repositories data structure
	 */
	getDefaultRepositories(): RepositoriesData;

	/**
	 * Read all repository data from storage
	 */
	readRepositories(): RepositoriesData;

	/**
	 * Write repository data to storage
	 */
	writeRepositories(data: RepositoriesData): void;

	/**
	 * Check if a repository is already registered
	 */
	isRepositoryRegistered(repoPath: string): boolean;

	/**
	 * Add a new repository to the registry
	 * @throws Error if repository already registered
	 */
	addRepository(repoPath: string): Repository;

	/**
	 * Remove a repository from the registry
	 * @returns true if repository was removed, false if not found
	 */
	removeRepository(repoPath: string): boolean;

	/**
	 * Get all registered repositories
	 */
	getAllRepositories(): Repository[];
}

/**
 * Groves service interface
 * Manages grove index and metadata stored in ~/.grove/groves.json
 * and individual grove.json files
 */
export interface IGrovesService {
	/**
	 * Add a grove reference to the global index
	 */
	addGroveToIndex(groveRef: GroveReference): void;

	/**
	 * Remove a grove from the index by ID
	 * @returns The removed grove reference, or null if not found
	 */
	removeGroveFromIndex(groveId: string): GroveReference | null;

	/**
	 * Update a grove reference in the index
	 * @returns true if grove was found and updated
	 */
	updateGroveInIndex(
		groveId: string,
		updates: Partial<Pick<GroveReference, 'name' | 'updatedAt'>>
	): boolean;

	/**
	 * Read grove metadata from a grove folder
	 */
	readGroveMetadata(grovePath: string): GroveMetadata | null;

	/**
	 * Write grove metadata to grove.json
	 */
	writeGroveMetadata(grovePath: string, metadata: GroveMetadata): void;

	/**
	 * Add a worktree entry to a grove's metadata
	 */
	addWorktreeToGrove(
		grovePath: string,
		repositoryName: string,
		repositoryPath: string,
		branch: string
	): Worktree;

	/**
	 * Get all groves from the index
	 */
	getAllGroves(): GroveReference[];

	/**
	 * Get a grove by its ID
	 */
	getGroveById(id: string): GroveReference | null;

	/**
	 * Delete a grove (remove from index and optionally delete folder)
	 */
	deleteGrove(groveId: string, deleteFolder?: boolean): boolean;
}

/**
 * Grove repository configuration service interface
 * Reads .grove.json and .grove.local.json from repositories
 */
export interface IGroveConfigService {
	/**
	 * Read and merge .grove.json and .grove.local.json from a repository
	 */
	readGroveRepoConfig(repositoryPath: string): GroveRepoConfig;

	/**
	 * Validate branch name template contains ${GROVE_NAME}
	 */
	validateBranchNameTemplate(template: string): boolean;

	/**
	 * Apply branch name template by replacing ${GROVE_NAME}
	 */
	applyBranchNameTemplate(template: string, groveName: string): string;

	/**
	 * Get branch name for a repository based on config or default
	 */
	getBranchNameForRepo(repositoryPath: string, groveName: string): string;
}

// ============================================================================
// Git Service Interfaces
// ============================================================================

/**
 * Git command result
 */
export interface GitCommandResult {
	success: boolean;
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

/**
 * Worktree info from git worktree list
 */
export interface WorktreeInfo {
	path: string;
	branch: string;
	commit: string;
}

/**
 * Git service interface
 * Provides git operations - all methods accept repoPath as first argument
 */
export interface IGitService {
	/**
	 * Add a new worktree
	 * @param repoPath - Repository root path
	 * @param worktreePath - Path where the worktree will be created
	 * @param branch - Branch name for the worktree (optional, creates new branch if provided)
	 * @param commitish - Commit/branch to check out (optional)
	 */
	addWorktree(
		repoPath: string,
		worktreePath: string,
		branch?: string,
		commitish?: string
	): Promise<GitCommandResult>;

	/**
	 * List all worktrees
	 * @param repoPath - Repository root path
	 * @param porcelain - Use porcelain format for easier parsing
	 */
	listWorktrees(repoPath: string, porcelain?: boolean): Promise<GitCommandResult>;

	/**
	 * Parse porcelain worktree list output into structured data
	 */
	parseWorktreeList(porcelainOutput: string): WorktreeInfo[];

	/**
	 * Remove a worktree
	 * @param repoPath - Repository root path
	 * @param worktreePath - Path of the worktree to remove
	 * @param force - Force removal even if worktree is dirty
	 */
	removeWorktree(repoPath: string, worktreePath: string, force?: boolean): Promise<GitCommandResult>;

	/**
	 * Prune worktree information (removes stale metadata)
	 * @param repoPath - Repository root path
	 */
	pruneWorktrees(repoPath: string): Promise<GitCommandResult>;

	/**
	 * Lock a worktree to prevent pruning
	 * @param repoPath - Repository root path
	 * @param worktreePath - Path of the worktree to lock
	 * @param reason - Optional reason for locking
	 */
	lockWorktree(repoPath: string, worktreePath: string, reason?: string): Promise<GitCommandResult>;

	/**
	 * Unlock a worktree
	 * @param repoPath - Repository root path
	 * @param worktreePath - Path of the worktree to unlock
	 */
	unlockWorktree(repoPath: string, worktreePath: string): Promise<GitCommandResult>;

	/**
	 * Move a worktree to a new location
	 * @param repoPath - Repository root path
	 * @param worktreePath - Current path of the worktree
	 * @param newPath - New location for the worktree
	 */
	moveWorktree(repoPath: string, worktreePath: string, newPath: string): Promise<GitCommandResult>;

	/**
	 * Check if repository has uncommitted changes
	 * @param repoPath - Repository root path
	 */
	hasUncommittedChanges(repoPath: string): Promise<boolean>;

	/**
	 * Check if repository has unpushed commits
	 * @param repoPath - Repository root path
	 */
	hasUnpushedCommits(repoPath: string): Promise<boolean>;
}

// ============================================================================
// Other Service Interfaces
// ============================================================================

/**
 * Context data for CONTEXT.md generation
 */
export interface ContextData {
	name: string;
	createdAt: string;
	purpose?: string;
	repositories: Repository[];
	notes?: string;
}

/**
 * Context service interface
 * Manages CONTEXT.md files in groves
 */
export interface IContextService {
	/**
	 * Generate markdown content for CONTEXT.md
	 */
	generateContent(data: ContextData): string;

	/**
	 * Create a CONTEXT.md file in a grove folder
	 */
	createContextFile(grovePath: string, data: ContextData): void;

	/**
	 * Check if CONTEXT.md exists in a grove folder
	 */
	contextFileExists(grovePath: string): boolean;

	/**
	 * Read the raw content of CONTEXT.md
	 */
	readContextFile(grovePath: string): string | null;

	/**
	 * Get the full path to CONTEXT.md for a grove
	 */
	getContextFilePath(grovePath: string): string;
}

/**
 * File copy result
 */
export interface FileCopyResult {
	success: boolean;
	copiedFiles: string[];
	errors: string[];
}

/**
 * File match result
 */
export interface FileMatchResult {
	pattern: string;
	matches: string[];
}

/**
 * File service interface
 * Provides file operations including pattern matching and copying
 */
export interface IFileService {
	/**
	 * Find files matching a glob pattern
	 */
	matchPattern(sourceDir: string, pattern: string): Promise<string[]>;

	/**
	 * Find files matching multiple glob patterns
	 */
	matchPatterns(sourceDir: string, patterns: string[]): Promise<FileMatchResult[]>;

	/**
	 * Copy a single file preserving directory structure
	 */
	copyFile(sourceDir: string, destDir: string, relativeFilePath: string): void;

	/**
	 * Copy files matching glob patterns
	 */
	copyFilesFromPatterns(
		sourceDir: string,
		destDir: string,
		patterns: string[]
	): Promise<FileCopyResult>;

	/**
	 * Check if a path exists
	 */
	exists(filePath: string): boolean;

	/**
	 * Check if a path is a directory
	 */
	isDirectory(filePath: string): boolean;

	/**
	 * Check if a path is a file
	 */
	isFile(filePath: string): boolean;
}

/**
 * Grove creation result
 */
export interface CreateGroveResult {
	success: boolean;
	metadata?: GroveMetadata;
	errors: string[];
}

/**
 * Grove close result
 */
export interface CloseGroveResult {
	success: boolean;
	errors: string[];
	message?: string;
}

/**
 * Grove service interface
 * Orchestrates grove lifecycle operations
 */
export interface IGroveService {
	/**
	 * Create a new grove with worktrees for selected repositories
	 */
	createGrove(name: string, repositories: Repository[]): Promise<GroveMetadata>;

	/**
	 * Close a grove - removes worktrees and deletes folder
	 */
	closeGrove(groveId: string): Promise<CloseGroveResult>;
}

// ============================================================================
// Claude AI Service Interfaces
// ============================================================================

/**
 * Message in the context builder conversation
 */
export interface ContextBuilderMessage {
	role: 'user' | 'assistant';
	content: string;
}

/**
 * Draft of the CONTEXT.md file
 */
export interface ContextDraft {
	content: string;
	isApproved: boolean;
}

/**
 * Claude service interface
 * Provides AI-powered context generation for groves
 */
export interface IClaudeService {
	/**
	 * Send a message to Claude and get a response
	 * Handles tool use for file reading automatically
	 * @param messages - Conversation history in Anthropic format
	 * @param groveName - Name of the grove being created
	 * @param repositories - Repositories in the grove
	 * @param worktrees - Worktrees in the grove (for file reading)
	 * @returns Response text and updated message history
	 */
	chat(
		messages: Anthropic.MessageParam[],
		groveName: string,
		repositories: Repository[],
		worktrees: Worktree[]
	): Promise<{ response: string; updatedMessages: Anthropic.MessageParam[] }>;

	/**
	 * Extract CONTEXT.md content from Claude's response
	 * @param response - Claude's response text
	 * @returns Extracted markdown content or null if not found
	 */
	extractContextDraft(response: string): string | null;
}
