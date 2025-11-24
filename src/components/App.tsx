import React from 'react';

import { Box } from 'ink';

import { ServiceProvider } from '../di/index.js';
import { NavigationProvider } from '../navigation/NavigationContext.js';
import { Router } from '../navigation/Router.js';
import { StatusBar } from './StatusBar.js';

export function App() {
	return (
		<ServiceProvider>
			<NavigationProvider initialScreen="home">
				<Box flexDirection="column" height="100%">
					<StatusBar isProcessing={false} />
					<Router />
				</Box>
			</NavigationProvider>
		</ServiceProvider>
	);
}
