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
