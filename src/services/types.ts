import type { Repository } from '../storage/types.js';

/**
 * Result of a git command execution
 */
export interface GitCommandResult {
	success: boolean;
	stdout: string;
	stderr: string;
	exitCode: number | null;
}

/**
 * Parsed information about a git worktree
 */
export interface WorktreeInfo {
	path: string;
	branch: string;
	commit: string;
}

/**
 * Result of a file copy operation
 */
export interface FileCopyResult {
	success: boolean;
	copiedFiles: string[];
	errors: string[];
}

/**
 * Result of a pattern matching operation
 */
export interface FileMatchResult {
	pattern: string;
	matches: string[];
}

/**
 * Result of grove creation operation
 */
export interface CreateGroveResult {
	success: boolean;
	metadata?: import('../storage/types.js').GroveMetadata;
	errors: string[];
}

/**
 * Result of grove closing operation
 */
export interface CloseGroveResult {
	success: boolean;
	errors: string[];
	message?: string;
}

/**
 * Data for creating/reading a grove context file
 */
export interface ContextData {
	name: string;
	createdAt: string;
	purpose?: string;
	repositories: Repository[];
	notes?: string;
}
