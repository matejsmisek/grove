import { spawn } from 'child_process';
import path from 'path';

import type { AgentSession, SessionPresence } from '../storage/types.js';

/**
 * A live Claude session as reported by `claude agents --json`.
 *
 * The command returns the authoritative `status` directly, so consumers should
 * render it as-is rather than deriving state themselves. Fields are optional to
 * tolerate forward/backward changes in the CLI output.
 */
export interface ClaudeAgentInfo {
	/** OS process id of the session (or its host) */
	pid?: number;
	/** Working directory the session was started in */
	cwd?: string;
	/** 'interactive' (a normal terminal session) or 'background' (`claude --bg`) */
	kind?: string;
	/** Epoch milliseconds the session started */
	startedAt?: number;
	/** Full session UUID */
	sessionId?: string;
	/** Display name (set via `--name` or auto-generated) */
	name?: string;
	/**
	 * Authoritative status, e.g. 'idle' | 'busy' | 'waiting' | 'completed' | 'failed' | 'stopped'.
	 * When the CLI omits `status`, {@link parseClaudeAgentsJson} backfills it from
	 * `state` (e.g. `done` -> `completed`).
	 */
	status?: string;
	/** When status is 'waiting', what the session is blocked on */
	waitingFor?: string;
	/**
	 * Whether the session is actively opened (live in `--json`) or suspended (kept
	 * by Grove after leaving the live list). Set by {@link reconcileSessions} /
	 * {@link agentInfoFromSession}; live sessions are always 'open'.
	 */
	presence?: SessionPresence;
	/** Preserve any additional fields the CLI reports (e.g. activity timestamps). */
	[key: string]: unknown;
}

/** Candidate field names for a session's most-recent-activity timestamp. */
const LAST_ACTION_KEYS = [
	'lastActionAt',
	'lastActiveAt',
	'lastActivity',
	'updatedAt',
	'lastUpdate',
];

/**
 * Best-effort timestamp (epoch ms) of a session's last action. Prefers any
 * activity timestamp the CLI reports, falling back to `startedAt`.
 */
export function lastActionAt(agent: ClaudeAgentInfo): number | undefined {
	for (const key of LAST_ACTION_KEYS) {
		const value = agent[key];
		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}
		if (typeof value === 'string') {
			const parsed = Date.parse(value);
			if (!Number.isNaN(parsed)) {
				return parsed;
			}
		}
	}
	return typeof agent.startedAt === 'number' ? agent.startedAt : undefined;
}

/** How long to wait for `claude agents --json` before giving up. */
const COMMAND_TIMEOUT_MS = 20000;

/**
 * Translation from the CLI's `state` field to a Grove `status` value, used only
 * when `status` is omitted. `state` uses a different vocabulary than `status`
 * (e.g. an in-progress session reports `state: "working"` but always carries an
 * explicit `status`), so when `status` is missing the state is typically `done`,
 * which maps to the `completed` status. Unmapped states pass through unchanged.
 */
const STATE_TO_STATUS: Record<string, string> = {
	done: 'completed',
};

/**
 * Parse the stdout of `claude agents --json` into a list of sessions.
 * Returns an empty array for empty or non-JSON output (e.g. older CLI versions
 * that print a subagent list instead of opening agent view).
 */
export function parseClaudeAgentsJson(stdout: string): ClaudeAgentInfo[] {
	const trimmed = stdout.trim();
	if (!trimmed) {
		return [];
	}
	try {
		const parsed = JSON.parse(trimmed);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return (parsed as ClaudeAgentInfo[]).map((agent) => {
			// When the CLI omits `status`, derive it from `state` (translating
			// known values, e.g. `done` -> `completed`) so consumers always see a
			// `status`. An unmapped state passes through as-is.
			if (agent.status == null && typeof agent.state === 'string') {
				const state = agent.state.toLowerCase();
				return { ...agent, status: STATE_TO_STATUS[state] ?? agent.state };
			}
			return agent;
		});
	} catch {
		return [];
	}
}

/**
 * List all live Claude sessions (both interactive and background) via
 * `claude agents --json`. Runs asynchronously and never rejects — on any error
 * (claude missing, timeout, bad output) it resolves to an empty array.
 */
export async function listClaudeAgentSessions(): Promise<ClaudeAgentInfo[]> {
	return new Promise((resolve) => {
		let stdout = '';
		let settled = false;
		const finish = (value: ClaudeAgentInfo[]): void => {
			if (!settled) {
				settled = true;
				resolve(value);
			}
		};

		try {
			const proc = spawn('claude', ['agents', '--json', '--all'], {
				stdio: ['ignore', 'pipe', 'ignore'],
			});

			const timer = setTimeout(() => {
				try {
					proc.kill();
				} catch {
					// Ignore kill errors
				}
				finish([]);
			}, COMMAND_TIMEOUT_MS);

			proc.stdout?.on('data', (chunk) => {
				stdout += chunk.toString();
			});
			proc.on('error', () => {
				clearTimeout(timer);
				finish([]);
			});
			proc.on('close', () => {
				clearTimeout(timer);
				finish(parseClaudeAgentsJson(stdout));
			});
		} catch {
			finish([]);
		}
	});
}

/**
 * The short session ID (first UUID segment) printed by `claude --bg`, e.g.
 * "936f9efe" for "936f9efe-5133-4ca4-8955-e20d41a2bd99".
 */
export function shortSessionId(sessionId: string): string {
	return sessionId.split('-')[0];
}

/**
 * Whether `cwd` is the directory `dir` or located somewhere inside it.
 */
export function isWithinDirectory(cwd: string, dir: string): boolean {
	const resolvedCwd = path.resolve(cwd);
	const resolvedDir = path.resolve(dir);
	return resolvedCwd === resolvedDir || resolvedCwd.startsWith(resolvedDir + path.sep);
}

/**
 * Whether a live agent session belongs to a worktree.
 *
 * - Background sessions we launched are matched by their short ID (the first
 *   UUID segment, as returned by `claude --bg` and stored on the worktree).
 * - Any other session (e.g. an interactive `claude` we have no session ID for)
 *   is matched when its `cwd` is the worktree directory or anywhere inside it.
 */
export function agentMatchesWorktree(
	agent: ClaudeAgentInfo,
	worktreeDir: string,
	bgSessionId?: string
): boolean {
	if (bgSessionId && agent.sessionId && shortSessionId(agent.sessionId) === bgSessionId) {
		return true;
	}
	if (agent.cwd && isWithinDirectory(agent.cwd, worktreeDir)) {
		return true;
	}
	return false;
}

/**
 * Whether a persisted registry session belongs to a worktree.
 *
 * Mirrors {@link agentMatchesWorktree} for {@link AgentSession} records: matched by
 * the worktree's background session id (short id), by an exact `worktreePath`, or
 * by a `workspacePath` (the cwd it ran in) inside the worktree directory.
 */
export function sessionMatchesWorktree(
	session: AgentSession,
	worktreeDir: string,
	bgSessionId?: string
): boolean {
	if (bgSessionId && session.sessionId && shortSessionId(session.sessionId) === bgSessionId) {
		return true;
	}
	if (session.worktreePath && path.resolve(session.worktreePath) === path.resolve(worktreeDir)) {
		return true;
	}
	if (session.workspacePath && isWithinDirectory(session.workspacePath, worktreeDir)) {
		return true;
	}
	return false;
}

/** Outcome of merging the persisted session registry with live `--json` data. */
export interface ReconcileResult {
	/** The reconciled registry (existing entries updated, new live ones appended). */
	sessions: AgentSession[];
	/** Whether anything changed and the registry needs to be persisted. */
	changed: boolean;
}

/**
 * Merge the persisted session registry (populated by Claude hooks and prior
 * reconciliations) with the live sessions reported by `claude agents --json`.
 *
 * `claude agents --json` is authoritative for liveness:
 * - A registry entry seen live is marked `open` (and revived if it had been
 *   suspended/archived). Its `kind`/`name`/cwd are captured from the live data so
 *   that, once it later leaves the live list, we know how to treat it.
 * - A registry entry no longer reported live is either:
 *     - **archived** if it is a background session (`kind === 'background'`) — the
 *       previous behaviour, since a finished `--bg` job has nothing to resume; or
 *     - **suspended** otherwise (interactive or unknown kind) — kept in the
 *       registry and shown in the UI so it can be resumed (`claude --resume`).
 * - A live session missing from the registry is appended.
 *
 * The live activity status shown in the UI still comes from the `--json` data
 * directly; the registry tracks existence, `presence`, and the archived flag.
 */
export function reconcileSessions(
	registry: AgentSession[],
	live: ClaudeAgentInfo[],
	now: string
): ReconcileResult {
	let changed = false;

	const liveById = new Map<string, ClaudeAgentInfo>();
	for (const agent of live) {
		if (agent.sessionId) {
			liveById.set(agent.sessionId, agent);
		}
	}

	const knownIds = new Set(registry.map((s) => s.sessionId));
	const sessions = registry.map((session) => ({ ...session }));

	for (const session of sessions) {
		const liveAgent = liveById.get(session.sessionId);
		if (liveAgent) {
			// Live again: refresh captured metadata and mark it open, reviving a
			// previously suspended/archived/stopped entry.
			const kind = typeof liveAgent.kind === 'string' ? liveAgent.kind : session.kind;
			const name = typeof liveAgent.name === 'string' ? liveAgent.name : session.name;
			const cwd = typeof liveAgent.cwd === 'string' ? liveAgent.cwd : session.workspacePath;
			const wasNotOpen =
				session.presence !== 'open' ||
				session.archived === true ||
				!session.isRunning ||
				session.status === 'closed' ||
				session.status === 'suspended';
			if (wasNotOpen || session.kind !== kind || session.name !== name) {
				session.presence = 'open';
				session.archived = false;
				session.isRunning = true;
				if (wasNotOpen) {
					session.status = 'active';
				}
				session.kind = kind;
				session.name = name;
				session.workspacePath = cwd;
				session.lastUpdate = now;
				changed = true;
			}
		} else if (!session.archived) {
			if (session.kind === 'background') {
				// Background sessions have nothing to reattach to once gone → archive.
				if (session.presence !== undefined || session.isRunning || session.status !== 'closed') {
					session.presence = undefined;
					session.archived = true;
					session.isRunning = false;
					session.status = 'closed';
					session.lastUpdate = now;
					changed = true;
				}
			} else if (session.presence !== 'suspended' || session.isRunning) {
				// Interactive (or unknown) sessions are retained but suspended.
				session.presence = 'suspended';
				session.isRunning = false;
				session.status = 'suspended';
				session.lastUpdate = now;
				changed = true;
			}
		}
	}

	for (const agent of live) {
		if (!agent.sessionId || knownIds.has(agent.sessionId)) {
			continue;
		}
		sessions.push({
			sessionId: agent.sessionId,
			agentType: 'claude',
			groveId: null,
			workspacePath: typeof agent.cwd === 'string' ? agent.cwd : '',
			worktreePath: null,
			status: 'active',
			presence: 'open',
			kind: typeof agent.kind === 'string' ? agent.kind : undefined,
			name: typeof agent.name === 'string' ? agent.name : undefined,
			isRunning: true,
			archived: false,
			lastUpdate: now,
		});
		changed = true;
	}

	return { sessions, changed };
}

/**
 * Reconstruct a {@link ClaudeAgentInfo} for the UI from a persisted registry
 * entry. Used to surface suspended sessions (which are no longer in the live
 * `--json` list) so they can still be shown and resumed.
 */
export function agentInfoFromSession(session: AgentSession): ClaudeAgentInfo {
	return {
		sessionId: session.sessionId,
		cwd: session.workspacePath || undefined,
		kind: session.kind,
		name: session.name,
		status: session.status,
		presence: session.presence,
	};
}
