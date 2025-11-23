import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
	isProcessing: boolean;
}

export function StatusBar({ isProcessing }: StatusBarProps) {
	return (
		<Box borderStyle="single" borderColor="cyan" paddingX={1}>
			<Text color="cyan" bold>
				Grove
			</Text>
			<Text color="gray"> | </Text>
			<Text color={isProcessing ? 'yellow' : 'green'}>
				{isProcessing ? '●' : '○'} {isProcessing ? 'Processing...' : 'Ready'}
			</Text>
		</Box>
	);
}
