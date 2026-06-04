/**
 * GitLab Plugin
 * Integrates Grove with GitLab (repositories, merge requests, issues)
 */
import type { IPlugin, PluginMetadata } from '../types.js';
import {
	DEFAULT_GITLAB_BASE_URL,
	GitLabApiClient,
	GitLabApiRequestError,
} from './GitLabApiClient.js';
import type { GitLabPluginSettings, GitLabProject, GitLabUser } from './types.js';

/**
 * Plugin ID constant
 */
export const GITLAB_PLUGIN_ID = 'gitlab';

/**
 * Environment variable name for the GitLab token
 */
export const GITLAB_TOKEN_ENV_VAR = 'GROVE_GITLAB_TOKEN';

/**
 * Environment variable name for the GitLab instance URL (optional)
 */
export const GITLAB_URL_ENV_VAR = 'GROVE_GITLAB_URL';

/**
 * Error thrown when GitLab token validation fails
 */
export class GitLabTokenValidationError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'GitLabTokenValidationError';
	}
}

/**
 * GitLab Plugin Implementation
 */
export class GitLabPlugin implements IPlugin {
	readonly metadata: PluginMetadata = {
		id: GITLAB_PLUGIN_ID,
		name: 'GitLab',
		description: 'Integrate Grove with GitLab (repositories, merge requests, issues)',
		version: '0.1.0',
	};

	private settings: GitLabPluginSettings = {};
	private initialized = false;
	private currentUser: GitLabUser | null = null;

	/**
	 * Get the GitLab access token
	 * Priority: 1. GROVE_GITLAB_TOKEN env var, 2. Settings accessToken
	 */
	getAccessToken(): string | undefined {
		return process.env[GITLAB_TOKEN_ENV_VAR] || this.settings.accessToken;
	}

	/**
	 * Get the GitLab instance base URL
	 * Priority: 1. GROVE_GITLAB_URL env var, 2. Settings baseUrl, 3. gitlab.com
	 */
	getBaseUrl(): string {
		return process.env[GITLAB_URL_ENV_VAR] || this.settings.baseUrl || DEFAULT_GITLAB_BASE_URL;
	}

	/**
	 * Create an API client using the current token and base URL
	 * @throws GitLabTokenValidationError if no token is configured
	 */
	private createClient(): GitLabApiClient {
		const token = this.getAccessToken();
		if (!token) {
			throw new GitLabTokenValidationError(
				`GitLab token not found. Set the ${GITLAB_TOKEN_ENV_VAR} environment variable or configure accessToken in plugin settings.`
			);
		}
		return new GitLabApiClient(token, this.getBaseUrl());
	}

	/**
	 * Validate the GitLab token by calling the /user endpoint
	 * @throws GitLabTokenValidationError if token is missing or invalid
	 */
	async validateToken(): Promise<GitLabUser> {
		const client = this.createClient();

		try {
			return await client.getCurrentUser();
		} catch (error) {
			if (error instanceof GitLabApiRequestError) {
				throw new GitLabTokenValidationError(error.message, error.cause ?? error);
			}
			throw new GitLabTokenValidationError(
				'Failed to validate GitLab token. Check your network connection.',
				error
			);
		}
	}

	/**
	 * Initialize the plugin
	 * Called when the plugin is enabled.
	 *
	 * Enabling only turns the integration on (which exposes its settings screen).
	 * It must never throw, so a missing/invalid token cannot crash the app — token
	 * verification happens lazily in the GitLab settings screen via validateToken().
	 */
	async initialize(): Promise<void> {
		this.initialized = true;
	}

	/**
	 * Cleanup the plugin
	 * Called when the plugin is disabled or app shuts down
	 */
	async cleanup(): Promise<void> {
		this.currentUser = null;
		this.initialized = false;
	}

	/**
	 * Check if the plugin is available/configured
	 * Returns true if GROVE_GITLAB_TOKEN env var or accessToken setting is present
	 */
	async isAvailable(): Promise<boolean> {
		return !!this.getAccessToken();
	}

	/**
	 * Configure the plugin with settings
	 */
	configure(settings: GitLabPluginSettings): void {
		this.settings = { ...this.settings, ...settings };
	}

	/**
	 * Get current plugin settings
	 */
	getSettings(): GitLabPluginSettings {
		return { ...this.settings };
	}

	/**
	 * Get the current authenticated user
	 * Returns null if not initialized
	 */
	getCurrentUser(): GitLabUser | null {
		return this.currentUser;
	}

	/**
	 * Check if the plugin is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	// ============================================
	// GitLab-specific methods (to be implemented)
	// ============================================

	/**
	 * List projects the authenticated user is a member of
	 */
	async listProjects(): Promise<GitLabProject[]> {
		const client = this.createClient();
		try {
			return await client.listProjects();
		} catch (error) {
			if (error instanceof GitLabApiRequestError) {
				throw new GitLabTokenValidationError(error.message, error.cause ?? error);
			}
			throw error;
		}
	}

	/**
	 * Get merge requests for a project
	 * @placeholder - To be implemented
	 */
	async getMergeRequests(_projectId: string): Promise<void> {
		// TODO: Implement fetching merge requests
		throw new Error('Not implemented');
	}

	/**
	 * Create a merge request
	 * @placeholder - To be implemented
	 */
	async createMergeRequest(_projectId: string, _options: Record<string, unknown>): Promise<void> {
		// TODO: Implement merge request creation
		throw new Error('Not implemented');
	}

	/**
	 * Get issues for a project
	 * @placeholder - To be implemented
	 */
	async getIssues(_projectId: string): Promise<void> {
		// TODO: Implement fetching issues
		throw new Error('Not implemented');
	}
}
