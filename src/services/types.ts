import type {
	FileCopyPatternEntry,
	GroveIDEConfig,
	GroveMetadata,
	Repository,
} from '../storage/types.js';

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
 * File change statistics from git status
 */
export interface FileChangeStats {
	modified: number;
	added: number;
	deleted: number;
	untracked: number;
	total: number;
}

/**
 * Branch upstream status
 * - 'active': Branch has an active upstream that exists
 * - 'gone': Branch had an upstream that no longer exists (merged and deleted)
 * - 'none': Branch has no upstream configured
 */
export type BranchUpstreamStatus = 'active' | 'gone' | 'none';

/**
 * Result of a file copy operation
 */
export interface FileCopyResult {
	success: boolean;
	copiedFiles: string[];
	linkedFiles: string[];
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
	metadata?: GroveMetadata;
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
 * Result of closing a single worktree
 */
export interface CloseWorktreeResult {
	success: boolean;
	errors: string[];
	message?: string;
}

/**
 * Claude session result
 */
export interface ClaudeSessionResult {
	success: boolean;
	message: string;
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

/**
 * Merged configuration for a repository selection
 * Contains both root and project configs merged together
 */
export interface MergedGroveConfig {
	/** Final branch name template (project overrides root) */
	branchNameTemplate?: string;
	/** File patterns from root config (to copy from repo root) */
	rootFileCopyPatterns: FileCopyPatternEntry[];
	/** File patterns from project config (to copy from project folder) */
	projectFileCopyPatterns: FileCopyPatternEntry[];
	/** Init actions from root config */
	rootInitActions: string[];
	/** Init actions from project config */
	projectInitActions: string[];
	/**
	 * IDE configuration (project overrides root)
	 * Can be a reference like "@phpstorm" or a custom config
	 */
	ide?: GroveIDEConfig;
}

/**
 * Validation result for template variables
 */
export interface TemplateValidationResult {
	valid: boolean;
	invalidVars: string[];
	missingRequired: string[];
}

/**
 * Result from LLM grove name generation
 */
export interface GroveNameGenerationResult {
	/** The generated grove name (human-readable) */
	name: string;
	/** Suggested normalized version (may be empty if no suggestion) */
	normalizedSuggestion?: string;
}
