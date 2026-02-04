/**
 * Service Interfaces for Dependency Injection
 * All service interfaces are defined here for clean separation of concerns
 */
import type {
	ClaudeTerminalType,
	GroveIDEConfig,
	GroveMetadata,
	GroveReference,
	GroveRepoConfig,
	IDEConfig,
	IDEType,
	RepositoriesData,
	Repository,
	RepositorySelection,
	Settings,
	StorageConfig,
	WorkspaceConfig,
	WorkspaceContext,
	WorkspaceReference,
	WorkspacesData,
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

	/**
	 * Update a repository's properties
	 * @returns The updated repository, or null if not found
	 */
	updateRepository(
		repoPath: string,
		updates: Partial<Pick<Repository, 'isMonorepo'>>
	): Repository | null;
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
 * Merged configuration for a repository selection
 * Contains both root and project configs merged together
 */
export interface MergedGroveConfig {
	/** Final branch name template (project overrides root) */
	branchNameTemplate?: string;
	/** File patterns from root config (to copy from repo root) */
	rootFileCopyPatterns: string[];
	/** File patterns from project config (to copy from project folder) */
	projectFileCopyPatterns: string[];
	/** Init actions from root config */
	rootInitActions: string[];
	/** Init actions from project config */
	projectInitActions: string[];
	/**
	 * IDE configuration (project overrides root)
	 * Can be a reference like "@phpstorm" or a custom config
	 */
	ide?: GroveIDEConfig;
}

/**
 * Validation result for template variables
 */
export interface TemplateValidationResult {
	valid: boolean;
	invalidVars: string[];
	missingRequired: string[];
}

/**
 * Grove repository configuration service interface
 * Reads and writes .grove.json and .grove.local.json from repositories
 */
export interface IGroveConfigService {
	/**
	 * Read and merge .grove.json and .grove.local.json from a repository
	 */
	readGroveRepoConfig(repositoryPath: string): GroveRepoConfig;

	/**
	 * Read and merge configs for a repository selection
	 * For monorepo projects, reads both root and project-level .grove.json files
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns Merged configuration with project overriding root for most fields,
	 *          but fileCopyPatterns kept separate for staged copying
	 */
	readMergedConfig(repositoryPath: string, projectPath?: string): MergedGroveConfig;

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

	/**
	 * Get branch name for a repository selection (with optional project path)
	 * @param repositoryPath - Absolute path to the repository root
	 * @param groveName - Name of the grove being created
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	getBranchNameForSelection(repositoryPath: string, groveName: string, projectPath?: string): string;

	/**
	 * Check if an IDE config is a reference (starts with @)
	 * @param config - The IDE config to check
	 * @returns true if the config is a reference like "@phpstorm"
	 */
	isIDEReference(config: GroveIDEConfig): config is `@${IDEType}`;

	/**
	 * Parse an IDE reference to get the IDE type
	 * @param reference - The IDE reference (e.g., "@phpstorm")
	 * @returns The IDE type (e.g., "phpstorm")
	 */
	parseIDEReference(reference: `@${IDEType}`): IDEType;

	/**
	 * Get the resolved IDE config for a repository selection
	 * Returns the IDE config from .grove.json (project overrides root)
	 * If it's a reference, returns the type; if it's a custom config, returns the config
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns Object with either ideType or ideConfig, or undefined if not configured
	 */
	getIDEConfigForSelection(
		repositoryPath: string,
		projectPath?: string
	): { ideType: IDEType } | { ideConfig: IDEConfig } | undefined;

	// =========================================================================
	// Write Methods
	// =========================================================================

	/**
	 * Write .grove.json configuration to a repository
	 * @param repositoryPath - Absolute path to the repository root
	 * @param config - Configuration to write
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	writeGroveConfig(repositoryPath: string, config: GroveRepoConfig, projectPath?: string): void;

	/**
	 * Write .grove.local.json configuration to a repository
	 * @param repositoryPath - Absolute path to the repository root
	 * @param config - Configuration to write
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	writeGroveLocalConfig(repositoryPath: string, config: GroveRepoConfig, projectPath?: string): void;

	/**
	 * Read just the .grove.json file (without merging with .grove.local.json)
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	readGroveConfigOnly(repositoryPath: string, projectPath?: string): GroveRepoConfig;

	/**
	 * Read just the .grove.local.json file (without merging)
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	readGroveLocalConfigOnly(repositoryPath: string, projectPath?: string): GroveRepoConfig;

	/**
	 * Check if a .grove.json file exists
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	groveConfigExists(repositoryPath: string, projectPath?: string): boolean;

	/**
	 * Check if a .grove.local.json file exists
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 */
	groveLocalConfigExists(repositoryPath: string, projectPath?: string): boolean;

	/**
	 * Get list of project folders in a monorepo that have .grove.json files
	 * @param repositoryPath - Absolute path to the repository root
	 * @returns Array of project folder names that contain .grove.json
	 */
	getProjectsWithGroveConfig(repositoryPath: string): string[];

	/**
	 * Validate template variables in a string
	 * @param template - Template string to validate
	 * @param validVars - Array of valid variable names
	 * @param requiredVars - Array of required variable names (optional)
	 * @returns Validation result with invalid and missing required variables
	 */
	validateTemplateVariables(
		template: string,
		validVars: readonly string[],
		requiredVars?: readonly string[]
	): TemplateValidationResult;

	/**
	 * Validate branch name template
	 * @param template - Branch name template to validate
	 * @returns Validation result
	 */
	validateBranchTemplate(template: string): TemplateValidationResult;

	/**
	 * Validate Claude session template
	 * @param template - Claude session template to validate
	 * @returns Validation result
	 */
	validateClaudeSessionTemplate(template: string): TemplateValidationResult;
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

	/**
	 * Get the current branch name
	 * @param repoPath - Repository root path
	 * @returns Branch name or 'detached' if in detached HEAD state
	 */
	getCurrentBranch(repoPath: string): Promise<string>;

	/**
	 * Get file change statistics
	 * @param repoPath - Repository root path
	 * @returns Object with counts for modified, added, deleted, and untracked files
	 */
	getFileChangeStats(repoPath: string): Promise<FileChangeStats>;

	/**
	 * Detect the main branch of a repository
	 * Tries "master" first, then "main", then returns current branch
	 * @param repoPath - Repository root path
	 * @returns The detected main branch name
	 */
	detectMainBranch(repoPath: string): Promise<string>;

	/**
	 * Fetch from remote repository
	 * @param repoPath - Repository root path
	 * @param remote - Remote name (defaults to 'origin')
	 */
	fetch(repoPath: string, remote?: string): Promise<GitCommandResult>;

	/**
	 * Pull from remote repository
	 * @param repoPath - Repository root path
	 * @param remote - Remote name (defaults to 'origin')
	 * @param branch - Branch name (optional, uses current branch if not specified)
	 */
	pull(repoPath: string, remote?: string, branch?: string): Promise<GitCommandResult>;

	/**
	 * Reset repository to a specific commit
	 * @param repoPath - Repository root path
	 * @param ref - Git reference (commit, branch, etc.)
	 * @param hard - Use --hard flag to discard all changes
	 */
	reset(repoPath: string, ref: string, hard?: boolean): Promise<GitCommandResult>;

	/**
	 * Resolve a git reference to its SHA
	 * @param repoPath - Repository root path
	 * @param ref - Git reference to resolve
	 */
	revParse(repoPath: string, ref: string): Promise<GitCommandResult>;

	/**
	 * Get the upstream status of the current branch
	 * Detects if the branch's upstream tracking ref is gone (deleted after merge)
	 * @param repoPath - Repository root path
	 * @returns 'active' if upstream exists, 'gone' if upstream was deleted, 'none' if no upstream
	 */
	getBranchUpstreamStatus(repoPath: string): Promise<BranchUpstreamStatus>;
}

/**
 * File change statistics from git status
 */
export interface FileChangeStats {
	modified: number;
	added: number;
	deleted: number;
	untracked: number;
	total: number;
}

/**
 * Branch upstream status
 * - 'active': Branch has an active upstream that exists
 * - 'gone': Branch had an upstream that no longer exists (merged and deleted)
 * - 'none': Branch has no upstream configured
 */
export type BranchUpstreamStatus = 'active' | 'gone' | 'none';

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
 * Claude session result
 */
export interface ClaudeSessionResult {
	success: boolean;
	message: string;
}

/**
 * Claude session service interface
 * Launches Claude CLI in terminal sessions with multiple tabs
 */
export interface IClaudeSessionService {
	/**
	 * Detect all available supported terminals (konsole or kitty)
	 * @returns Array of available terminal types
	 */
	detectAvailableTerminals(): ClaudeTerminalType[];

	/**
	 * Detect which supported terminal is available (konsole or kitty)
	 * @returns The first detected terminal type, or null if none available
	 * @deprecated Use detectAvailableTerminals() instead
	 */
	detectTerminal(): ClaudeTerminalType | null;

	/**
	 * Get the default template for a terminal type
	 * @param terminalType - The terminal type (konsole or kitty)
	 * @returns The default template content
	 */
	getDefaultTemplate(terminalType: ClaudeTerminalType): string;

	/**
	 * Get the effective template for a terminal type
	 * Checks settings for custom template, falls back to default
	 * @param terminalType - The terminal type (konsole or kitty)
	 * @returns The template content to use
	 */
	getEffectiveTemplate(terminalType: ClaudeTerminalType): string;

	/**
	 * Get the template for a specific repository/project
	 * Checks .grove.json for custom template, then settings, then default
	 * @param terminalType - The terminal type (konsole or kitty)
	 * @param repositoryPath - Absolute path to the repository root
	 * @param projectPath - Optional relative path to project folder (for monorepos)
	 * @returns The template content to use
	 */
	getTemplateForRepo(
		terminalType: ClaudeTerminalType,
		repositoryPath: string,
		projectPath?: string
	): string;

	/**
	 * Apply template by replacing placeholders:
	 * - ${WORKING_DIR}: Working directory path
	 * - ${AGENT_COMMAND}: Agent command (defaults to 'claude')
	 * - ${GROVE_NAME}: Full grove name
	 * - ${GROVE_NAME_SHORT}: Shortened grove name (max 10 chars)
	 * @param template - Template content
	 * @param workingDir - Working directory path
	 * @param agentCommand - Optional agent command (defaults to 'claude')
	 * @param groveName - Optional grove name for template variables
	 * @returns Template with placeholders replaced
	 */
	applyTemplate(
		template: string,
		workingDir: string,
		agentCommand?: string,
		groveName?: string
	): string;

	/**
	 * Open Claude in a terminal session with the working directory set
	 * Creates two tabs: one running Claude CLI, one with regular bash shell
	 * @param workingDir - Directory to set as working directory for both tabs
	 * @param repositoryPath - Repository path for template lookup
	 * @param projectPath - Optional project path for template lookup (for monorepos)
	 * @param terminalType - Optional terminal type to use (if not provided, uses setting or auto-detects)
	 * @param groveName - Optional grove name for template variables (${GROVE_NAME}, ${GROVE_NAME_SHORT})
	 */
	openSession(
		workingDir: string,
		repositoryPath: string,
		projectPath?: string,
		terminalType?: ClaudeTerminalType,
		groveName?: string
	): ClaudeSessionResult;

	/**
	 * Resume an existing Claude session
	 * @param sessionId - The session ID to resume
	 * @param workingDir - Directory to set as working directory
	 * @param terminalType - Terminal type to use
	 * @param groveName - Optional grove name for template variables (${GROVE_NAME}, ${GROVE_NAME_SHORT})
	 */
	resumeSession(
		sessionId: string,
		workingDir: string,
		terminalType: ClaudeTerminalType,
		groveName?: string
	): ClaudeSessionResult;
}

/**
 * Grove service interface
 * Orchestrates grove lifecycle operations
 */
export interface IGroveService {
	/**
	 * Create a new grove with worktrees for selected repositories
	 * @param name - Name of the grove
	 * @param selections - Array of repository selections, each optionally with a project path
	 * @param onLog - Optional callback for progress logging during creation
	 */
	createGrove(
		name: string,
		selections: RepositorySelection[],
		onLog?: (message: string) => void
	): Promise<GroveMetadata>;

	/**
	 * Add a worktree to an existing grove
	 * @param groveId - ID of the grove to add the worktree to
	 * @param selection - Repository selection (with optional project path for monorepos)
	 * @param worktreeName - Custom name for the worktree (will be used for folder and branch)
	 * @param onLog - Optional callback for progress logging
	 * @returns Updated grove metadata
	 */
	addWorktreeToGrove(
		groveId: string,
		selection: RepositorySelection,
		worktreeName: string,
		onLog?: (message: string) => void
	): Promise<GroveMetadata>;

	/**
	 * Close a grove - removes worktrees and deletes folder
	 */
	closeGrove(groveId: string): Promise<CloseGroveResult>;
}

/**
 * Result from LLM grove name generation
 */
export interface GroveNameGenerationResult {
	/** The generated grove name (human-readable) */
	name: string;
	/** Suggested normalized version (may be empty if no suggestion) */
	normalizedSuggestion?: string;
}

/**
 * LLM service interface
 * Provides AI-powered features using OpenRouter/Anthropic
 */
export interface ILLMService {
	/**
	 * Check if the LLM service is configured with an API key
	 */
	isConfigured(): boolean;

	/**
	 * Generate a grove name from a description
	 * @param description - User's description of what they'll be working on
	 * @returns Generated grove name
	 * @throws Error if API key not configured or API call fails
	 */
	generateGroveName(description: string): Promise<GroveNameGenerationResult>;

	/**
	 * Get the current model being used
	 */
	getModel(): string;
}

/**
 * Workspace service interface
 * Manages Grove workspaces - localized configurations with their own repositories and groves
 */
export interface IWorkspaceService {
	/**
	 * Discover workspace by walking up directory tree from startDir
	 * Returns workspace path if found, undefined otherwise
	 */
	discoverWorkspace(startDir: string): string | undefined;

	/**
	 * Read workspace configuration from .grove.workspace.json
	 */
	readWorkspaceConfig(workspacePath: string): WorkspaceConfig;

	/**
	 * Write workspace configuration to .grove.workspace.json
	 */
	writeWorkspaceConfig(workspacePath: string, config: WorkspaceConfig): void;

	/**
	 * Initialize a new workspace in the given directory
	 * Creates .grove.workspace.json and .grove/ folder structure
	 */
	initWorkspace(workspacePath: string, name: string, grovesFolder: string): void;

	/**
	 * Resolve workspace context from current directory
	 * Returns workspace context if in a workspace, or global context otherwise
	 */
	resolveContext(cwd: string): WorkspaceContext;

	/**
	 * Read global workspaces tracking file
	 */
	readGlobalWorkspaces(): WorkspacesData;

	/**
	 * Write global workspaces tracking file
	 */
	writeGlobalWorkspaces(data: WorkspacesData): void;

	/**
	 * Add or update workspace in global tracking
	 */
	addToGlobalTracking(workspace: WorkspaceReference): void;

	/**
	 * Update last used timestamp for a workspace
	 */
	updateLastUsed(workspacePath: string): void;

	/**
	 * Remove workspace from global tracking
	 */
	removeFromGlobalTracking(workspacePath: string): void;

	/**
	 * Check if a directory is a workspace root
	 */
	isWorkspaceRoot(dirPath: string): boolean;

	/**
	 * Set the current workspace context
	 * Should be called after resolving context in the application entry point
	 */
	setCurrentContext(context: WorkspaceContext): void;

	/**
	 * Get the current workspace context
	 * Returns the workspace context set during application initialization
	 */
	getCurrentContext(): WorkspaceContext | undefined;
}
