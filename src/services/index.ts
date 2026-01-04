/**
 * Services Module
 * Exports all services, interfaces, and tokens for DI
 */

// Service implementations
export { ContextService } from './ContextService.js';
export { FileService } from './FileService.js';
export { GitService } from './GitService.js';
export { GroveService } from './GroveService.js';
export { detectTerminal, openTerminalInPath } from './TerminalService.js';
export type { TerminalResult } from './TerminalService.js';

// Service interfaces
export type {
	CloseGroveResult,
	ContextData,
	CreateGroveResult,
	FileCopyResult,
	FileMatchResult,
	GitCommandResult,
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
