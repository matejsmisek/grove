import React from 'react';

import { Box, Text } from 'ink';

interface StatusBarProps {
	isProcessing: boolean;
	workspaceName?: string | null;
}

export function StatusBar({ isProcessing, workspaceName }: StatusBarProps) {
	return (
		<Box borderStyle="single" borderColor="cyan" paddingX={1}>
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
		</Box>
	);
}
