/**
 * Service Tokens for Dependency Injection
 * These tokens are used to register and resolve services from the container
 */
import { createToken } from '../di/index.js';
import type { IPluginRegistry } from '../plugins/types.js';
import type { ISessionsService } from '../storage/SessionsService.js';
import type { ISessionTrackingService } from './SessionTrackingService.js';
import type {
	IClaudeSessionService,
	IContextService,
	IFileService,
	IGitService,
	IGroveConfigService,
	IGroveService,
	IGrovesService,
	ILLMService,
	IRecentSelectionsService,
	IRepositoryService,
	ISettingsService,
	IWorkspaceService,
} from './interfaces.js';

// Storage service tokens
export const SettingsServiceToken = createToken<ISettingsService>('SettingsService');
export const RepositoryServiceToken = createToken<IRepositoryService>('RepositoryService');
export const GrovesServiceToken = createToken<IGrovesService>('GrovesService');
export const GroveConfigServiceToken = createToken<IGroveConfigService>('GroveConfigService');
export const SessionsServiceToken = createToken<ISessionsService>('SessionsService');
export const RecentSelectionsServiceToken =
	createToken<IRecentSelectionsService>('RecentSelectionsService');

// Other service tokens
export const GitServiceToken = createToken<IGitService>('GitService');
export const ContextServiceToken = createToken<IContextService>('ContextService');
export const FileServiceToken = createToken<IFileService>('FileService');
export const GroveServiceToken = createToken<IGroveService>('GroveService');
export const ClaudeSessionServiceToken = createToken<IClaudeSessionService>('ClaudeSessionService');
export const LLMServiceToken = createToken<ILLMService>('LLMService');
export const WorkspaceServiceToken = createToken<IWorkspaceService>('WorkspaceService');
export const SessionTrackingServiceToken =
	createToken<ISessionTrackingService>('SessionTrackingService');

// Plugin system tokens
export const PluginRegistryToken = createToken<IPluginRegistry>('PluginRegistry');
