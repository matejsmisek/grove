import { spawn } from 'child_process';
import path from 'path';

import type { AgentSession } from '../storage/types.js';

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
	/** Authoritative status, e.g. 'idle' | 'busy' | 'waiting' | 'completed' | 'failed' | 'stopped' */
	status?: string;
	/** When status is 'waiting', what the session is blocked on */
	waitingFor?: string;
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
		return Array.isArray(parsed) ? (parsed as ClaudeAgentInfo[]) : [];
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
			const proc = spawn('claude', ['agents', '--json'], {
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

/** Outcome of merging the persisted session registry with live `--json` data. */
export interface ReconcileResult {
	/** The reconciled registry (existing entries updated, new live ones appended). */
	sessions: AgentSession[];
	/** Whether anything changed and the registry needs to be persisted. */
	changed: boolean;
}

/**
 * Merge the persisted session registry (populated by Claude hooks) with the live
 * sessions reported by `claude agents --json`.
 *
 * - `claude agents --json` is authoritative for liveness: a registry entry seen
 *   live is (re)marked running, and one no longer reported is considered archived.
 * - A live session missing from the registry is appended, so Grove still knows it
 *   exists even if the hook never fired for it.
 *
 * Status shown in the UI still comes from the live `--json` data directly; the
 * registry only records existence and the archived flag.
 */
export function reconcileSessions(
	registry: AgentSession[],
	live: ClaudeAgentInfo[],
	now: string
): ReconcileResult {
	let changed = false;

	const liveIds = new Set<string>();
	for (const agent of live) {
		if (agent.sessionId) {
			liveIds.add(agent.sessionId);
		}
	}

	const knownIds = new Set(registry.map((s) => s.sessionId));
	const sessions = registry.map((session) => ({ ...session }));

	for (const session of sessions) {
		const isLive = liveIds.has(session.sessionId);
		if (isLive) {
			// A previously-archived (or stopped) session that is live again.
			if (session.archived || !session.isRunning || session.status === 'closed') {
				session.archived = false;
				session.isRunning = true;
				session.status = 'active';
				session.lastUpdate = now;
				changed = true;
			}
		} else if (!session.archived) {
			// No longer reported by `--json` → archived.
			session.archived = true;
			session.isRunning = false;
			session.status = 'closed';
			session.lastUpdate = now;
			changed = true;
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
			isRunning: true,
			archived: false,
			lastUpdate: now,
		});
		changed = true;
	}

	return { sessions, changed };
}
