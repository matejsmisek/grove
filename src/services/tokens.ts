/**
 * Service Tokens for Dependency Injection
 * These tokens are used to register and resolve services from the container
 */
import { createToken } from '../di/index.js';
import type { AsanaPlugin } from '../plugins/asana/index.js';
import type { GitLabPlugin } from '../plugins/gitlab/index.js';
import type { IGroveConfigService } from '../storage/GroveConfigService.js';
import type { IGrovesService } from '../storage/GrovesService.js';
import type { IRecentSelectionsService } from '../storage/RecentSelectionsService.js';
import type { IRepositoryService } from '../storage/RepositoryService.js';
import type { ISessionsService } from '../storage/SessionsService.js';
import type { ISettingsService } from '../storage/SettingsService.js';
import type { IBackgroundSessionService } from './BackgroundSessionService.js';
import type { IClaudeSessionService } from './ClaudeSessionService.js';
import type { IContextService } from './ContextService.js';
import type { IFileService } from './FileService.js';
import type { IGitService } from './GitService.js';
import type { IGroveService } from './GroveService.js';
import type { ILLMService } from './LLMService.js';
import type { ISessionLauncherService } from './SessionLauncherService.js';
import type { ISessionTemplateService } from './SessionTemplateService.js';
import type { ISessionTrackingService } from './SessionTrackingService.js';
import type { ITaskService } from './TaskService.js';
import type { IUpdateService } from './UpdateService.js';
import type { IWorkspaceService } from './WorkspaceService.js';
import type { IWorktreeSetupService } from './WorktreeSetupService.js';

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
export const WorktreeSetupServiceToken = createToken<IWorktreeSetupService>('WorktreeSetupService');
export const ClaudeSessionServiceToken = createToken<IClaudeSessionService>('ClaudeSessionService');
export const SessionTemplateServiceToken =
	createToken<ISessionTemplateService>('SessionTemplateService');
export const SessionLauncherServiceToken =
	createToken<ISessionLauncherService>('SessionLauncherService');
export const BackgroundSessionServiceToken = createToken<IBackgroundSessionService>(
	'BackgroundSessionService'
);
export const LLMServiceToken = createToken<ILLMService>('LLMService');
export const WorkspaceServiceToken = createToken<IWorkspaceService>('WorkspaceService');
export const SessionTrackingServiceToken =
	createToken<ISessionTrackingService>('SessionTrackingService');
export const TaskServiceToken = createToken<ITaskService>('TaskService');
export const UpdateServiceToken = createToken<IUpdateService>('UpdateService');

// Plugin system tokens
export const GitLabPluginToken = createToken<GitLabPlugin>('GitLabPlugin');
export const AsanaPluginToken = createToken<AsanaPlugin>('AsanaPlugin');
