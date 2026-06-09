import { describe, expect, it } from 'vitest';

import type { AgentSession } from '../../storage/types.js';
import {
	type ClaudeAgentInfo,
	agentMatchesWorktree,
	lastActionAt,
	parseClaudeAgentsJson,
	reconcileSessions,
	sessionMatchesWorktree,
	shortSessionId,
} from '../claudeAgents.js';

describe('claudeAgents', () => {
	describe('parseClaudeAgentsJson', () => {
		it('parses a JSON array of sessions', () => {
			const stdout = JSON.stringify([
				{ pid: 1, cwd: '/a', kind: 'interactive', sessionId: 'id-1', status: 'idle' },
				{ pid: 2, cwd: '/b', kind: 'background', sessionId: 'id-2', status: 'busy', name: 'x' },
			]);

			const result = parseClaudeAgentsJson(stdout);

			expect(result).toHaveLength(2);
			expect(result[1]).toMatchObject({ kind: 'background', status: 'busy', name: 'x' });
		});

		it('returns [] for empty output', () => {
			expect(parseClaudeAgentsJson('')).toEqual([]);
			expect(parseClaudeAgentsJson('   \n ')).toEqual([]);
		});

		it('returns [] for non-JSON output (e.g. older CLI)', () => {
			expect(parseClaudeAgentsJson('No agent view available\nsome-subagent')).toEqual([]);
		});

		it('returns [] when JSON is not an array', () => {
			expect(parseClaudeAgentsJson('{"sessionId":"x"}')).toEqual([]);
		});

		it('maps `state: done` to `status: completed` when `status` is missing', () => {
			const stdout = JSON.stringify([{ sessionId: 'id-1', state: 'done' }]);

			expect(parseClaudeAgentsJson(stdout)[0].status).toBe('completed');
		});

		it('falls back to an unmapped `state` verbatim when `status` is missing', () => {
			const stdout = JSON.stringify([{ sessionId: 'id-1', state: 'idle' }]);

			expect(parseClaudeAgentsJson(stdout)[0].status).toBe('idle');
		});

		it('keeps `status` when present even if `state` is also reported', () => {
			const stdout = JSON.stringify([{ sessionId: 'id-1', status: 'working', state: 'done' }]);

			expect(parseClaudeAgentsJson(stdout)[0].status).toBe('working');
		});
	});

	describe('lastActionAt', () => {
		it('falls back to startedAt when no activity field is present', () => {
			expect(lastActionAt({ startedAt: 1779782349014 })).toBe(1779782349014);
		});

		it('prefers a numeric activity timestamp over startedAt', () => {
			expect(lastActionAt({ startedAt: 1, updatedAt: 1779782349014 })).toBe(1779782349014);
		});

		it('parses an ISO-string activity timestamp', () => {
			const iso = '2026-06-06T10:00:00.000Z';
			expect(lastActionAt({ lastActivity: iso })).toBe(Date.parse(iso));
		});

		it('returns undefined when there is no timestamp at all', () => {
			expect(lastActionAt({ sessionId: 'x' })).toBeUndefined();
		});
	});

	describe('shortSessionId', () => {
		it('returns the first UUID segment (the id printed by claude --bg)', () => {
			expect(shortSessionId('936f9efe-5133-4ca4-8955-e20d41a2bd99')).toBe('936f9efe');
		});

		it('returns the whole string when there is no dash', () => {
			expect(shortSessionId('abc123')).toBe('abc123');
		});
	});

	describe('agentMatchesWorktree', () => {
		const base: ClaudeAgentInfo = {
			cwd: '/home/me/grove/wt',
			sessionId: '936f9efe-5133-4ca4-8955-e20d41a2bd99',
			status: 'idle',
		};

		it('matches by working directory', () => {
			expect(agentMatchesWorktree(base, '/home/me/grove/wt')).toBe(true);
		});

		it('matches a working directory with a trailing slash difference', () => {
			expect(agentMatchesWorktree({ ...base, cwd: '/home/me/grove/wt/' }, '/home/me/grove/wt')).toBe(
				true
			);
		});

		it('matches a session running in a subdirectory of the worktree', () => {
			const agent: ClaudeAgentInfo = { ...base, cwd: '/home/me/grove/wt/packages/api' };
			expect(agentMatchesWorktree(agent, '/home/me/grove/wt')).toBe(true);
		});

		it('matches a background session by its short id even if cwd differs', () => {
			const agent: ClaudeAgentInfo = { ...base, cwd: '/somewhere/else' };
			expect(agentMatchesWorktree(agent, '/home/me/grove/wt', '936f9efe')).toBe(true);
		});

		it('does not match a different worktree', () => {
			expect(agentMatchesWorktree(base, '/home/me/grove/other')).toBe(false);
		});

		it('does not match a sibling whose path is a string prefix', () => {
			// '/home/me/grove/wt-2' must not match worktree dir '/home/me/grove/wt'
			const agent: ClaudeAgentInfo = { ...base, cwd: '/home/me/grove/wt-2' };
			expect(agentMatchesWorktree(agent, '/home/me/grove/wt')).toBe(false);
		});

		it('does not match on short id when no bgSessionId is provided', () => {
			const agent: ClaudeAgentInfo = { ...base, cwd: '/elsewhere' };
			expect(agentMatchesWorktree(agent, '/home/me/grove/wt')).toBe(false);
		});
	});

	describe('sessionMatchesWorktree', () => {
		const base: AgentSession = {
			sessionId: '936f9efe-5133-4ca4-8955-e20d41a2bd99',
			agentType: 'claude',
			groveId: null,
			workspacePath: '/home/me/grove/wt',
			worktreePath: null,
			status: 'closed',
			isRunning: false,
			archived: true,
			lastUpdate: '2026-06-07T00:00:00.000Z',
		};

		it('matches by workspacePath (the cwd it ran in)', () => {
			expect(sessionMatchesWorktree(base, '/home/me/grove/wt')).toBe(true);
		});

		it('matches a session whose workspacePath is a subdirectory of the worktree', () => {
			expect(
				sessionMatchesWorktree({ ...base, workspacePath: '/home/me/grove/wt/api' }, '/home/me/grove/wt')
			).toBe(true);
		});

		it('matches by an exact worktreePath', () => {
			const session: AgentSession = {
				...base,
				workspacePath: '/elsewhere',
				worktreePath: '/home/me/grove/wt',
			};
			expect(sessionMatchesWorktree(session, '/home/me/grove/wt')).toBe(true);
		});

		it('matches a background session by its short id', () => {
			const session: AgentSession = { ...base, workspacePath: '/elsewhere' };
			expect(sessionMatchesWorktree(session, '/home/me/grove/wt', '936f9efe')).toBe(true);
		});

		it('does not match a sibling whose path is a string prefix', () => {
			const session: AgentSession = { ...base, workspacePath: '/home/me/grove/wt-2' };
			expect(sessionMatchesWorktree(session, '/home/me/grove/wt')).toBe(false);
		});

		it('does not match a different worktree without a matching id', () => {
			const session: AgentSession = { ...base, workspacePath: '/elsewhere' };
			expect(sessionMatchesWorktree(session, '/home/me/grove/wt')).toBe(false);
		});
	});

	describe('reconcileSessions', () => {
		const NOW = '2026-06-07T00:00:00.000Z';

		const registryEntry = (overrides: Partial<AgentSession>): AgentSession => ({
			sessionId: 'id',
			agentType: 'claude',
			groveId: null,
			workspacePath: '/wt',
			worktreePath: null,
			status: 'active',
			isRunning: true,
			lastUpdate: '2026-01-01T00:00:00.000Z',
			...overrides,
		});

		it('archives a registry session no longer reported live', () => {
			const registry = [registryEntry({ sessionId: 'gone' })];
			const { sessions, changed } = reconcileSessions(registry, [], NOW);
			expect(changed).toBe(true);
			expect(sessions[0]).toMatchObject({
				sessionId: 'gone',
				archived: true,
				isRunning: false,
				status: 'closed',
				lastUpdate: NOW,
			});
		});

		it('registers a live session the registry has not seen', () => {
			const live: ClaudeAgentInfo[] = [{ sessionId: 'new', cwd: '/wt' }];
			const { sessions, changed } = reconcileSessions([], live, NOW);
			expect(changed).toBe(true);
			expect(sessions).toHaveLength(1);
			expect(sessions[0]).toMatchObject({
				sessionId: 'new',
				workspacePath: '/wt',
				archived: false,
				isRunning: true,
			});
		});

		it('revives a previously-archived session that is live again', () => {
			const registry = [
				registryEntry({ sessionId: 'back', archived: true, isRunning: false, status: 'closed' }),
			];
			const live: ClaudeAgentInfo[] = [{ sessionId: 'back', cwd: '/wt' }];
			const { sessions, changed } = reconcileSessions(registry, live, NOW);
			expect(changed).toBe(true);
			expect(sessions[0]).toMatchObject({ archived: false, isRunning: true, status: 'active' });
		});

		it('leaves an already-archived, still-absent session unchanged', () => {
			const registry = [
				registryEntry({ sessionId: 'old', archived: true, isRunning: false, status: 'closed' }),
			];
			const { changed } = reconcileSessions(registry, [], NOW);
			expect(changed).toBe(false);
		});

		it('does not mutate the input registry array entries', () => {
			const registry = [registryEntry({ sessionId: 'gone' })];
			reconcileSessions(registry, [], NOW);
			expect(registry[0].archived).toBeUndefined();
		});
	});
});
