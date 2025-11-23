export interface Settings {
	/**
	 * The working folder path where worktrees are created.
	 * This is different from the .grove folder which stores Grove's data.
	 */
	workingFolder: string;
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
}

export interface RepositoriesData {
	/**
	 * List of registered repositories
	 */
	repositories: Repository[];
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
