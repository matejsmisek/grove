/**
 * React Context for Dependency Injection
 * Provides services to React components via context
 */
import React, { createContext, useContext, useMemo } from 'react';

import { Container, getContainer } from './Container.js';
import type { IContainer, ServiceToken } from './types.js';

/**
 * Service context type
 */
interface ServiceContextType {
	container: IContainer;
}

/**
 * React context for service container
 */
const ServiceContext = createContext<ServiceContextType | null>(null);

/**
 * Props for ServiceProvider
 */
interface ServiceProviderProps {
	children: React.ReactNode;
	container?: Container;
}

/**
 * Service provider component
 * Wraps the application with DI container access
 *
 * @example
 * ```tsx
 * <ServiceProvider container={myContainer}>
 *   <App />
 * </ServiceProvider>
 * ```
 *
 * Or use the global container:
 * ```tsx
 * <ServiceProvider>
 *   <App />
 * </ServiceProvider>
 * ```
 */
export function ServiceProvider({ children, container }: ServiceProviderProps): React.ReactElement {
	const value = useMemo(
		() => ({
			container: container ?? getContainer(),
		}),
		[container]
	);

	return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}

/**
 * Hook to get the service container
 * @throws Error if used outside ServiceProvider
 */
export function useContainer(): IContainer {
	const context = useContext(ServiceContext);

	if (!context) {
		throw new Error('useContainer must be used within a ServiceProvider');
	}

	return context.container;
}

/**
 * Hook to resolve a service from the container
 * @param token - Service token to resolve
 * @returns The resolved service instance
 * @throws Error if used outside ServiceProvider or if service not registered
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const settingsService = useService(SettingsServiceToken);
 *   const settings = settingsService.readSettings();
 *   // ...
 * }
 * ```
 */
export function useService<T>(token: ServiceToken<T>): T {
	const container = useContainer();
	return container.resolve(token);
}

/**
 * Hook to check if a service is registered
 * @param token - Service token to check
 * @returns true if service is registered
 */
export function useHasService<T>(token: ServiceToken<T>): boolean {
	const container = useContainer();
	return container.has(token);
}

/**
 * Hook to resolve multiple services at once
 * @param tokens - Array of service tokens to resolve
 * @returns Array of resolved services in the same order
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const [settingsService, repoService] = useServices([
 *     SettingsServiceToken,
 *     RepositoryServiceToken,
 *   ]);
 *   // ...
 * }
 * ```
 */
export function useServices<T extends ServiceToken<unknown>[]>(
	tokens: [...T]
): { [K in keyof T]: T[K] extends ServiceToken<infer U> ? U : never } {
	const container = useContainer();
	return tokens.map((token) => container.resolve(token)) as {
		[K in keyof T]: T[K] extends ServiceToken<infer U> ? U : never;
	};
}
