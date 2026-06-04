/**
 * GitLab API Client
 * Thin wrapper around the GitLab REST API (v4)
 */
import type {
	GitLabApiError,
	GitLabApprovals,
	GitLabMergeRequest,
	GitLabMrState,
	GitLabProject,
	GitLabReviewer,
	GitLabUser,
} from './types.js';

/**
 * Default GitLab instance base URL (SaaS gitlab.com)
 */
export const DEFAULT_GITLAB_BASE_URL = 'https://gitlab.com';

/**
 * Error thrown when a GitLab API request fails
 */
export class GitLabApiRequestError extends Error {
	constructor(
		message: string,
		public readonly status?: number,
		public readonly cause?: unknown
	) {
		super(message);
		this.name = 'GitLabApiRequestError';
	}
}

/**
 * Raw user shape returned by the GitLab API (snake_case)
 */
interface RawGitLabUser {
	id: number;
	username: string;
	name: string;
	email?: string;
	web_url?: string;
}

/**
 * Raw project shape returned by the GitLab API (snake_case)
 */
interface RawGitLabProject {
	id: number;
	name: string;
	path_with_namespace: string;
	web_url: string;
}

/**
 * Raw merge request shape returned by the GitLab API (snake_case, partial)
 */
interface RawGitLabMergeRequest {
	iid: number;
	web_url: string;
	state: string;
	draft?: boolean;
	work_in_progress?: boolean;
	detailed_merge_status?: string;
	created_at?: string;
}

/**
 * Raw reviewer entry returned by the reviewers endpoint.
 * Note: the top-level `state` is the review state; `user.state` is the account state.
 */
interface RawGitLabReviewer {
	user?: { id?: number; username?: string };
	state?: string;
}

/**
 * Raw approvals shape returned by the approvals endpoint (partial)
 */
interface RawGitLabApprovals {
	approvals_required?: number;
	approved_by?: Array<{ user?: { id?: number } }>;
}

/**
 * GitLab REST API client
 *
 * Authenticates with a Personal Access Token via the PRIVATE-TOKEN header,
 * which is the canonical scheme for GitLab PATs and works for both gitlab.com
 * and self-hosted instances.
 */
export class GitLabApiClient {
	private readonly apiBaseUrl: string;

	constructor(
		private readonly token: string,
		baseUrl: string = DEFAULT_GITLAB_BASE_URL
	) {
		// Normalize: strip trailing slash, then append the API path
		const normalized = baseUrl.replace(/\/+$/, '');
		this.apiBaseUrl = `${normalized}/api/v4`;
	}

	/**
	 * Perform an authenticated GET request against the GitLab API
	 * @throws GitLabApiRequestError on HTTP, parse, or network failures
	 */
	private async get<T>(path: string): Promise<T> {
		let response: Response;

		try {
			response = await fetch(`${this.apiBaseUrl}${path}`, {
				method: 'GET',
				headers: {
					'PRIVATE-TOKEN': this.token,
					Accept: 'application/json',
				},
			});
		} catch (error) {
			throw new GitLabApiRequestError(
				'Failed to connect to GitLab API. Check your network connection and the instance URL.',
				undefined,
				error
			);
		}

		if (!response.ok) {
			if (response.status === 401) {
				throw new GitLabApiRequestError(
					'Invalid GitLab token. The token is expired, revoked, or incorrect.',
					401
				);
			}

			// Try to parse the error response for a useful message
			try {
				const errorBody = (await response.json()) as GitLabApiError;
				const errorMessage =
					(typeof errorBody.message === 'string' ? errorBody.message : undefined) ||
					errorBody.error_description ||
					errorBody.error ||
					`HTTP ${response.status}`;
				throw new GitLabApiRequestError(`GitLab API error: ${errorMessage}`, response.status);
			} catch (parseError) {
				if (parseError instanceof GitLabApiRequestError) {
					throw parseError;
				}
				throw new GitLabApiRequestError(
					`GitLab API returned status ${response.status}`,
					response.status
				);
			}
		}

		return (await response.json()) as T;
	}

	/**
	 * Get the currently authenticated user (GET /user)
	 */
	async getCurrentUser(): Promise<GitLabUser> {
		const raw = await this.get<RawGitLabUser>('/user');
		return {
			id: raw.id,
			username: raw.username,
			name: raw.name,
			email: raw.email,
			webUrl: raw.web_url,
		};
	}

	/**
	 * List projects the authenticated user is a member of (GET /projects?membership=true)
	 */
	async listProjects(): Promise<GitLabProject[]> {
		const raw = await this.get<RawGitLabProject[]>('/projects?membership=true&simple=true');
		return raw.map((p) => ({
			id: p.id,
			name: p.name,
			pathWithNamespace: p.path_with_namespace,
			webUrl: p.web_url,
		}));
	}

	/**
	 * List merge requests for a project filtered by source branch, newest first.
	 * @param projectPath - `namespace/project` path (will be URL-encoded as the project id)
	 * @param sourceBranch - the worktree's branch name
	 */
	async getMergeRequestsBySourceBranch(
		projectPath: string,
		sourceBranch: string
	): Promise<GitLabMergeRequest[]> {
		const id = encodeURIComponent(projectPath);
		const branch = encodeURIComponent(sourceBranch);
		const raw = await this.get<RawGitLabMergeRequest[]>(
			`/projects/${id}/merge_requests?source_branch=${branch}&order_by=created_at&sort=desc`
		);
		return raw.map((mr) => ({
			iid: mr.iid,
			webUrl: mr.web_url,
			state: mr.state as GitLabMrState,
			draft: mr.draft ?? mr.work_in_progress ?? false,
			detailedMergeStatus: mr.detailed_merge_status,
			createdAt: mr.created_at,
		}));
	}

	/**
	 * Get the reviewers of a merge request, including each reviewer's review state.
	 * @param projectPath - `namespace/project` path
	 * @param mergeRequestIid - project-internal MR id
	 */
	async getMergeRequestReviewers(
		projectPath: string,
		mergeRequestIid: number
	): Promise<GitLabReviewer[]> {
		const id = encodeURIComponent(projectPath);
		const raw = await this.get<RawGitLabReviewer[]>(
			`/projects/${id}/merge_requests/${mergeRequestIid}/reviewers`
		);
		return raw.map((r) => ({
			userId: r.user?.id ?? 0,
			username: r.user?.username ?? '',
			state: r.state ?? 'unreviewed',
		}));
	}

	/**
	 * Get the approval summary for a merge request.
	 * @param projectPath - `namespace/project` path
	 * @param mergeRequestIid - project-internal MR id
	 */
	async getMergeRequestApprovals(
		projectPath: string,
		mergeRequestIid: number
	): Promise<GitLabApprovals> {
		const id = encodeURIComponent(projectPath);
		const raw = await this.get<RawGitLabApprovals>(
			`/projects/${id}/merge_requests/${mergeRequestIid}/approvals`
		);
		return {
			approvalsRequired: raw.approvals_required ?? 0,
			approvalsGiven: raw.approved_by?.length ?? 0,
		};
	}
}
