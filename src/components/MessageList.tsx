import React from 'react';
import { Box, Text } from 'ink';
import { Message } from './types.js';

interface MessageListProps {
	messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
	return (
		<Box
			flexDirection="column"
			flexGrow={1}
			paddingX={1}
			paddingY={1}
			overflow="hidden"
		>
			{messages.map((message, index) => (
				<Box key={index} flexDirection="column" marginBottom={1}>
					<Text
						bold
						color={
							message.role === 'user'
								? 'blue'
								: message.role === 'assistant'
									? 'green'
									: 'cyan'
						}
					>
						{message.role === 'user'
							? 'You'
							: message.role === 'assistant'
								? 'Assistant'
								: 'System'}
						:
					</Text>
					<Text>{message.content}</Text>
				</Box>
			))}
		</Box>
	);
}
