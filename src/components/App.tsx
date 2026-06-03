import React from 'react';

import { Box } from 'ink';

import { ServiceProvider, useService } from '../di/index.js';
import { NavigationProvider } from '../navigation/NavigationContext.js';
import { Router } from '../navigation/Router.js';
import type { Routes } from '../navigation/types.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { getContextDisplayName } from '../services/WorkspaceService.js';
import { WorkspaceServiceToken } from '../services/tokens.js';
import { StatusBar } from './StatusBar.js';

function AppContent() {
	const workspaceService = useService(WorkspaceServiceToken);
	// Subscribe to navigation so the status bar re-renders after a context
	// switch (which happens alongside a navigate from the global switcher).
	useNavigation();
	const workspaceContext = workspaceService.getCurrentContext();
	const workspaceName = getContextDisplayName(workspaceContext);

	return (
		<Box flexDirection="column" height="100%">
			<StatusBar isProcessing={false} workspaceName={workspaceName} />
			<Router />
		</Box>
	);
}

interface AppProps {
	/** Screen to launch into (e.g. 'home', 'globalHome', 'setupWizard') */
	initialScreen?: keyof Routes;
}

export function App({ initialScreen = 'home' }: AppProps) {
	return (
		<ServiceProvider>
			<NavigationProvider initialScreen={initialScreen}>
				<AppContent />
			</NavigationProvider>
		</ServiceProvider>
	);
}
