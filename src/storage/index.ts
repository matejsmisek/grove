export {
	getDefaultSettings,
	getStorageConfig,
	initializeStorage,
	readSettings,
	updateSettings,
	writeSettings,
} from './storage.js';
export {
	addRepository,
	getAllRepositories,
	getDefaultRepositories,
	isRepositoryRegistered,
	readRepositories,
	removeRepository,
	updateRepository,
	writeRepositories,
} from './repositories.js';
export {
	addGroveToIndex,
	addWorktreeToGrove,
	deleteGrove,
	getAllGroves,
	getGroveById,
	readGroveMetadata,
	removeGroveFromIndex,
	updateGroveInIndex,
	writeGroveMetadata,
} from './groves.js';
export {
	applyBranchNameTemplate,
	getBranchNameForRepo,
	readGroveRepoConfig,
	validateBranchNameTemplate,
} from './groveConfig.js';
export {
	addRecentSelections,
	getRecentSelectionDisplayName,
	getRecentSelections,
} from './recentSelections.js';
export type {
	ClaudeSessionTemplate,
	ClaudeSessionTemplates,
	ClaudeTerminalType,
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
	Settings,
	StorageConfig,
	TerminalConfig,
	Worktree,
} from './types.js';

// Service class exports (for DI)
export { SettingsService } from './SettingsService.js';
export { RepositoryService } from './RepositoryService.js';
export { GrovesService } from './GrovesService.js';
export { GroveConfigService } from './GroveConfigService.js';
