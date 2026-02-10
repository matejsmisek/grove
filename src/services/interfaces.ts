/**
 * Service Interfaces - Barrel Re-export
 *
 * Interfaces are now co-located with their implementations.
 * This file re-exports everything for backward compatibility.
 *
 * Prefer importing directly from the implementation files:
 *   import type { IGitService } from './GitService.js';
 *   import type { ISettingsService } from '../storage/SettingsService.js';
 *
 * Shared data/result types live in ./types.ts:
 *   import type { GitCommandResult, FileChangeStats } from './types.js';
 */

// Storage service interfaces
export type { ISettingsService } from '../storage/SettingsService.js';
export type { IRepositoryService } from '../storage/RepositoryService.js';
export type { IGrovesService } from '../storage/GrovesService.js';
export type { IGroveConfigService } from '../storage/GroveConfigService.js';
export type { IRecentSelectionsService } from '../storage/RecentSelectionsService.js';

// Service interfaces
export type { IGitService } from './GitService.js';
export type { IContextService } from './ContextService.js';
export type { IFileService } from './FileService.js';
export type { IGroveService } from './GroveService.js';
export type { IClaudeSessionService } from './ClaudeSessionService.js';
export type { ILLMService } from './LLMService.js';
export type { IWorkspaceService } from './WorkspaceService.js';

// Shared data/result types
export type {
	BranchUpstreamStatus,
	ClaudeSessionResult,
	CloseGroveResult,
	CloseWorktreeResult,
	ContextData,
	CreateGroveResult,
	FileCopyResult,
	FileChangeStats,
	FileMatchResult,
	GitCommandResult,
	GroveNameGenerationResult,
	MergedGroveConfig,
	TemplateValidationResult,
	WorktreeInfo,
} from './types.js';
