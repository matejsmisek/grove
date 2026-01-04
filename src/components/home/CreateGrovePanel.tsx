import React from 'react';

import { Box, Text } from 'ink';

type CreateGrovePanelProps = {
	isSelected: boolean;
};

export function CreateGrovePanel({ isSelected }: CreateGrovePanelProps) {
	return (
		<Box
			borderStyle="round"
			borderColor={isSelected ? 'cyan' : 'gray'}
			paddingX={1}
			paddingY={1}
			width={24}
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
		>
			<Box>
				<Text bold color={isSelected ? 'cyan' : 'green'}>
					+
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text bold color={isSelected ? 'cyan' : 'white'}>
					Create Grove
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>Start a new project</Text>
			</Box>
		</Box>
	);
}
