import React from 'react';

import { Box, Text } from 'ink';

import { ChatScreen } from '../screens/ChatScreen.js';
import { CloseGroveScreen } from '../screens/CloseGroveScreen.js';
import { CreateGroveScreen } from '../screens/CreateGroveScreen.js';
import { HomeScreen } from '../screens/HomeScreen.js';
import { RepositoriesScreen } from '../screens/RepositoriesScreen.js';
import { SettingsScreen } from '../screens/SettingsScreen.js';
import { WorkingFolderScreen } from '../screens/WorkingFolderScreen.js';
import { useNavigation } from './useNavigation.js';

/**
 * Router component that renders the appropriate screen
 * based on the current navigation state
 */
export function Router() {
	const { current } = useNavigation();

	switch (current.screen) {
		case 'home':
			return <HomeScreen />;
		case 'chat':
			return <ChatScreen />;
		case 'createGrove':
			return <CreateGroveScreen />;
		case 'closeGrove':
			// Type narrowing: we know params is { groveId: string } here
			return <CloseGroveScreen groveId={'groveId' in current.params ? current.params.groveId : ''} />;
		case 'settings':
			// Type narrowing: we know params is { section?: string } here
			return (
				<SettingsScreen section={'section' in current.params ? current.params.section : undefined} />
			);
		case 'workingFolder':
			return <WorkingFolderScreen />;
		case 'repositories':
			return <RepositoriesScreen />;
		default:
			return (
				<Box padding={1}>
					<Text color="red">404: Screen not found - {current.screen}</Text>
				</Box>
			);
	}
}
