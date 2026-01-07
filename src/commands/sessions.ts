import fs from 'fs';
import os from 'os';
import path from 'path';

import { ISessionsService } from '../storage/SessionsService.js';
import { AgentType } from '../storage/types.js';

export interface SessionCommandResult {
	success: boolean;
	message: string;
}

/**
 * Hook event data received on stdin from Claude Code
 */
export interface HookEventData {
	session_id: string;
	transcript_path?: string;
	cwd?: string;
	permission_mode?: string;
	hook_event_name: string;
	source?: string;
	reason?: string;
}

/**
 * Read JSON data from stdin
 */
export async function readStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		let data = '';

		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (chunk) => {
			data += chunk;
		});
		process.stdin.on('end', () => {
			resolve(data);
		});
		process.stdin.on('error', (err) => {
			reject(err);
		});

		// Handle case where stdin is empty or not connected
		if (process.stdin.isTTY) {
			resolve('');
		}
	});
}

/**
 * Log hook events to file for debugging
 */
function logHookEvent(event: string, data: Record<string, unknown>): void {
	try {
		const groveDir = path.join(os.homedir(), '.grove');
		const logFile = path.join(groveDir, 'hooks.log');
		const timestamp = new Date().toISOString();
		const logEntry = `[${timestamp}] ${event}: ${JSON.stringify(data)}\n`;

		fs.appendFileSync(logFile, logEntry);
	} catch {
		// Silent fail - don't block hook execution
	}
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
	}
): Promise<SessionCommandResult> {
	logHookEvent('session-start', {
		sessionId: options.sessionId,
		cwd: options.cwd,
		agentType: options.agentType,
		metadata: options.metadata,
	});

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

		logHookEvent('session-start-success', { sessionId: options.sessionId });

		return {
			success: true,
			message: `${options.agentType} session ${options.sessionId} started`,
		};
	} catch (error) {
		logHookEvent('session-start-error', {
			sessionId: options.sessionId,
			error: error instanceof Error ? error.message : 'Unknown error',
		});

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
	sessionId: string
): Promise<SessionCommandResult> {
	logHookEvent('session-idle', { sessionId });

	try {
		const updated = sessionsService.updateSession(sessionId, {
			status: 'idle',
		});

		if (!updated) {
			logHookEvent('session-idle-not-found', { sessionId });
			return {
				success: false,
				message: `Session ${sessionId} not found`,
			};
		}

		logHookEvent('session-idle-success', { sessionId });

		return {
			success: true,
			message: `Session ${sessionId} is now idle`,
		};
	} catch (error) {
		logHookEvent('session-idle-error', {
			sessionId,
			error: error instanceof Error ? error.message : 'Unknown error',
		});

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
	sessionId: string
): Promise<SessionCommandResult> {
	logHookEvent('session-attention', { sessionId });

	try {
		const updated = sessionsService.updateSession(sessionId, {
			status: 'attention',
		});

		if (!updated) {
			logHookEvent('session-attention-not-found', { sessionId });
			return {
				success: false,
				message: `Session ${sessionId} not found`,
			};
		}

		logHookEvent('session-attention-success', { sessionId });

		return {
			success: true,
			message: `Session ${sessionId} needs attention`,
		};
	} catch (error) {
		logHookEvent('session-attention-error', {
			sessionId,
			error: error instanceof Error ? error.message : 'Unknown error',
		});

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
	sessionId: string
): Promise<SessionCommandResult> {
	logHookEvent('session-end', { sessionId });

	try {
		const updated = sessionsService.updateSession(sessionId, {
			status: 'closed',
			isRunning: false,
		});

		if (!updated) {
			logHookEvent('session-end-not-found', { sessionId });
			return {
				success: false,
				message: `Session ${sessionId} not found`,
			};
		}

		logHookEvent('session-end-success', { sessionId });

		return {
			success: true,
			message: `Session ${sessionId} ended`,
		};
	} catch (error) {
		logHookEvent('session-end-error', {
			sessionId,
			error: error instanceof Error ? error.message : 'Unknown error',
		});

		return {
			success: false,
			message: `Failed to end session: ${error instanceof Error ? error.message : 'Unknown error'}`,
		};
	}
}

/**
 * Handle unified session-hook command that reads JSON from stdin
 * Routes to appropriate handler based on hook_event_name
 */
export async function handleSessionHook(
	sessionsService: ISessionsService,
	agentType: AgentType
): Promise<SessionCommandResult> {
	try {
		// Read JSON from stdin
		const stdinData = await readStdin();

		if (!stdinData.trim()) {
			logHookEvent('session-hook-empty-stdin', { agentType });
			return {
				success: false,
				message: 'No data received on stdin',
			};
		}

		// Parse JSON
		let hookData: HookEventData;
		try {
			hookData = JSON.parse(stdinData) as HookEventData;
		} catch {
			logHookEvent('session-hook-parse-error', { agentType, stdinData });
			return {
				success: false,
				message: 'Failed to parse stdin JSON',
			};
		}

		logHookEvent('session-hook-received', {
			agentType,
			hookEventName: hookData.hook_event_name,
			sessionId: hookData.session_id,
			cwd: hookData.cwd,
		});

		// Route to appropriate handler based on hook_event_name
		switch (hookData.hook_event_name) {
			case 'SessionStart':
				return handleSessionStart(sessionsService, {
					sessionId: hookData.session_id,
					cwd: hookData.cwd || process.cwd(),
					agentType,
					metadata: {
						transcriptPath: hookData.transcript_path,
						permissionMode: hookData.permission_mode,
						source: hookData.source,
					},
				});

			case 'Stop':
				return handleSessionIdle(sessionsService, hookData.session_id);

			case 'Notification':
				return handleSessionAttention(sessionsService, hookData.session_id);

			case 'SessionEnd':
				return handleSessionEnd(sessionsService, hookData.session_id);

			default:
				logHookEvent('session-hook-unknown-event', {
					hookEventName: hookData.hook_event_name,
					sessionId: hookData.session_id,
				});
				return {
					success: false,
					message: `Unknown hook event: ${hookData.hook_event_name}`,
				};
		}
	} catch (error) {
		logHookEvent('session-hook-error', {
			agentType,
			error: error instanceof Error ? error.message : 'Unknown error',
		});

		return {
			success: false,
			message: `Hook handler error: ${error instanceof Error ? error.message : 'Unknown error'}`,
		};
	}
}
