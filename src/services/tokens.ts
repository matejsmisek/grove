/**
 * Service Tokens for Dependency Injection
 * These tokens are used to register and resolve services from the container
 */
import { createToken } from '../di/index.js';
import type { IPluginRegistry } from '../plugins/types.js';
import type { IGroveConfigService } from '../storage/GroveConfigService.js';
import type { IGrovesService } from '../storage/GrovesService.js';
import type { IRecentSelectionsService } from '../storage/RecentSelectionsService.js';
import type { IRepositoryService } from '../storage/RepositoryService.js';
import type { ISessionsService } from '../storage/SessionsService.js';
import type { ISettingsService } from '../storage/SettingsService.js';
import type { IClaudeSessionService } from './ClaudeSessionService.js';
import type { IContextService } from './ContextService.js';
import type { IFileService } from './FileService.js';
import type { IGitService } from './GitService.js';
import type { IGroveService } from './GroveService.js';
import type { ILLMService } from './LLMService.js';
import type { ISessionTrackingService } from './SessionTrackingService.js';
import type { IWorkspaceService } from './WorkspaceService.js';

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
