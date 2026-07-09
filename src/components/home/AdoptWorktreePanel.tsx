import React from 'react';

import { Box, Text } from 'ink';

type AdoptWorktreePanelProps = {
	isSelected: boolean;
	width?: number;
};

export function AdoptWorktreePanel({ isSelected, width = 24 }: AdoptWorktreePanelProps) {
	return (
		<Box
			borderStyle="round"
			borderColor={isSelected ? 'cyan' : 'gray'}
			paddingX={1}
			paddingY={1}
			width={width}
			flexDirection="column"
			justifyContent="center"
			alignItems="center"
		>
			<Box>
				<Text bold color={isSelected ? 'cyan' : 'green'}>
					↳
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text bold color={isSelected ? 'cyan' : 'white'}>
					Adopt Worktree
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>Track an existing worktree</Text>
			</Box>
		</Box>
	);
}
