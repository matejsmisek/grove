import React from 'react';

import { Box } from 'ink';

import { ServiceProvider, useService } from '../di/index.js';
import { NavigationProvider } from '../navigation/NavigationContext.js';
import { Router } from '../navigation/Router.js';
import { getContextDisplayName } from '../services/WorkspaceService.js';
import { WorkspaceServiceToken } from '../services/tokens.js';
import { StatusBar } from './StatusBar.js';

function AppContent() {
	const workspaceService = useService(WorkspaceServiceToken);
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
	/** When true, launch into the first-run setup wizard instead of the home screen */
	firstRun?: boolean;
}

export function App({ firstRun = false }: AppProps) {
	return (
		<ServiceProvider>
			<NavigationProvider initialScreen={firstRun ? 'setupWizard' : 'home'}>
				<AppContent />
			</NavigationProvider>
		</ServiceProvider>
	);
}
