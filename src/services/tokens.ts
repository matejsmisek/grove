/**
 * Service Tokens for Dependency Injection
 * These tokens are used to register and resolve services from the container
 */
import { createToken } from '../di/index.js';
import type {
	IClaudeSessionService,
	IContextService,
	IFileService,
	IGitService,
	IGroveConfigService,
	IGroveService,
	IGrovesService,
	IRepositoryService,
	ISettingsService,
} from './interfaces.js';

// Storage service tokens
export const SettingsServiceToken = createToken<ISettingsService>('SettingsService');
export const RepositoryServiceToken = createToken<IRepositoryService>('RepositoryService');
export const GrovesServiceToken = createToken<IGrovesService>('GrovesService');
export const GroveConfigServiceToken = createToken<IGroveConfigService>('GroveConfigService');

// Other service tokens
export const GitServiceToken = createToken<IGitService>('GitService');
export const ContextServiceToken = createToken<IContextService>('ContextService');
export const FileServiceToken = createToken<IFileService>('FileService');
export const GroveServiceToken = createToken<IGroveService>('GroveService');
export const ClaudeSessionServiceToken = createToken<IClaudeSessionService>('ClaudeSessionService');
