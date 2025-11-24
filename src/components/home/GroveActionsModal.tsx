import React from 'react';

import { Box, Text } from 'ink';

import type { GroveReference } from '../../storage/index.js';

export type GroveAction = {
	label: string;
	action: () => void;
};

type GroveActionsModalProps = {
	grove: GroveReference;
	actions: GroveAction[];
	selectedIndex: number;
	helpText?: string;
};

export function GroveActionsModal({
	grove,
	actions,
	selectedIndex,
	helpText,
}: GroveActionsModalProps) {
	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>Grove: {grove.name}</Text>
			</Box>

			{actions.map((action, index) => (
				<Box key={index}>
					<Text color={selectedIndex === index ? 'cyan' : undefined}>
						{selectedIndex === index ? '❯ ' : '  '}
						{action.label}
					</Text>
				</Box>
			))}

			{helpText && (
				<Box marginTop={1}>
					<Text dimColor>{helpText}</Text>
				</Box>
			)}
		</Box>
	);
}
