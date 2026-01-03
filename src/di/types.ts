/**
 * DI Container Types
 * Provides type-safe dependency injection infrastructure
 */

/**
 * Service token for type-safe service resolution
 * Using a branded type pattern for type safety
 */
export interface ServiceToken<T> {
	readonly _brand: T;
	readonly id: symbol;
	readonly name: string;
}

/**
 * Create a service token for type-safe DI
 * @param name - Human readable name for the service
 */
export function createToken<T>(name: string): ServiceToken<T> {
	return {
		id: Symbol(name),
		name,
	} as ServiceToken<T>;
}

/**
 * Service factory function type
 */
export type ServiceFactory<T> = (container: IContainer) => T;

/**
 * Service registration options
 */
export interface ServiceRegistration<T> {
	token: ServiceToken<T>;
	factory: ServiceFactory<T>;
	singleton?: boolean;
}

/**
 * Container interface for dependency resolution
 */
export interface IContainer {
	/**
	 * Resolve a service by its token
	 */
	resolve<T>(token: ServiceToken<T>): T;

	/**
	 * Check if a service is registered
	 */
	has<T>(token: ServiceToken<T>): boolean;
}

/**
 * Mutable container interface for registration
 */
export interface IMutableContainer extends IContainer {
	/**
	 * Register a service factory
	 */
	register<T>(registration: ServiceRegistration<T>): void;

	/**
	 * Register a singleton service factory
	 */
	registerSingleton<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;

	/**
	 * Register a transient service factory (new instance each time)
	 */
	registerTransient<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;

	/**
	 * Register a constant value
	 */
	registerInstance<T>(token: ServiceToken<T>, instance: T): void;
}
