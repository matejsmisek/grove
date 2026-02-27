export type {
	AgentSession,
	AgentType,
	ClaudeSessionTemplate,
	ClaudeSessionTemplates,
	ClaudeTerminalType,
	FileCopyMode,
	FileCopyPatternEntry,
	GroveMetadata,
	GroveReference,
	GroveRepoConfig,
	GrovesIndex,
	IDEConfig,
	IDEConfigs,
	IDEType,
	RecentSelection,
	RecentSelectionsData,
	Repository,
	RepositoriesData,
	RepositorySelection,
	SessionsData,
	SessionsIndex,
	SessionStatus,
	Settings,
	StorageConfig,
	TerminalConfig,
	WorkspaceConfig,
	WorkspaceContext,
	WorkspaceReference,
	WorkspacesData,
	Worktree,
} from './types.js';

// Generic JSON storage
export { JsonStore, type JsonStoreOptions } from './JsonStore.js';

// Service class exports (for DI) and co-located interfaces
export { SettingsService, type ISettingsService } from './SettingsService.js';
export { RepositoryService, type IRepositoryService } from './RepositoryService.js';
export { GrovesService, type IGrovesService } from './GrovesService.js';
export {
	GroveConfigService,
	getPatternString,
	type IGroveConfigService,
} from './GroveConfigService.js';
export { SessionsService, type ISessionsService } from './SessionsService.js';
export {
	RecentSelectionsService,
	type IRecentSelectionsService,
} from './RecentSelectionsService.js';
