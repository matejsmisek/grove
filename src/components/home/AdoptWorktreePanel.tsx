import React from 'react';

import { Box, Text } from 'ink';

type AdoptWorktreePanelProps = {
	isSelected: boolean;
	/** Number of untracked (adoptable) worktrees found by the scan */
	count: number;
	width?: number;
};

export function AdoptWorktreePanel({ isSelected, count, width = 24 }: AdoptWorktreePanelProps) {
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
				<Text dimColor>
					{count} untracked worktree{count === 1 ? '' : 's'}
				</Text>
			</Box>
		</Box>
	);
}
