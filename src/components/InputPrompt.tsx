import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface InputPromptProps {
	isProcessing: boolean;
	input: string;
	onInputChange: (value: string) => void;
	onSubmit: (value: string) => void;
}

export function InputPrompt({
	isProcessing,
	input,
	onInputChange,
	onSubmit,
}: InputPromptProps) {
	return (
		<Box borderStyle="single" borderColor="blue" paddingX={1}>
			<Text color="blue" bold>
				→{' '}
			</Text>
			{isProcessing ? (
				<Text color="gray">Processing...</Text>
			) : (
				<TextInput
					value={input}
					onChange={onInputChange}
					onSubmit={onSubmit}
					placeholder="Type your message..."
				/>
			)}
		</Box>
	);
}
