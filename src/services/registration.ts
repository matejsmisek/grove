/**
 * Service Registration Module
 * Registers all services in the DI container with their dependencies
 */
import type { IMutableContainer } from '../di/index.js';
import { Container, getContainer } from '../di/index.js';
import {
	GroveConfigService,
	GrovesService,
	RepositoryService,
	SettingsService,
} from '../storage/index.js';
import { ContextService } from './ContextService.js';
import { FileService } from './FileService.js';
import { GitService } from './GitService.js';
import { GroveService } from './GroveService.js';
import {
	ContextServiceToken,
	FileServiceToken,
	GitServiceToken,
	GroveConfigServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
	RepositoryServiceToken,
	SettingsServiceToken,
} from './tokens.js';

/**
 * Register all services in the container
 * Services are registered as singletons by default
 *
 * Dependency graph:
 * - SettingsService: no dependencies
 * - RepositoryService: no dependencies
 * - GrovesService: no dependencies
 * - GroveConfigService: no dependencies
 * - GitService: no dependencies
 * - ContextService: no dependencies
 * - FileService: no dependencies
 * - GroveService: depends on all of the above
 *
 * @param container - Container to register services in (defaults to global container)
 */
export function registerServices(container?: IMutableContainer): void {
	const c = container ?? getContainer();

	// Register storage services (no dependencies)
	c.registerSingleton(SettingsServiceToken, () => new SettingsService());
	c.registerSingleton(RepositoryServiceToken, () => new RepositoryService());
	c.registerSingleton(GrovesServiceToken, () => new GrovesService());
	c.registerSingleton(GroveConfigServiceToken, () => new GroveConfigService());

	// Register utility services (no dependencies)
	c.registerSingleton(GitServiceToken, () => new GitService());
	c.registerSingleton(ContextServiceToken, () => new ContextService());
	c.registerSingleton(FileServiceToken, () => new FileService());

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
}

/**
 * Initialize the application services
 * This sets up the DI container and registers all services
 *
 * @param container - Optional container to use (defaults to global container)
 */
export function initializeServices(container?: IMutableContainer): void {
	registerServices(container);
}

/**
 * Create a new container with all services registered
 * Useful for testing or creating isolated service scopes
 *
 * @returns A new Container with all services registered
 */
export function createServiceContainer(): Container {
	const container = new Container();
	registerServices(container);
	return container;
}
