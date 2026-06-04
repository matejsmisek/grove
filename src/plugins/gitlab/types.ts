/**
 * GitLab Plugin Types
 * Types specific to the GitLab integration
 */

/**
 * GitLab plugin configuration stored in plugin settings
 */
export interface GitLabPluginSettings {
	/** GitLab Personal Access Token */
	accessToken?: string;
	/**
	 * GitLab instance base URL (without the /api/v4 suffix).
	 * Defaults to https://gitlab.com. Override for self-hosted instances.
	 */
	baseUrl?: string;
	/** Default project ID/path to use */
	defaultProjectId?: string;
}

/**
 * GitLab user info (from /user)
 */
export interface GitLabUser {
	/** Numeric user ID */
	id: number;
	/** Username (handle) */
	username: string;
	/** Display name */
	name: string;
	/** User email (requires read_user scope; may be undefined) */
	email?: string;
	/** Web URL to the user's profile */
	webUrl?: string;
}

/**
 * GitLab project reference
 */
export interface GitLabProject {
	/** Numeric project ID */
	id: number;
	/** Project name */
	name: string;
	/** Full path including namespace (e.g. group/subgroup/project) */
	pathWithNamespace: string;
	/** Web URL to the project */
	webUrl: string;
}

/**
 * GitLab API error response
 * GitLab returns either { message: ... } or { error, error_description }
 */
export interface GitLabApiError {
	message?: string | Record<string, unknown>;
	error?: string;
	error_description?: string;
}
