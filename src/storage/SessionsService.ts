import fs from 'fs';

import { AgentSession, SessionsData, SessionsIndex } from './types.js';

export interface ISessionsService {
	readSessions(): SessionsData;
	writeSessions(data: SessionsData): void;
	addSession(session: AgentSession): void;
	updateSession(sessionId: string, updates: Partial<AgentSession>): AgentSession | null;
	removeSession(sessionId: string): boolean;
	getSessionsByGrove(groveId: string): AgentSession[];
	getSessionsByWorkspace(workspacePath: string): AgentSession[];
	getSession(sessionId: string): AgentSession | null;
	getAllActiveSessions(): AgentSession[];
	buildIndex(): SessionsIndex;
	cleanupStaleSessions(staleThresholdMinutes?: number): number;
}

export class SessionsService implements ISessionsService {
	constructor(private storageConfig: { sessionsPath: string }) {}

	private getDefaultData(): SessionsData {
		return {
			sessions: [],
			version: '1.0.0',
			lastUpdated: new Date().toISOString(),
		};
	}

	readSessions(): SessionsData {
		try {
			const data = fs.readFileSync(this.storageConfig.sessionsPath, 'utf8');
			return JSON.parse(data) as SessionsData;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return this.getDefaultData();
			}
			throw error;
		}
	}

	writeSessions(data: SessionsData): void {
		data.lastUpdated = new Date().toISOString();
		fs.writeFileSync(this.storageConfig.sessionsPath, JSON.stringify(data, null, 2), 'utf8');
	}

	addSession(session: AgentSession): void {
		const data = this.readSessions();
		// Remove existing session with same ID if present
		data.sessions = data.sessions.filter((s) => s.sessionId !== session.sessionId);
		data.sessions.push({
			...session,
			// Only update lastUpdate if not provided
			lastUpdate: session.lastUpdate || new Date().toISOString(),
		});
		this.writeSessions(data);
	}

	updateSession(sessionId: string, updates: Partial<AgentSession>): AgentSession | null {
		const data = this.readSessions();
		const session = data.sessions.find((s) => s.sessionId === sessionId);
		if (!session) return null;

		Object.assign(session, updates, {
			lastUpdate: new Date().toISOString(),
		});
		this.writeSessions(data);
		return session;
	}

	removeSession(sessionId: string): boolean {
		const data = this.readSessions();
		const initialLength = data.sessions.length;
		data.sessions = data.sessions.filter((s) => s.sessionId !== sessionId);
		if (data.sessions.length < initialLength) {
			this.writeSessions(data);
			return true;
		}
		return false;
	}

	getSessionsByGrove(groveId: string): AgentSession[] {
		const data = this.readSessions();
		return data.sessions.filter((s) => s.groveId === groveId);
	}

	getSessionsByWorkspace(workspacePath: string): AgentSession[] {
		const data = this.readSessions();
		return data.sessions.filter((s) => s.workspacePath === workspacePath);
	}

	getSession(sessionId: string): AgentSession | null {
		const data = this.readSessions();
		return data.sessions.find((s) => s.sessionId === sessionId) || null;
	}

	getAllActiveSessions(): AgentSession[] {
		const data = this.readSessions();
		return data.sessions.filter((s) => s.isRunning && s.status !== 'finished');
	}

	buildIndex(): SessionsIndex {
		const data = this.readSessions();
		const index: SessionsIndex = {
			byWorkspace: {},
			byGrove: {},
			bySessionId: {},
			lastCleanup: new Date().toISOString(),
		};

		for (const session of data.sessions) {
			// Index by workspace
			if (!index.byWorkspace[session.workspacePath]) {
				index.byWorkspace[session.workspacePath] = [];
			}
			index.byWorkspace[session.workspacePath].push(session);

			// Index by grove
			if (session.groveId) {
				if (!index.byGrove[session.groveId]) {
					index.byGrove[session.groveId] = [];
				}
				index.byGrove[session.groveId].push(session);
			}

			// Index by session ID
			index.bySessionId[session.sessionId] = session;
		}

		return index;
	}

	cleanupStaleSessions(staleThresholdMinutes = 60): number {
		const data = this.readSessions();
		const now = Date.now();
		const threshold = staleThresholdMinutes * 60 * 1000;
		const initialCount = data.sessions.length;

		data.sessions = data.sessions.filter((session) => {
			const lastUpdate = new Date(session.lastUpdate).getTime();
			const age = now - lastUpdate;

			// Keep if recently updated
			if (age < threshold) return true;

			// Keep if still running (will be validated by adapter)
			if (session.isRunning && session.status !== 'finished') return true;

			// Remove stale finished sessions
			return false;
		});

		const removedCount = initialCount - data.sessions.length;
		if (removedCount > 0) {
			this.writeSessions(data);
		}
		return removedCount;
	}
}
