import fs from 'fs';
import os from 'os';
import path from 'path';

import { AgentSession, SessionStatus } from '../storage/types.js';
import { type ClaudeAgentInfo, listClaudeAgentSessions } from '../utils/claudeAgents.js';
import { IAgentAdapter } from './types.js';

/**
 * Map the raw status reported by `claude agents --json` onto Grove's internal
 * SessionStatus. The CLI is the source of truth; this is a thin lookup only so
 * the value fits the persisted session model.
 */
function mapStatus(raw?: string): SessionStatus {
	switch ((raw ?? '').toLowerCase()) {
		case 'busy':
		case 'working':
		case 'running':
			return 'active';
		case 'waiting':
		case 'blocked':
			return 'attention';
		case 'failed':
		case 'error':
			return 'error';
		case 'completed':
		case 'done':
		case 'stopped':
			return 'closed';
		case 'idle':
		default:
			return 'idle';
	}
}

/**
 * Claude agent adapter.
 *
 * Sessions are sourced from `claude agents --json`, which reports all live
 * Claude sessions (interactive and background) along with their authoritative
 * status. (Previously this parsed JSONL transcripts under ~/.claude/projects.)
 */
export class ClaudeAdapter implements IAgentAdapter {
	readonly agentType = 'claude' as const;

	async isAvailable(): Promise<boolean> {
		try {
			return fs.existsSync(path.join(os.homedir(), '.claude'));
		} catch {
			return false;
		}
	}

	async detectSessions(): Promise<AgentSession[]> {
		const agents = await listClaudeAgentSessions();
		return agents
			.filter((agent) => agent.sessionId && agent.cwd)
			.map((agent) => this.toAgentSession(agent));
	}

	private toAgentSession(agent: ClaudeAgentInfo): AgentSession {
		const status = mapStatus(agent.status);
		return {
			sessionId: agent.sessionId!,
			agentType: 'claude',
			groveId: null, // Determined later by matching workspacePath to worktrees
			workspacePath: agent.cwd!,
			worktreePath: null,
			status,
			isRunning: status !== 'closed' && status !== 'error',
			lastUpdate: new Date().toISOString(),
			metadata: {
				startedAt: agent.startedAt ? new Date(agent.startedAt).toISOString() : undefined,
				name: agent.name,
				kind: agent.kind,
				claudeStatus: agent.status,
			},
		};
	}

	async verifySession(sessionId: string): Promise<AgentSession | null> {
		const sessions = await this.detectSessions();
		return sessions.find((s) => s.sessionId === sessionId) || null;
	}

	async getSessionStatus(sessionId: string): Promise<SessionStatus | null> {
		const session = await this.verifySession(sessionId);
		return session?.status || null;
	}
}
