import fs from 'fs';
import os from 'os';
import path from 'path';

import { AgentSession, SessionStatus } from '../storage/types.js';
import { IAgentAdapter } from './types.js';

interface ClaudeSessionEvent {
	sessionId?: string;
	cwd?: string;
	timestamp?: string;
	type?: string;
	gitBranch?: string;
}

export class ClaudeAdapter implements IAgentAdapter {
	readonly agentType = 'claude' as const;
	private claudeDir: string;

	constructor() {
		this.claudeDir = path.join(os.homedir(), '.claude');
	}

	async isAvailable(): Promise<boolean> {
		try {
			return fs.existsSync(this.claudeDir);
		} catch {
			return false;
		}
	}

	private async getProjectDirs(): Promise<string[]> {
		const projectsDir = path.join(this.claudeDir, 'projects');
		if (!fs.existsSync(projectsDir)) return [];

		try {
			return fs.readdirSync(projectsDir).map((dir) => path.join(projectsDir, dir));
		} catch {
			return [];
		}
	}

	private parseSessionFile(filePath: string): Partial<AgentSession> | null {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			const lines = content.trim().split('\n');
			if (lines.length === 0) return null;

			// Parse JSONL - get first event with full session info
			let sessionData: ClaudeSessionEvent | null = null;
			let lastTimestamp = '';

			for (const line of lines) {
				try {
					const event = JSON.parse(line) as ClaudeSessionEvent;
					if (event.sessionId && event.cwd && !sessionData) {
						sessionData = event;
					}
					if (event.timestamp) {
						lastTimestamp = event.timestamp;
					}
				} catch {
					continue;
				}
			}

			if (!sessionData?.sessionId || !sessionData.cwd) return null;

			return {
				sessionId: sessionData.sessionId,
				workspacePath: sessionData.cwd,
				metadata: {
					branch: sessionData.gitBranch,
					lastActivity: lastTimestamp || sessionData.timestamp,
					startedAt: sessionData.timestamp,
				},
			};
		} catch {
			return null;
		}
	}

	private async determineStatus(sessionId: string, filePath: string): Promise<SessionStatus> {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			const lines = content.trim().split('\n');

			// Parse last few events to determine status
			const recentEvents = lines.slice(-10);
			let lastEventType = '';

			for (let i = recentEvents.length - 1; i >= 0; i--) {
				try {
					const event = JSON.parse(recentEvents[i]) as ClaudeSessionEvent;
					if (event.type) {
						lastEventType = event.type;
						break;
					}
				} catch {
					continue;
				}
			}

			// Determine status based on last event
			if (lastEventType === 'queue-operation') return 'active';
			if (lastEventType === 'assistant') return 'active';
			if (lastEventType === 'user') return 'active';
			if (lastEventType === 'notification') return 'attention';

			// Default to idle if no clear indicator
			return 'idle';
		} catch {
			return 'idle';
		}
	}

	async detectSessions(): Promise<AgentSession[]> {
		const sessions: AgentSession[] = [];
		const projectDirs = await this.getProjectDirs();

		for (const projectDir of projectDirs) {
			try {
				const files = fs.readdirSync(projectDir);
				const sessionFiles = files.filter((f) => f.endsWith('.jsonl') && !f.startsWith('agent-'));

				for (const file of sessionFiles) {
					const filePath = path.join(projectDir, file);
					const sessionData = this.parseSessionFile(filePath);
					if (!sessionData || !sessionData.sessionId) continue;

					const status = await this.determineStatus(sessionData.sessionId, filePath);

					// Session is considered running if status is not 'finished' or 'error'
					const isRunning = status !== 'finished' && status !== 'error';

					sessions.push({
						sessionId: sessionData.sessionId,
						agentType: 'claude',
						groveId: null, // Will be determined by matching workspacePath
						workspacePath: sessionData.workspacePath!,
						worktreePath: null,
						status,
						isRunning,
						lastUpdate: new Date().toISOString(),
						metadata: sessionData.metadata,
					});
				}
			} catch {
				// Skip directories that can't be read
				continue;
			}
		}

		return sessions;
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
