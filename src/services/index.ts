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

// Service interfaces
export type {
	ClaudeSessionResult,
	ClaudeTerminalType,
	CloseGroveResult,
	ContextData,
	CreateGroveResult,
	FileCopyResult,
	FileMatchResult,
	GitCommandResult,
	IClaudeSessionService,
	IContextService,
	IFileService,
	IGitService,
	IGroveConfigService,
	IGroveService,
	IGrovesService,
	IRepositoryService,
	ISettingsService,
	WorktreeInfo,
} from './interfaces.js';

// Service tokens
export {
	ClaudeSessionServiceToken,
	ContextServiceToken,
	FileServiceToken,
	GitServiceToken,
	GroveConfigServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
	RepositoryServiceToken,
	SettingsServiceToken,
} from './tokens.js';

// Service registration
export { createServiceContainer, initializeServices, registerServices } from './registration.js';
