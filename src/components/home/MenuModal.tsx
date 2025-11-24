import React from 'react';

import { Box, Text } from 'ink';

export type MenuOption = {
	label: string;
	action: () => void;
};

type MenuModalProps = {
	title: string;
	options: MenuOption[];
	selectedIndex: number;
	helpText?: string;
};

export function MenuModal({ title, options, selectedIndex, helpText }: MenuModalProps) {
	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold>{title}</Text>
			</Box>

			{options.map((option, index) => (
				<Box key={index}>
					<Text color={selectedIndex === index ? 'cyan' : undefined}>
						{selectedIndex === index ? '❯ ' : '  '}
						{option.label}
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
