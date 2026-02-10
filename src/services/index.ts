/**
 * Services Module
 * Exports all services, interfaces, and tokens for DI
 */

// Service implementations
export { ClaudeSessionService } from './ClaudeSessionService.js';
export { ContextService } from './ContextService.js';
export { FileService } from './FileService.js';
export { GitService } from './GitService.js';
export { GroveService } from './GroveService.js';
export { SessionTrackingService, type ISessionTrackingService } from './SessionTrackingService.js';
export { WorkspaceService } from './WorkspaceService.js';
export { detectTerminal, openTerminalInPath } from './TerminalService.js';
export type { TerminalResult } from './TerminalService.js';
export {
	ALL_IDE_TYPES,
	detectAvailableIDEs,
	detectJetBrainsIDE,
	getDefaultIDEConfig,
	getEffectiveIDEConfig,
	getIDEDisplayName,
	isCommandAvailable,
	isValidIDEType,
	openIDEInPath,
	resolveIDEForPath,
} from './IDEService.js';
export type { IDEResult, ResolvedIDEConfig } from './IDEService.js';

// Service interfaces (co-located with implementations)
export type { IClaudeSessionService } from './ClaudeSessionService.js';
export type { IContextService } from './ContextService.js';
export type { IFileService } from './FileService.js';
export type { IGitService } from './GitService.js';
export type { IGroveService } from './GroveService.js';
export type { ILLMService } from './LLMService.js';
export type { IWorkspaceService } from './WorkspaceService.js';

// Storage service interfaces (co-located with implementations)
export type { IGroveConfigService } from '../storage/GroveConfigService.js';
export type { IGrovesService } from '../storage/GrovesService.js';
export type { IRecentSelectionsService } from '../storage/RecentSelectionsService.js';
export type { IRepositoryService } from '../storage/RepositoryService.js';
export type { ISettingsService } from '../storage/SettingsService.js';

// Shared data/result types
export type {
	BranchUpstreamStatus,
	ClaudeSessionResult,
	CloseGroveResult,
	CloseWorktreeResult,
	ContextData,
	CreateGroveResult,
	FileChangeStats,
	FileCopyResult,
	FileMatchResult,
	GitCommandResult,
	GroveNameGenerationResult,
	MergedGroveConfig,
	TemplateValidationResult,
	WorktreeInfo,
} from './types.js';

// Re-export ClaudeTerminalType from storage types for convenience
export type { ClaudeTerminalType } from '../storage/types.js';

// Service tokens
export {
	ClaudeSessionServiceToken,
	ContextServiceToken,
	FileServiceToken,
	GitServiceToken,
	GroveConfigServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
	RecentSelectionsServiceToken,
	RepositoryServiceToken,
	SessionsServiceToken,
	SessionTrackingServiceToken,
	SettingsServiceToken,
	WorkspaceServiceToken,
} from './tokens.js';

// Service registration
export { createServiceContainer, initializeServices, registerServices } from './registration.js';
