/**
 * Asana Plugin
 * Integrates Grove with Asana task management
 */
import type { IPlugin, PluginMetadata } from '../types.js';
import type { AsanaApiError, AsanaApiResponse, AsanaPluginSettings, AsanaUser } from './types.js';

/**
 * Plugin ID constant
 */
export const ASANA_PLUGIN_ID = 'asana';

/**
 * Environment variable name for Asana token
 */
export const ASANA_TOKEN_ENV_VAR = 'ASANA_TOKEN';

/**
 * Asana API base URL
 */
const ASANA_API_BASE_URL = 'https://app.asana.com/api/1.0';

/**
 * Error thrown when Asana token validation fails
 */
export class AsanaTokenValidationError extends Error {
	constructor(
		message: string,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'AsanaTokenValidationError';
	}
}

/**
 * Asana Plugin Implementation
 */
export class AsanaPlugin implements IPlugin {
	readonly metadata: PluginMetadata = {
		id: ASANA_PLUGIN_ID,
		name: 'Asana',
		description: 'Integrate Grove with Asana task management',
		version: '0.1.0',
	};

	private settings: AsanaPluginSettings = {};
	private initialized = false;
	private currentUser: AsanaUser | null = null;

	/**
	 * Get the Asana access token
	 * Priority: 1. ASANA_TOKEN env var, 2. Settings accessToken
	 */
	getAccessToken(): string | undefined {
		return process.env[ASANA_TOKEN_ENV_VAR] || this.settings.accessToken;
	}

	/**
	 * Validate the Asana token by calling the /users/me endpoint
	 * @throws AsanaTokenValidationError if token is missing or invalid
	 */
	async validateToken(): Promise<AsanaUser> {
		const token = this.getAccessToken();

		if (!token) {
			throw new AsanaTokenValidationError(
				`Asana token not found. Set the ${ASANA_TOKEN_ENV_VAR} environment variable or configure accessToken in plugin settings.`
			);
		}

		try {
			const response = await fetch(`${ASANA_API_BASE_URL}/users/me`, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${token}`,
					Accept: 'application/json',
				},
			});

			if (!response.ok) {
				if (response.status === 401) {
					throw new AsanaTokenValidationError('Invalid Asana token. The token is expired or incorrect.');
				}

				// Try to parse error response
				try {
					const errorBody = (await response.json()) as AsanaApiError;
					const errorMessage = errorBody.errors?.[0]?.message || `HTTP ${response.status}`;
					throw new AsanaTokenValidationError(`Asana API error: ${errorMessage}`);
				} catch (parseError) {
					if (parseError instanceof AsanaTokenValidationError) {
						throw parseError;
					}
					throw new AsanaTokenValidationError(`Asana API returned status ${response.status}`);
				}
			}

			const result = (await response.json()) as AsanaApiResponse<AsanaUser>;
			return result.data;
		} catch (error) {
			if (error instanceof AsanaTokenValidationError) {
				throw error;
			}

			// Network or other fetch errors
			throw new AsanaTokenValidationError(
				'Failed to connect to Asana API. Check your network connection.',
				error
			);
		}
	}

	/**
	 * Initialize the plugin
	 * Called when the plugin is enabled
	 * Validates the token by calling the Asana API
	 * @throws AsanaTokenValidationError if token validation fails
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		// Validate token by calling Asana API
		this.currentUser = await this.validateToken();
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
	 * Returns true if ASANA_TOKEN env var or accessToken setting is present
	 */
	async isAvailable(): Promise<boolean> {
		return !!this.getAccessToken();
	}

	/**
	 * Configure the plugin with settings
	 */
	configure(settings: AsanaPluginSettings): void {
		this.settings = { ...this.settings, ...settings };
	}

	/**
	 * Get current plugin settings
	 */
	getSettings(): AsanaPluginSettings {
		return { ...this.settings };
	}

	/**
	 * Get the current authenticated user
	 * Returns null if not initialized
	 */
	getCurrentUser(): AsanaUser | null {
		return this.currentUser;
	}

	/**
	 * Check if the plugin is initialized
	 */
	isInitialized(): boolean {
		return this.initialized;
	}

	// ============================================
	// Asana-specific methods (to be implemented)
	// ============================================

	/**
	 * Get tasks assigned to the current user
	 * @placeholder - To be implemented
	 */
	async getMyTasks(): Promise<void> {
		// TODO: Implement fetching user's tasks
		throw new Error('Not implemented');
	}

	/**
	 * Get task details by GID
	 * @placeholder - To be implemented
	 */
	async getTask(_taskGid: string): Promise<void> {
		// TODO: Implement fetching task details
		throw new Error('Not implemented');
	}

	/**
	 * Create a new task
	 * @placeholder - To be implemented
	 */
	async createTask(_name: string, _options?: Record<string, unknown>): Promise<void> {
		// TODO: Implement task creation
		throw new Error('Not implemented');
	}

	/**
	 * Update task status/completion
	 * @placeholder - To be implemented
	 */
	async updateTask(_taskGid: string, _updates: Record<string, unknown>): Promise<void> {
		// TODO: Implement task updates
		throw new Error('Not implemented');
	}

	/**
	 * Add a comment to a task
	 * @placeholder - To be implemented
	 */
	async addTaskComment(_taskGid: string, _comment: string): Promise<void> {
		// TODO: Implement adding comments
		throw new Error('Not implemented');
	}

	/**
	 * List available workspaces
	 * @placeholder - To be implemented
	 */
	async listWorkspaces(): Promise<void> {
		// TODO: Implement listing workspaces
		throw new Error('Not implemented');
	}

	/**
	 * List projects in a workspace
	 * @placeholder - To be implemented
	 */
	async listProjects(_workspaceGid?: string): Promise<void> {
		// TODO: Implement listing projects
		throw new Error('Not implemented');
	}
}
