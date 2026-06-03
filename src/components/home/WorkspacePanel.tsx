import React from 'react';

import { Box, Text } from 'ink';

type WorkspacePanelProps = {
	name: string;
	kind: 'workspace' | 'repo';
	path: string;
	groveCount: number;
	isSelected: boolean;
	width?: number;
};

/**
 * A tile in the global switcher representing a workspace or a repo, styled to
 * match the grove tiles on the normal home screen.
 */
export function WorkspacePanel({
	name,
	kind,
	path,
	groveCount,
	isSelected,
	width = 24,
}: WorkspacePanelProps) {
	return (
		<Box
			borderStyle="round"
			borderColor={isSelected ? 'cyan' : 'gray'}
			paddingX={1}
			paddingY={1}
			width={width}
			flexDirection="column"
		>
			{/* Name */}
			<Box>
				<Text bold color={isSelected ? 'cyan' : 'white'}>
					{name}
				</Text>
			</Box>

			{/* Kind */}
			<Box marginTop={1}>
				<Text dimColor>{kind === 'workspace' ? 'Workspace' : 'Repository'}</Text>
			</Box>

			{/* Folder path (kept to one line; tail is most informative) */}
			<Box marginTop={1}>
				<Text dimColor wrap="truncate-start">
					{path}
				</Text>
			</Box>

			{/* Grove count */}
			<Box marginTop={1}>
				<Text color="green">
					{groveCount} grove{groveCount === 1 ? '' : 's'}
				</Text>
			</Box>
		</Box>
	);
}
