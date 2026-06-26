import fs from 'fs';
import os from 'os';
import path from 'path';

import type { ISessionsService } from '../storage/SessionsService.js';
import {
	type ClaudeAgentInfo,
	agentInfoFromSession,
	listClaudeAgentSessions,
	reconcileSessions,
	shortSessionId,
} from '../utils/claudeAgents.js';
import { spawnCollect } from '../utils/spawnCollect.js';

/**
 * Claude session service interface
 * Tracks Claude sessions: liveness, the live `claude agents --json` list, and
 * archiving against the hook-written registry (`sessions.json`).
 */
export interface IClaudeSessionService {
	/** Whether a background session still exists (its `~/.claude/jobs/<id>` dir is present) */
	isBackgroundSessionAlive(sessionId: string): boolean;
	/** List all live Claude sessions (interactive + background) via `claude agents --json` */
	listAgentSessions(): Promise<ClaudeAgentInfo[]>;
	/**
	 * List the Claude sessions Grove should show: the live `claude agents --json`
	 * sessions, reconciled against the persisted registry (written by hooks) and
	 * with archived sessions excluded. Reconciling also archives registry entries
	 * that are no longer reported live.
	 */
	listTrackedSessions(): Promise<ClaudeAgentInfo[]>;
	/**
	 * Archive a session: remove it from Claude's agent list (`claude rm <id>`) and
	 * mark it archived in the registry so Grove stops showing it. The registry
	 * entry is kept (archived sessions are stored, just hidden).
	 */
	archiveSession(sessionId: string): Promise<void>;
}

/**
 * Claude Session Service
 * Tracks Claude sessions (liveness, live agent list, archiving). Session
 * launching lives in SessionLauncherService / BackgroundSessionService; template
 * resolution lives in SessionTemplateService.
 */
export class ClaudeSessionService implements IClaudeSessionService {
	constructor(private readonly sessionsService: ISessionsService) {}

	/**
	 * Directory under which background session state is stored
	 * (`$CLAUDE_CONFIG_DIR` or `~/.claude`).
	 */
	private claudeConfigDir(): string {
		return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
	}

	/**
	 * Whether a background session still exists. A background session's short ID
	 * is the name of its directory under `~/.claude/jobs/<id>`, so checking for
	 * that directory is a cheap existence test.
	 */
	isBackgroundSessionAlive(sessionId: string): boolean {
		if (!sessionId) {
			return false;
		}
		try {
			return fs.existsSync(path.join(this.claudeConfigDir(), 'jobs', sessionId));
		} catch {
			return false;
		}
	}

	/**
	 * List all live Claude sessions (interactive and background) by invoking
	 * `claude agents --json`. Delegates to the shared util; never throws.
	 */
	listAgentSessions(): Promise<ClaudeAgentInfo[]> {
		return listClaudeAgentSessions();
	}

	/**
	 * List the sessions Grove should display: the live `claude agents --json`
	 * sessions, reconciled against the persisted registry (`sessions.json`).
	 *
	 * Reconciliation lets interactive sessions survive losing their live process
	 * (e.g. the terminal was closed): instead of disappearing, they are kept in the
	 * registry as `suspended` and still returned here so they can be resumed.
	 * Background sessions are archived (and hidden) once they leave the live list,
	 * as before. Archived sessions are always excluded.
	 */
	async listTrackedSessions(): Promise<ClaudeAgentInfo[]> {
		const live = await this.listAgentSessions();

		let registry: ReturnType<ISessionsService['readSessions']>;
		try {
			registry = this.sessionsService.readSessions();
		} catch {
			// No usable registry — fall back to the live list (all actively open).
			return live.map((agent) => ({ ...agent, presence: 'open' as const }));
		}

		const now = new Date().toISOString();
		const { sessions, changed } = reconcileSessions(registry.sessions, live, now);
		if (changed) {
			try {
				this.sessionsService.writeSessions({ ...registry, sessions });
			} catch {
				// Persistence is best-effort; still return the reconciled view.
			}
		}

		const liveIds = new Set(live.map((agent) => agent.sessionId).filter(Boolean));
		// Live sessions keep their fresh `--json` status; append the suspended
		// (retained, non-live, non-archived) registry sessions so they stay
		// visible and resumable.
		const result: ClaudeAgentInfo[] = live.map((agent) => ({ ...agent, presence: 'open' }));
		for (const session of sessions) {
			if (liveIds.has(session.sessionId) || session.archived || session.presence !== 'suspended') {
				continue;
			}
			result.push(agentInfoFromSession(session));
		}
		return result;
	}

	/**
	 * Archive a session: best-effort `claude rm <id>` to drop it from the agent
	 * list, then flag it archived in the registry so it disappears from the UI
	 * immediately (the entry is kept, just hidden).
	 */
	async archiveSession(sessionId: string): Promise<void> {
		await this.claudeRemoveAgent(sessionId);
		try {
			const existing = this.sessionsService.getSession(sessionId);
			if (existing) {
				this.sessionsService.updateSession(sessionId, {
					archived: true,
					isRunning: false,
					status: 'closed',
				});
			} else {
				this.sessionsService.addSession({
					sessionId,
					agentType: 'claude',
					groveId: null,
					workspacePath: '',
					worktreePath: null,
					status: 'closed',
					isRunning: false,
					archived: true,
					lastUpdate: new Date().toISOString(),
				});
			}
		} catch {
			// Registry persistence is best-effort; the agent was still removed.
		}
	}

	/** Remove a session from Claude's agent list via `claude rm <id>` (best-effort). */
	private async claudeRemoveAgent(sessionId: string): Promise<void> {
		// Non-blocking; failures are ignored — the registry archive still hides the session.
		await spawnCollect('claude', ['rm', shortSessionId(sessionId)], { timeoutMs: 20000 });
	}
}
