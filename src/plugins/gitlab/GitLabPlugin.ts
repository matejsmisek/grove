/**
 * GitLab Plugin
 * Integrates Grove with GitLab (repositories, merge requests, issues)
 */
import { BasePlugin } from '../BasePlugin.js';
import type { PluginMetadata } from '../types.js';
import {
	DEFAULT_GITLAB_BASE_URL,
	GitLabApiClient,
	GitLabApiRequestError,
} from './GitLabApiClient.js';
import { parseGitRemote } from './gitRemote.js';
import type {
	GitLabMergeRequest,
	GitLabPluginSettings,
	GitLabProject,
	GitLabReviewer,
	GitLabUser,
	MergeRequestStatus,
	MergeRequestStatusKind,
} from './types.js';

/**
 * Plugin ID constant
 */
export const GITLAB_PLUGIN_ID = 'gitlab';

/**
 * How long a resolved merge request status is cached before it is refetched (ms)
 */
export const MR_CACHE_TTL_MS = 60_000;

interface MrCacheEntry {
	value: MergeRequestStatus | null;
	fetchedAt: number;
}

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
export class GitLabPlugin extends BasePlugin {
	readonly metadata: PluginMetadata = {
		id: GITLAB_PLUGIN_ID,
		name: 'GitLab',
		description: 'Integrate Grove with GitLab (repositories, merge requests, issues)',
		version: '0.1.0',
	};

	private settings: GitLabPluginSettings = {};
	private initialized = false;
	private currentUser: GitLabUser | null = null;

	/** Cache of resolved MR statuses, keyed by `host/projectPath#branch` */
	private mrCache = new Map<string, MrCacheEntry>();
	/** In-flight fetches, to dedupe concurrent requests for the same key */
	private mrInFlight = new Map<string, Promise<MergeRequestStatus | null>>();

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
		this.mrCache.clear();
		this.mrInFlight.clear();
	}

	/**
	 * Check if the plugin is available/configured
	 * Returns true if GROVE_GITLAB_TOKEN env var or accessToken setting is present
	 */
	protected checkAvailable(): boolean {
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
	 * Resolve the merge request status for a worktree's branch.
	 *
	 * Returns null when there is no MR, when the remote doesn't belong to the
	 * configured GitLab instance, or when the remote can't be parsed. Results are
	 * cached per `host/projectPath#branch` for {@link MR_CACHE_TTL_MS}; calls within
	 * the TTL return the cached value, and concurrent calls share one request.
	 *
	 * @param remoteUrl - the repository's `origin` remote URL
	 * @param branch - the worktree's branch name
	 * @throws GitLabTokenValidationError if a network/API error occurs
	 */
	async getMergeRequestStatus(
		remoteUrl: string,
		branch: string
	): Promise<MergeRequestStatus | null> {
		const parsed = parseGitRemote(remoteUrl);
		if (!parsed || !this.hostMatchesInstance(parsed.host)) {
			return null;
		}

		const key = `${parsed.host}/${parsed.projectPath}#${branch}`;

		const cached = this.mrCache.get(key);
		if (cached && Date.now() - cached.fetchedAt < MR_CACHE_TTL_MS) {
			return cached.value;
		}

		const inFlight = this.mrInFlight.get(key);
		if (inFlight) {
			return inFlight;
		}

		const promise = this.fetchMergeRequestStatus(parsed.projectPath, branch)
			.then((value) => {
				this.mrCache.set(key, { value, fetchedAt: Date.now() });
				return value;
			})
			.finally(() => {
				this.mrInFlight.delete(key);
			});

		this.mrInFlight.set(key, promise);
		return promise;
	}

	/**
	 * Whether a remote host matches the configured GitLab instance host
	 */
	private hostMatchesInstance(remoteHost: string): boolean {
		try {
			const instanceHost = new URL(this.getBaseUrl()).hostname.toLowerCase();
			return remoteHost.toLowerCase() === instanceHost;
		} catch {
			return false;
		}
	}

	/**
	 * Fetch and derive the MR status for a project/branch (no caching).
	 */
	private async fetchMergeRequestStatus(
		projectPath: string,
		branch: string
	): Promise<MergeRequestStatus | null> {
		const client = this.createClient();

		try {
			const mrs = await client.getMergeRequestsBySourceBranch(projectPath, branch);
			const selected = selectMergeRequest(mrs);
			if (!selected) {
				return null;
			}

			// Terminal states need no further calls.
			if (selected.state === 'merged') {
				return {
					iid: selected.iid,
					webUrl: selected.webUrl,
					status: 'merged',
					approvalsGiven: 0,
					approvalsRequired: 0,
				};
			}
			if (selected.state === 'closed' || selected.state === 'locked') {
				return {
					iid: selected.iid,
					webUrl: selected.webUrl,
					status: 'closed',
					approvalsGiven: 0,
					approvalsRequired: 0,
				};
			}

			// Opened: gather reviewer states + approvals. Tolerate per-call failures
			// (e.g. reviewers endpoint missing on old GitLab, approvals on Free).
			const [reviewers, approvals] = await Promise.all([
				client.getMergeRequestReviewers(projectPath, selected.iid).catch(() => [] as GitLabReviewer[]),
				client
					.getMergeRequestApprovals(projectPath, selected.iid)
					.catch(() => ({ approvalsRequired: 0, approvalsGiven: 0 })),
			]);

			return {
				iid: selected.iid,
				webUrl: selected.webUrl,
				status: deriveOpenStatus(selected, reviewers),
				approvalsGiven: approvals.approvalsGiven,
				approvalsRequired: approvals.approvalsRequired,
			};
		} catch (error) {
			if (error instanceof GitLabApiRequestError) {
				throw new GitLabTokenValidationError(error.message, error.cause ?? error);
			}
			throw error;
		}
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

/**
 * Select which MR represents a branch when several exist.
 * The list is newest-first; prefer the most recent active (open/merged) MR,
 * otherwise fall back to the most recent overall.
 */
export function selectMergeRequest(mergeRequests: GitLabMergeRequest[]): GitLabMergeRequest | null {
	if (mergeRequests.length === 0) {
		return null;
	}
	const active = mergeRequests.find((mr) => mr.state === 'opened' || mr.state === 'merged');
	return active ?? mergeRequests[0];
}

/**
 * Derive the status of an opened MR from its draft flag and reviewer states.
 * Precedence: draft > changes requested > in review > open.
 */
export function deriveOpenStatus(
	mr: GitLabMergeRequest,
	reviewers: GitLabReviewer[]
): MergeRequestStatusKind {
	if (mr.draft) {
		return 'draft';
	}
	const changesRequested =
		reviewers.some((r) => r.state === 'requested_changes') ||
		mr.detailedMergeStatus === 'requested_changes';
	if (changesRequested) {
		return 'changes_requested';
	}
	if (reviewers.length > 0) {
		return 'in_review';
	}
	return 'open';
}
