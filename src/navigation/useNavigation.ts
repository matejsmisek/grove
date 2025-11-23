import {useContext} from 'react';
import {NavigationContext} from './NavigationContext.js';
import type {NavigationContextType} from './types.js';

/**
 * Hook to access navigation context
 * Provides navigate, goBack, and current navigation state
 */
export function useNavigation(): NavigationContextType {
	const context = useContext(NavigationContext);

	if (!context) {
		throw new Error('useNavigation must be used within a NavigationProvider');
	}

	return context;
}
