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

/**
 * Native GitLab merge request state
 */
export type GitLabMrState = 'opened' | 'closed' | 'merged' | 'locked';

/**
 * Merge request as returned by the list endpoint (mapped to camelCase)
 */
export interface GitLabMergeRequest {
	/** Project-internal MR id (e.g. the "!123" number) */
	iid: number;
	/** Web URL to the MR */
	webUrl: string;
	/** Native MR state */
	state: GitLabMrState;
	/** Whether the MR is marked as a draft */
	draft: boolean;
	/** Aggregate mergeability status (used as a fallback for changes-requested) */
	detailedMergeStatus?: string;
	/** Creation timestamp (ISO) */
	createdAt?: string;
}

/**
 * Per-reviewer review state.
 * (GitLab 17.2+; older instances may not populate it.)
 */
export type GitLabReviewerState =
	| 'unreviewed'
	| 'review_started'
	| 'reviewed'
	| 'requested_changes'
	| 'approved'
	| 'unapproved'
	| 'attention_requested';

/**
 * A reviewer on a merge request, with their review state
 */
export interface GitLabReviewer {
	/** Reviewer user id */
	userId: number;
	/** Reviewer username */
	username: string;
	/** The reviewer's review state (string-typed to tolerate unknown future values) */
	state: GitLabReviewerState | string;
}

/**
 * Approval summary for a merge request
 */
export interface GitLabApprovals {
	/** Number of approvals required (0 on Free / no approval rules) */
	approvalsRequired: number;
	/** Number of approvals given so far */
	approvalsGiven: number;
}

/**
 * Derived, UI-facing merge request status for a worktree.
 * This is the high-level status shown on the worktree panel.
 */
export type MergeRequestStatusKind =
	| 'open'
	| 'draft'
	| 'in_review'
	| 'changes_requested'
	| 'merged'
	| 'closed';

/**
 * Resolved merge request status for a worktree branch
 */
export interface MergeRequestStatus {
	/** Project-internal MR id (the "!123" number) */
	iid: number;
	/** Web URL to the MR */
	webUrl: string;
	/** Derived status */
	status: MergeRequestStatusKind;
	/** Number of approvals given */
	approvalsGiven: number;
	/** Number of approvals required (0 when none are required) */
	approvalsRequired: number;
}
