import { AgentSession, SessionStatus, AgentType } from '../storage/types.js';

/**
 * Generic agent adapter interface
 * Each AI agent implements this to provide agent-specific detection logic
 */
export interface IAgentAdapter {
	readonly agentType: AgentType;

	/**
	 * Detect all running sessions for this agent
	 * Returns list of detected sessions
	 */
	detectSessions(): Promise<AgentSession[]>;

	/**
	 * Verify if a specific session is still running
	 * Returns updated session or null if not found
	 */
	verifySession(sessionId: string): Promise<AgentSession | null>;

	/**
	 * Get detailed status for a session
	 */
	getSessionStatus(sessionId: string): Promise<SessionStatus | null>;

	/**
	 * Check if this adapter is available/installed
	 */
	isAvailable(): Promise<boolean>;
}

/**
 * Result of session detection/update operation
 */
export interface SessionUpdateResult {
	added: number;
	updated: number;
	removed: number;
	errors: string[];
}
