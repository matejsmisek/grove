/**
 * Service Registration Module
 * Registers all services in the DI container with their dependencies
 */
import { AdapterRegistry, ClaudeAdapter } from '../agents/index.js';
import type { IMutableContainer } from '../di/index.js';
import { Container, getContainer } from '../di/index.js';
import { AsanaPlugin } from '../plugins/asana/index.js';
import { PluginRegistry } from '../plugins/index.js';
import {
	GroveConfigService,
	GrovesService,
	RecentSelectionsService,
	RepositoryService,
	SessionsService,
	SettingsService,
} from '../storage/index.js';
import type { WorkspaceContext } from '../storage/types.js';
import { ClaudeSessionService } from './ClaudeSessionService.js';
import { ContextService } from './ContextService.js';
import { FileService } from './FileService.js';
import { GitService } from './GitService.js';
import { GroveService } from './GroveService.js';
import { LLMService } from './LLMService.js';
import { SessionTrackingService } from './SessionTrackingService.js';
import { WorkspaceService } from './WorkspaceService.js';
import {
	ClaudeSessionServiceToken,
	ContextServiceToken,
	FileServiceToken,
	GitServiceToken,
	GroveConfigServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
	LLMServiceToken,
	PluginRegistryToken,
	RecentSelectionsServiceToken,
	RepositoryServiceToken,
	SessionTrackingServiceToken,
	SessionsServiceToken,
	SettingsServiceToken,
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
 * - ClaudeSessionService: depends on SettingsService, GroveConfigService
 * - LLMService: depends on SettingsService
 * - GroveService: depends on SettingsService, GrovesService, GroveConfigService, GitService, ContextService, FileService
 * - SessionTrackingService: depends on SessionsService, GrovesService, AdapterRegistry (ClaudeAdapter)
 * - PluginRegistry: depends on SettingsService (registers AsanaPlugin)
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

	// ClaudeSessionService depends on SettingsService and GroveConfigService
	c.registerSingleton(
		ClaudeSessionServiceToken,
		(cont) =>
			new ClaudeSessionService(
				cont.resolve(SettingsServiceToken),
				cont.resolve(GroveConfigServiceToken)
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

	// PluginRegistry depends on SettingsService
	c.registerSingleton(PluginRegistryToken, (cont) => {
		const pluginRegistry = new PluginRegistry(cont.resolve(SettingsServiceToken));
		// Register available plugins
		pluginRegistry.register(new AsanaPlugin());
		// Future: Add more plugins here
		return pluginRegistry;
	});
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
