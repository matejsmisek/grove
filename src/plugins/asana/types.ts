/**
 * Asana Plugin Types
 * Types specific to the Asana integration
 */

/**
 * Asana plugin configuration stored in plugin settings
 */
export interface AsanaPluginSettings {
	/** Asana Personal Access Token */
	accessToken?: string;
	/** Default workspace ID to use */
	defaultWorkspaceId?: string;
	/** Default project ID to use */
	defaultProjectId?: string;
}

/**
 * Asana task reference
 * Minimal task info for linking groves to Asana tasks
 */
export interface AsanaTaskReference {
	/** Asana task GID */
	gid: string;
	/** Task name/title */
	name: string;
	/** Task URL */
	url: string;
	/** Project the task belongs to */
	projectName?: string;
}

/**
 * Asana workspace reference
 */
export interface AsanaWorkspace {
	/** Workspace GID */
	gid: string;
	/** Workspace name */
	name: string;
}

/**
 * Asana project reference
 */
export interface AsanaProject {
	/** Project GID */
	gid: string;
	/** Project name */
	name: string;
	/** Workspace the project belongs to */
	workspaceGid: string;
}

/**
 * Asana user info (from /users/me)
 */
export interface AsanaUser {
	/** User GID */
	gid: string;
	/** User name */
	name: string;
	/** User email */
	email: string;
}

/**
 * Asana API response wrapper
 */
export interface AsanaApiResponse<T> {
	data: T;
}

/**
 * Asana API error response
 */
export interface AsanaApiError {
	errors: Array<{
		message: string;
		help?: string;
	}>;
}
