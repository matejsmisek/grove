import React from 'react';

import { Box, Text } from 'ink';

import { useTasks } from '../hooks/useTasks.js';
import { UNKNOWN_VERSION } from '../utils/version.js';
import { useUpdateStatus } from './UpdateStatusContext.js';

interface StatusBarProps {
	isProcessing: boolean;
	workspaceName?: string | null;
}

export function StatusBar({ isProcessing, workspaceName }: StatusBarProps) {
	const runningTasks = useTasks({ status: 'running' });
	const runningCount = runningTasks.length;
	const { current, latest, updateAvailable } = useUpdateStatus();

	return (
		<Box borderStyle="single" borderColor="cyan" paddingX={1} width="100%">
			<Box flexGrow={1}>
				<Text color="cyan" bold>
					Grove
				</Text>
				{workspaceName && (
					<>
						<Text color="gray"> | </Text>
						<Text color="cyan">{workspaceName}</Text>
					</>
				)}
				<Text color="gray"> | </Text>
				<Text color={isProcessing ? 'yellow' : 'green'}>
					{isProcessing ? '●' : '○'} {isProcessing ? 'Processing...' : 'Ready'}
				</Text>
				{runningCount > 0 && (
					<>
						<Text color="gray"> | </Text>
						<Text color="yellow">
							● {runningCount} task{runningCount === 1 ? '' : 's'} running
						</Text>
					</>
				)}
			</Box>
			{current !== UNKNOWN_VERSION && (
				<Box>
					<Text color="gray">v{current}</Text>
					{updateAvailable && latest && <Text color="yellow"> · Update available → {latest}</Text>}
				</Box>
			)}
		</Box>
	);
}
