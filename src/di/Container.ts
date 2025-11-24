/**
 * Dependency Injection Container
 * A simple but powerful IoC container for managing service dependencies
 */
import type {
	IMutableContainer,
	ServiceFactory,
	ServiceRegistration,
	ServiceToken,
} from './types.js';

interface InternalRegistration<T> {
	factory: ServiceFactory<T>;
	singleton: boolean;
	instance?: T;
}

/**
 * Dependency Injection Container implementation
 */
export class Container implements IMutableContainer {
	private registrations = new Map<symbol, InternalRegistration<unknown>>();
	private resolving = new Set<symbol>();

	/**
	 * Register a service with full options
	 */
	register<T>(registration: ServiceRegistration<T>): void {
		this.registrations.set(registration.token.id, {
			factory: registration.factory as ServiceFactory<unknown>,
			singleton: registration.singleton ?? false,
		});
	}

	/**
	 * Register a singleton service (created once, reused)
	 */
	registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
		this.register({ token, factory, singleton: true });
	}

	/**
	 * Register a transient service (new instance each resolution)
	 */
	registerTransient<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
		this.register({ token, factory, singleton: false });
	}

	/**
	 * Register a pre-created instance
	 */
	registerInstance<T>(token: ServiceToken<T>, instance: T): void {
		this.registrations.set(token.id, {
			factory: () => instance,
			singleton: true,
			instance,
		});
	}

	/**
	 * Check if a service is registered
	 */
	has<T>(token: ServiceToken<T>): boolean {
		return this.registrations.has(token.id);
	}

	/**
	 * Resolve a service by its token
	 * @throws Error if service not found or circular dependency detected
	 */
	resolve<T>(token: ServiceToken<T>): T {
		const registration = this.registrations.get(token.id);

		if (!registration) {
			throw new Error(`Service not registered: ${token.name}`);
		}

		// Check for circular dependencies
		if (this.resolving.has(token.id)) {
			throw new Error(`Circular dependency detected for service: ${token.name}`);
		}

		// Return cached instance for singletons
		if (registration.singleton && registration.instance !== undefined) {
			return registration.instance as T;
		}

		// Track resolution to detect circular dependencies
		this.resolving.add(token.id);

		try {
			const instance = registration.factory(this) as T;

			// Cache singleton instances
			if (registration.singleton) {
				registration.instance = instance;
			}

			return instance;
		} finally {
			this.resolving.delete(token.id);
		}
	}

	/**
	 * Clear all registrations (useful for testing)
	 */
	clear(): void {
		this.registrations.clear();
		this.resolving.clear();
	}

	/**
	 * Create a child container that inherits from this container
	 * Child can override registrations without affecting parent
	 */
	createChild(): Container {
		const child = new Container();
		// Copy registrations (shallow - singletons still shared)
		for (const [key, value] of this.registrations) {
			child.registrations.set(key, { ...value });
		}
		return child;
	}
}

/**
 * Global container instance
 * Use this for application-wide services
 */
let globalContainer: Container | null = null;

/**
 * Get the global container instance
 * Creates one if it doesn't exist
 */
export function getContainer(): Container {
	if (!globalContainer) {
		globalContainer = new Container();
	}
	return globalContainer;
}

/**
 * Set a custom global container (useful for testing)
 */
export function setContainer(container: Container | null): void {
	globalContainer = container;
}

/**
 * Reset the global container (useful for testing)
 */
export function resetContainer(): void {
	globalContainer = null;
}
