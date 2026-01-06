import { ISessionsService } from '../storage/SessionsService.js';
import { IGrovesService } from './interfaces.js';
import { AdapterRegistry } from '../agents/AdapterRegistry.js';
import { AgentSession } from '../storage/types.js';
import { SessionUpdateResult } from '../agents/types.js';

export interface ISessionTrackingService {
	/**
	 * Update sessions from all available agents
	 * Returns summary of changes
	 */
	updateAllSessions(): Promise<SessionUpdateResult>;

	/**
	 * Map workspace paths to grove IDs
	 */
	mapSessionsToGroves(): Promise<void>;

	/**
	 * Get active session count for a grove
	 */
	getGroveSessionCounts(groveId: string): {
		active: number;
		idle: number;
		attention: number;
		total: number;
	};

	/**
	 * Clean up stale sessions
	 */
	cleanupStale(thresholdMinutes?: number): Promise<number>;
}

export class SessionTrackingService implements ISessionTrackingService {
	constructor(
		private sessionsService: ISessionsService,
		private grovesService: IGrovesService,
		private adapterRegistry: AdapterRegistry,
	) {}

	async updateAllSessions(): Promise<SessionUpdateResult> {
		const result: SessionUpdateResult = {
			added: 0,
			updated: 0,
			removed: 0,
			errors: [],
		};

		const availableAdapters = await this.adapterRegistry.getAvailable();

		for (const adapter of availableAdapters) {
			try {
				const detectedSessions = await adapter.detectSessions();

				for (const session of detectedSessions) {
					const existing = this.sessionsService.getSession(session.sessionId);

					if (!existing) {
						this.sessionsService.addSession(session);
						result.added++;
					} else {
						this.sessionsService.updateSession(session.sessionId, session);
						result.updated++;
					}
				}
			} catch (error) {
				result.errors.push(
					`${adapter.agentType}: ${error instanceof Error ? error.message : 'Unknown error'}`,
				);
			}
		}

		// Map sessions to groves after detection
		await this.mapSessionsToGroves();

		return result;
	}

	async mapSessionsToGroves(): Promise<void> {
		const allSessions = this.sessionsService.readSessions().sessions;
		const allGroves = this.grovesService.readGrovesIndex().groves;

		for (const session of allSessions) {
			// Find matching grove by checking if workspace path is within any worktree
			let matchedGroveId: string | null = null;
			let matchedWorktreePath: string | null = null;

			for (const grove of allGroves) {
				const groveData = this.grovesService.readGroveMetadata(grove.path);
				if (!groveData) continue;

				for (const worktree of groveData.worktrees) {
					if (session.workspacePath.startsWith(worktree.worktreePath)) {
						matchedGroveId = grove.id;
						matchedWorktreePath = worktree.worktreePath;
						break;
					}
				}
				if (matchedGroveId) break;
			}

			// Update session if grove mapping changed
			if (session.groveId !== matchedGroveId || session.worktreePath !== matchedWorktreePath) {
				this.sessionsService.updateSession(session.sessionId, {
					groveId: matchedGroveId,
					worktreePath: matchedWorktreePath,
				});
			}
		}
	}

	getGroveSessionCounts(groveId: string) {
		const sessions = this.sessionsService.getSessionsByGrove(groveId);
		return {
			active: sessions.filter((s) => s.status === 'active').length,
			idle: sessions.filter((s) => s.status === 'idle').length,
			attention: sessions.filter((s) => s.status === 'attention').length,
			total: sessions.length,
		};
	}

	async cleanupStale(thresholdMinutes = 60): Promise<number> {
		return this.sessionsService.cleanupStaleSessions(thresholdMinutes);
	}
}
