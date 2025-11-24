/**
 * Dependency Injection Module
 * Exports all DI-related types and functions
 */

// Container exports
export { Container, getContainer, resetContainer, setContainer } from './Container.js';

// Type exports
export type {
	IContainer,
	IMutableContainer,
	ServiceFactory,
	ServiceRegistration,
	ServiceToken,
} from './types.js';
export { createToken } from './types.js';

// React integration exports
export {
	ServiceProvider,
	useContainer,
	useHasService,
	useService,
	useServices,
} from './ServiceContext.js';
