/**
 * Terminal configuration for opening terminals
 */
export interface TerminalConfig {
	/** The terminal command to use (e.g., 'gnome-terminal', 'konsole') */
	command: string;
	/** Arguments to pass to the terminal, use {path} as placeholder for the directory */
	args: string[];
}

/**
 * Supported IDE types for "Open in IDE" feature
 * 'jetbrains-auto' will auto-detect the appropriate JetBrains IDE based on project files
 */
export type IDEType =
	| 'vscode'
	| 'phpstorm'
	| 'webstorm'
	| 'idea'
	| 'pycharm'
	| 'jetbrains-auto'
	| 'vim';

/**
 * Configuration for a specific IDE
 */
export interface IDEConfig {
	/** The IDE command to use (e.g., 'code', 'phpstorm') */
	command: string;
	/** Arguments to pass to the IDE, use {path} as placeholder for the directory */
	args: string[];
}

/**
 * Map of IDE types to their configurations
 */
export type IDEConfigs = Partial<Record<IDEType, IDEConfig>>;

export interface Settings {
	/**
	 * The working folder path where worktrees are created.
	 * This is different from the .grove folder which stores Grove's data.
	 */
	workingFolder: string;
	/**
	 * Terminal configuration detected on first startup.
	 * If not set, terminal opening will not work.
	 */
	terminal?: TerminalConfig;
	/**
	 * Currently selected IDE type for "Open in IDE" feature.
	 * If not set, IDE opening will not work.
	 */
	selectedIDE?: IDEType;
	/**
	 * Custom IDE configurations.
	 * If not set for an IDE type, default configuration will be used.
	 */
	ideConfigs?: IDEConfigs;
}

export interface StorageConfig {
	/**
	 * The path to the .grove folder (defaults to ~/.grove)
	 */
	groveFolder: string;

	/**
	 * The path to the settings.json file
	 */
	settingsPath: string;

	/**
	 * The path to the repositories.json file
	 */
	repositoriesPath: string;

	/**
	 * The path to the groves index file
	 */
	grovesIndexPath: string;

	/**
	 * The path to the recent selections file
	 */
	recentSelectionsPath: string;
}

export interface Repository {
	/**
	 * Absolute path to the repository root
	 */
	path: string;

	/**
	 * Repository name (derived from folder name)
	 */
	name: string;

	/**
	 * When the repository was registered
	 */
	registeredAt: string;

	/**
	 * Whether this repository is a monorepo with multiple projects
	 * When true, grove creation will allow selecting specific project folders
	 */
	isMonorepo?: boolean;
}

export interface RepositoriesData {
	/**
	 * List of registered repositories
	 */
	repositories: Repository[];
}

/**
 * Represents a repository selection for grove creation
 * Used to pass repository + optional project path to GroveService
 */
export interface RepositorySelection {
	/** The repository being selected */
	repository: Repository;
	/**
	 * Project folder path relative to repository root (for monorepos)
	 * When undefined, the entire repository is selected
	 */
	projectPath?: string;
}

/**
 * Represents a worktree within a grove
 */
export interface Worktree {
	/** Name of the repository */
	repositoryName: string;
	/** Path to the repository root */
	repositoryPath: string;
	/** Path to the worktree directory */
	worktreePath: string;
	/** Branch name for this worktree */
	branch: string;
	/**
	 * Project folder path relative to repository root (for monorepos)
	 * When set, indicates this worktree is for a specific project within a monorepo
	 */
	projectPath?: string;
}

/**
 * Reference to a grove stored in global groves index
 */
export interface GroveReference {
	/** Grove ID */
	id: string;
	/** Grove name */
	name: string;
	/** Path to the grove directory */
	path: string;
	/** Timestamp when the grove was created */
	createdAt: string;
	/** Timestamp when the grove was last updated */
	updatedAt: string;
}

/**
 * Global grove index stored in .grove/groves.json
 */
export interface GrovesIndex {
	/** List of grove references */
	groves: GroveReference[];
}

/**
 * Grove-specific metadata stored in {grove-folder}/grove.json
 */
export interface GroveMetadata {
	/** Grove ID */
	id: string;
	/** Grove name */
	name: string;
	/** List of worktrees in this grove */
	worktrees: Worktree[];
	/** Timestamp when the grove was created */
	createdAt: string;
	/** Timestamp when the grove was last updated */
	updatedAt: string;
}

/**
 * Represents a recently used repository/project selection
 * Stored in ~/.grove/recent.json
 */
export interface RecentSelection {
	/** Repository path */
	repositoryPath: string;
	/** Repository name */
	repositoryName: string;
	/**
	 * Project folder path for monorepos (undefined for whole repo)
	 */
	projectPath?: string;
	/** When this selection was last used */
	lastUsedAt: string;
}

/**
 * Container for recent selections
 */
export interface RecentSelectionsData {
	/** List of recent selections, ordered by most recent first */
	selections: RecentSelection[];
}

/**
 * Grove repository configuration stored in .grove.json and .grove.local.json
 * within individual repositories
 */
export interface GroveRepoConfig {
	/**
	 * Branch name template for creating worktrees in this repository
	 * Must contain ${GROVE_NAME} placeholder which will be replaced with normalized grove name
	 * Example: "grove/${GROVE_NAME}" or "feature/${GROVE_NAME}-work"
	 */
	branchNameTemplate?: string;
	/**
	 * File patterns (glob) to copy from repository to worktrees when creating groves
	 * Example: ['.gitignore', '.env.example', '*.config.js']
	 */
	fileCopyPatterns?: string[];
	/**
	 * Actions to run after creating worktrees (not implemented yet)
	 */
	initActions?: string[];
}
