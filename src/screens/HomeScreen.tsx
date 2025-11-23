import React from 'react';
import {Box, Text} from 'ink';
import {useNavigation} from '../navigation/useNavigation.js';

export function HomeScreen() {
	const {navigate: _navigate} = useNavigation();

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="green">
					🌳 Welcome to Grove
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text>AI-powered Git management at your fingertips.</Text>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>Quick Actions:</Text>
				<Box marginLeft={2} flexDirection="column" marginTop={1}>
					<Text>
						• Press <Text color="cyan">c</Text> to start a chat
					</Text>
					<Text>
						• Press <Text color="cyan">s</Text> to open settings
					</Text>
					<Text>
						• Press <Text color="cyan">q</Text> to quit
					</Text>
				</Box>
			</Box>

			<Box marginTop={2}>
				<Text dimColor italic>
					(Navigation demo: Press buttons to navigate - not yet wired up)
				</Text>
			</Box>
		</Box>
	);
}
