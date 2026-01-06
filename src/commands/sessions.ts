import { ISessionsService } from '../storage/SessionsService.js';
import { AgentType } from '../storage/types.js';

export interface SessionCommandResult {
	success: boolean;
	message: string;
}

/**
 * Handle session-start command from hooks
 */
export async function handleSessionStart(
	sessionsService: ISessionsService,
	options: {
		sessionId: string;
		cwd: string;
		agentType: AgentType;
		metadata?: Record<string, unknown>;
	},
): Promise<SessionCommandResult> {
	try {
		sessionsService.addSession({
			sessionId: options.sessionId,
			agentType: options.agentType,
			groveId: null, // Will be mapped later by SessionTrackingService
			workspacePath: options.cwd,
			worktreePath: null,
			status: 'active',
			isRunning: true,
			lastUpdate: new Date().toISOString(),
			metadata: options.metadata,
		});

		return {
			success: true,
			message: `${options.agentType} session ${options.sessionId} started`,
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to start session: ${error instanceof Error ? error.message : 'Unknown error'}`,
		};
	}
}

/**
 * Handle session-idle command (Stop hook)
 */
export async function handleSessionIdle(
	sessionsService: ISessionsService,
	sessionId: string,
): Promise<SessionCommandResult> {
	try {
		const updated = sessionsService.updateSession(sessionId, {
			status: 'idle',
		});

		if (!updated) {
			return {
				success: false,
				message: `Session ${sessionId} not found`,
			};
		}

		return {
			success: true,
			message: `Session ${sessionId} is now idle`,
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update session: ${error instanceof Error ? error.message : 'Unknown error'}`,
		};
	}
}

/**
 * Handle session-attention command (Notification hook)
 */
export async function handleSessionAttention(
	sessionsService: ISessionsService,
	sessionId: string,
): Promise<SessionCommandResult> {
	try {
		const updated = sessionsService.updateSession(sessionId, {
			status: 'attention',
		});

		if (!updated) {
			return {
				success: false,
				message: `Session ${sessionId} not found`,
			};
		}

		return {
			success: true,
			message: `Session ${sessionId} needs attention`,
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to update session: ${error instanceof Error ? error.message : 'Unknown error'}`,
		};
	}
}

/**
 * Handle session-end command (SessionEnd hook)
 */
export async function handleSessionEnd(
	sessionsService: ISessionsService,
	sessionId: string,
): Promise<SessionCommandResult> {
	try {
		const updated = sessionsService.updateSession(sessionId, {
			status: 'finished',
			isRunning: false,
		});

		if (!updated) {
			return {
				success: false,
				message: `Session ${sessionId} not found`,
			};
		}

		return {
			success: true,
			message: `Session ${sessionId} ended`,
		};
	} catch (error) {
		return {
			success: false,
			message: `Failed to end session: ${error instanceof Error ? error.message : 'Unknown error'}`,
		};
	}
}
