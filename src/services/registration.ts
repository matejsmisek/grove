/**
 * Service Registration Module
 * Registers all services in the DI container with their dependencies
 */
import { AdapterRegistry, ClaudeAdapter } from '../agents/index.js';
import type { IMutableContainer } from '../di/index.js';
import { Container, getContainer } from '../di/index.js';
import { AsanaPlugin } from '../plugins/asana/index.js';
import type { AsanaPluginSettings } from '../plugins/asana/index.js';
import { GitLabPlugin } from '../plugins/gitlab/index.js';
import {
	GroveConfigService,
	GrovesService,
	RecentSelectionsService,
	RepositoryService,
	SessionsService,
	SettingsService,
} from '../storage/index.js';
import type { WorkspaceContext } from '../storage/types.js';
import { detectDirenvAvailable } from '../utils/direnv.js';
import { ClaudeSessionService } from './ClaudeSessionService.js';
import { ContextService } from './ContextService.js';
import { FileService } from './FileService.js';
import { GitService } from './GitService.js';
import { GroveService } from './GroveService.js';
import { LLMService } from './LLMService.js';
import { SessionTrackingService } from './SessionTrackingService.js';
import { TaskService } from './TaskService.js';
import { WorkspaceService } from './WorkspaceService.js';
import {
	AsanaPluginToken,
	ClaudeSessionServiceToken,
	ContextServiceToken,
	FileServiceToken,
	GitLabPluginToken,
	GitServiceToken,
	GroveConfigServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
	LLMServiceToken,
	RecentSelectionsServiceToken,
	RepositoryServiceToken,
	SessionTrackingServiceToken,
	SessionsServiceToken,
	SettingsServiceToken,
	TaskServiceToken,
	WorkspaceServiceToken,
} from './tokens.js';

/**
 * Register all services in the container
 * Services are registered as singletons by default
 *
 * Dependency graph:
 * - WorkspaceService: no dependencies
 * - SettingsService: optional workspace context
 * - RepositoryService: depends on SettingsService
 * - GrovesService: depends on SettingsService
 * - GroveConfigService: no dependencies
 * - RecentSelectionsService: depends on SettingsService
 * - SessionsService: depends on SettingsService (for sessions path)
 * - GitService: no dependencies
 * - ContextService: no dependencies
 * - FileService: no dependencies
 * - TaskService: no dependencies
 * - ClaudeSessionService: depends on SettingsService, GroveConfigService
 * - LLMService: depends on SettingsService
 * - GroveService: depends on SettingsService, GrovesService, GroveConfigService, GitService, ContextService, FileService
 * - SessionTrackingService: depends on SessionsService, GrovesService, AdapterRegistry (ClaudeAdapter)
 * - AsanaPlugin / GitLabPlugin: depend on SettingsService for persisted enablement/config
 *
 * @param container - Container to register services in (defaults to global container)
 * @param workspaceContext - Optional workspace context to use for storage paths
 */
export function registerServices(
	container?: IMutableContainer,
	workspaceContext?: WorkspaceContext
): void {
	const c = container ?? getContainer();

	// Register workspace service (no dependencies)
	c.registerSingleton(WorkspaceServiceToken, () => new WorkspaceService());

	// Register storage services
	// SettingsService with optional workspace context
	c.registerSingleton(SettingsServiceToken, () => new SettingsService(workspaceContext));

	// RepositoryService depends on SettingsService
	c.registerSingleton(
		RepositoryServiceToken,
		(cont) => new RepositoryService(cont.resolve(SettingsServiceToken))
	);

	// GrovesService depends on SettingsService
	c.registerSingleton(
		GrovesServiceToken,
		(cont) => new GrovesService(cont.resolve(SettingsServiceToken))
	);

	// GroveConfigService has no dependencies
	c.registerSingleton(GroveConfigServiceToken, () => new GroveConfigService());

	// RecentSelectionsService depends on SettingsService
	c.registerSingleton(
		RecentSelectionsServiceToken,
		(cont) => new RecentSelectionsService(cont.resolve(SettingsServiceToken))
	);

	// SessionsService depends on SettingsService (for sessions path)
	c.registerSingleton(SessionsServiceToken, (cont) => {
		const settingsService = cont.resolve(SettingsServiceToken);
		const config = settingsService.getStorageConfig();
		return new SessionsService({ sessionsPath: config.sessionsPath });
	});

	// Register utility services (no dependencies)
	c.registerSingleton(GitServiceToken, () => new GitService());
	c.registerSingleton(ContextServiceToken, () => new ContextService());
	c.registerSingleton(FileServiceToken, () => new FileService());

	// TaskService manages background jobs (no dependencies)
	c.registerSingleton(TaskServiceToken, () => new TaskService());

	// ClaudeSessionService depends on SettingsService, GroveConfigService and
	// SessionsService (the hook-populated registry it reconciles against).
	c.registerSingleton(
		ClaudeSessionServiceToken,
		(cont) =>
			new ClaudeSessionService(
				cont.resolve(SettingsServiceToken),
				cont.resolve(GroveConfigServiceToken),
				cont.resolve(SessionsServiceToken)
			)
	);

	// LLMService depends on SettingsService
	c.registerSingleton(LLMServiceToken, (cont) => new LLMService(cont.resolve(SettingsServiceToken)));

	// Register GroveService with all its dependencies
	c.registerSingleton(
		GroveServiceToken,
		(cont) =>
			new GroveService(
				cont.resolve(SettingsServiceToken),
				cont.resolve(GrovesServiceToken),
				cont.resolve(GroveConfigServiceToken),
				cont.resolve(GitServiceToken),
				cont.resolve(ContextServiceToken),
				cont.resolve(FileServiceToken)
			)
	);

	// SessionTrackingService depends on SessionsService, GrovesService, and AdapterRegistry
	c.registerSingleton(SessionTrackingServiceToken, (cont) => {
		// Create and configure adapter registry
		const adapterRegistry = new AdapterRegistry();
		adapterRegistry.register(new ClaudeAdapter());
		// Future: Add more adapters here (Gemini, Codex, etc.)

		return new SessionTrackingService(
			cont.resolve(SessionsServiceToken),
			cont.resolve(GrovesServiceToken),
			adapterRegistry
		);
	});

	// Plugins depend on SettingsService for their persisted enablement/config.
	c.registerSingleton(AsanaPluginToken, (cont) => {
		const asanaPlugin = new AsanaPlugin(cont.resolve(SettingsServiceToken));
		// Hydrate the instance with its persisted, plugin-specific settings so it
		// reflects what the user configured (e.g. the Asana prompt template).
		const asanaConfig = asanaPlugin.getConfig();
		if (asanaConfig?.settings) {
			asanaPlugin.configure(asanaConfig.settings as AsanaPluginSettings);
		}
		return asanaPlugin;
	});
	c.registerSingleton(
		GitLabPluginToken,
		(cont) => new GitLabPlugin(cont.resolve(SettingsServiceToken))
	);
}

/**
 * Initialize the application services
 * This sets up the DI container and registers all services
 *
 * @param container - Optional container to use (defaults to global container)
 * @param workspaceContext - Optional workspace context to use for storage paths
 */
export function initializeServices(
	container?: IMutableContainer,
	workspaceContext?: WorkspaceContext
): void {
	registerServices(container, workspaceContext);
	// Probe for direnv once at startup so its availability is detected at an
	// explicit point in the lifecycle rather than lazily on first use.
	detectDirenvAvailable();
}

/**
 * Create a new container with all services registered
 * Useful for testing or creating isolated service scopes
 *
 * @param workspaceContext - Optional workspace context to use for storage paths
 * @returns A new Container with all services registered
 */
export function createServiceContainer(workspaceContext?: WorkspaceContext): Container {
	const container = new Container();
	registerServices(container, workspaceContext);
	return container;
}
