import React from 'react';

import { Box } from 'ink';

import { ServiceProvider, useService } from '../di/index.js';
import { NavigationProvider } from '../navigation/NavigationContext.js';
import { Router } from '../navigation/Router.js';
import { WorkspaceServiceToken } from '../services/tokens.js';
import { StatusBar } from './StatusBar.js';

function AppContent() {
	const workspaceService = useService(WorkspaceServiceToken);
	const workspaceContext = workspaceService.getCurrentContext();
	const workspaceName =
		workspaceContext?.type === 'workspace' ? workspaceContext.config?.name : null;

	return (
		<Box flexDirection="column" height="100%">
			<StatusBar isProcessing={false} workspaceName={workspaceName} />
			<Router />
		</Box>
	);
}

export function App() {
	return (
		<ServiceProvider>
			<NavigationProvider initialScreen="home">
				<AppContent />
			</NavigationProvider>
		</ServiceProvider>
	);
}
