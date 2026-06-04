import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	GITLAB_TOKEN_ENV_VAR,
	GitLabPlugin,
	deriveOpenStatus,
	selectMergeRequest,
} from '../GitLabPlugin.js';
import type { GitLabMergeRequest } from '../types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const REMOTE = 'git@gitlab.com:group/project.git';
const BRANCH = 'feature/x';

interface MockResponses {
	list?: unknown;
	reviewers?: unknown;
	approvals?: unknown;
}

/** Route fetch responses by URL shape. */
function setupFetch(responses: MockResponses) {
	mockFetch.mockImplementation(async (url: string) => {
		if (url.includes('/reviewers')) {
			return { ok: true, json: async () => responses.reviewers ?? [] };
		}
		if (url.includes('/approvals')) {
			return {
				ok: true,
				json: async () => responses.approvals ?? { approvals_required: 0, approved_by: [] },
			};
		}
		if (url.includes('/merge_requests?')) {
			return { ok: true, json: async () => responses.list ?? [] };
		}
		throw new Error(`unexpected url: ${url}`);
	});
}

describe('GitLabPlugin merge request status', () => {
	let plugin: GitLabPlugin;
	let originalEnv: NodeJS.ProcessEnv;

	beforeEach(() => {
		plugin = new GitLabPlugin();
		originalEnv = { ...process.env };
		process.env[GITLAB_TOKEN_ENV_VAR] = 'test-token';
		mockFetch.mockReset();
	});

	afterEach(() => {
		process.env = originalEnv;
		vi.clearAllMocks();
	});

	it('returns null and does not call the API when the remote host does not match the instance', async () => {
		const result = await plugin.getMergeRequestStatus('git@github.com:group/project.git', BRANCH);
		expect(result).toBeNull();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('returns null when the remote URL cannot be parsed', async () => {
		const result = await plugin.getMergeRequestStatus('not a url', BRANCH);
		expect(result).toBeNull();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('returns null when no MR exists for the branch', async () => {
		setupFetch({ list: [] });
		const result = await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		expect(result).toBeNull();
	});

	it('reports a merged MR without fetching reviewers or approvals', async () => {
		setupFetch({
			list: [
				{ iid: 5, web_url: 'https://gitlab.com/group/project/-/merge_requests/5', state: 'merged' },
			],
		});
		const result = await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		expect(result).toMatchObject({ iid: 5, status: 'merged' });
		// Only the list call should have happened.
		expect(mockFetch).toHaveBeenCalledTimes(1);
	});

	it('reports a closed MR', async () => {
		setupFetch({
			list: [{ iid: 6, web_url: 'https://gitlab.com/x/-/merge_requests/6', state: 'closed' }],
		});
		const result = await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		expect(result?.status).toBe('closed');
	});

	it('derives changes_requested when a reviewer requested changes', async () => {
		setupFetch({
			list: [{ iid: 7, web_url: 'u', state: 'opened', draft: false }],
			reviewers: [{ user: { id: 1, username: 'rev' }, state: 'requested_changes' }],
			approvals: { approvals_required: 2, approved_by: [{ user: { id: 9 } }] },
		});
		const result = await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		expect(result).toMatchObject({
			iid: 7,
			status: 'changes_requested',
			approvalsGiven: 1,
			approvalsRequired: 2,
		});
	});

	it('reports draft and lets draft outrank changes_requested', async () => {
		setupFetch({
			list: [{ iid: 8, web_url: 'u', state: 'opened', draft: true }],
			reviewers: [{ user: { id: 1, username: 'rev' }, state: 'requested_changes' }],
		});
		const result = await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		expect(result?.status).toBe('draft');
	});

	it('derives in_review when reviewers are assigned but none requested changes', async () => {
		setupFetch({
			list: [{ iid: 9, web_url: 'u', state: 'opened', draft: false }],
			reviewers: [{ user: { id: 1, username: 'rev' }, state: 'unreviewed' }],
		});
		const result = await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		expect(result?.status).toBe('in_review');
	});

	it('derives open when there are no reviewers', async () => {
		setupFetch({
			list: [{ iid: 10, web_url: 'u', state: 'opened', draft: false }],
			reviewers: [],
		});
		const result = await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		expect(result?.status).toBe('open');
	});

	it('caches results so a second call within the TTL does not refetch', async () => {
		setupFetch({
			list: [{ iid: 11, web_url: 'u', state: 'opened', draft: false }],
			reviewers: [],
			approvals: { approvals_required: 0, approved_by: [] },
		});
		await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		const callsAfterFirst = mockFetch.mock.calls.length;
		await plugin.getMergeRequestStatus(REMOTE, BRANCH);
		expect(mockFetch.mock.calls.length).toBe(callsAfterFirst);
	});

	it('throws when the API errors', async () => {
		mockFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
		await expect(plugin.getMergeRequestStatus(REMOTE, BRANCH)).rejects.toThrow();
	});
});

describe('selectMergeRequest', () => {
	const mk = (iid: number, state: GitLabMergeRequest['state']): GitLabMergeRequest => ({
		iid,
		webUrl: `u${iid}`,
		state,
		draft: false,
	});

	it('returns null for an empty list', () => {
		expect(selectMergeRequest([])).toBeNull();
	});

	it('prefers the most recent active (opened/merged) MR', () => {
		// List is newest-first.
		const selected = selectMergeRequest([mk(3, 'closed'), mk(2, 'opened'), mk(1, 'merged')]);
		expect(selected?.iid).toBe(2);
	});

	it('falls back to the most recent overall when all are closed', () => {
		const selected = selectMergeRequest([mk(3, 'closed'), mk(2, 'closed')]);
		expect(selected?.iid).toBe(3);
	});
});

describe('deriveOpenStatus', () => {
	const mr = (over: Partial<GitLabMergeRequest> = {}): GitLabMergeRequest => ({
		iid: 1,
		webUrl: 'u',
		state: 'opened',
		draft: false,
		...over,
	});

	it('returns draft first', () => {
		expect(
			deriveOpenStatus(mr({ draft: true }), [{ userId: 1, username: 'a', state: 'requested_changes' }])
		).toBe('draft');
	});

	it('returns changes_requested when any reviewer requested changes', () => {
		expect(
			deriveOpenStatus(mr(), [
				{ userId: 1, username: 'a', state: 'reviewed' },
				{ userId: 2, username: 'b', state: 'requested_changes' },
			])
		).toBe('changes_requested');
	});

	it('uses detailed_merge_status as a fallback for changes_requested', () => {
		expect(deriveOpenStatus(mr({ detailedMergeStatus: 'requested_changes' }), [])).toBe(
			'changes_requested'
		);
	});

	it('returns in_review when reviewers exist without changes requested', () => {
		expect(deriveOpenStatus(mr(), [{ userId: 1, username: 'a', state: 'unreviewed' }])).toBe(
			'in_review'
		);
	});

	it('returns open when there are no reviewers', () => {
		expect(deriveOpenStatus(mr(), [])).toBe('open');
	});
});
