/**
 * Result of repository registration command
 */
export interface RegisterResult {
	success: boolean;
	message: string;
	path?: string;
}

/**
 * Result of workspace initialization command
 */
export interface WorkspaceInitResult {
	success: boolean;
	message: string;
	workspacePath?: string;
	grovesFolder?: string;
}
