import React from 'react';
import {Box, Text} from 'ink';
import {useNavigation} from './useNavigation.js';
import {HomeScreen} from '../screens/HomeScreen.js';
import {ChatScreen} from '../screens/ChatScreen.js';
import {SettingsScreen} from '../screens/SettingsScreen.js';

/**
 * Router component that renders the appropriate screen
 * based on the current navigation state
 */
export function Router() {
	const {current} = useNavigation();

	switch (current.screen) {
		case 'home':
			return <HomeScreen />;
		case 'chat':
			return <ChatScreen />;
		case 'settings':
			// Type narrowing: we know params is { section?: string } here
			return <SettingsScreen section={'section' in current.params ? current.params.section : undefined} />;
		default:
			return (
				<Box padding={1}>
					<Text color="red">404: Screen not found - {current.screen}</Text>
				</Box>
			);
	}
}
