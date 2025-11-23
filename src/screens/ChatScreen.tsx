import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { InputPrompt } from '../components/InputPrompt.js';
import { MessageList } from '../components/MessageList.js';
import { Message } from '../components/types.js';
import { useNavigation } from '../navigation/useNavigation.js';

export function ChatScreen() {
	const { goBack, canGoBack } = useNavigation();
	const [messages, setMessages] = useState<Message[]>([
		{
			role: 'system',
			content: 'Chat mode activated. How can I help you with Git today?',
		},
	]);
	const [input, setInput] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);

	useInput((_input, key) => {
		if (key.escape && canGoBack && !isProcessing) {
			goBack();
		}
	});

	const handleSubmit = (value: string) => {
		if (!value.trim() || isProcessing) return;

		// Add user message
		const userMessage: Message = {
			role: 'user',
			content: value,
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput('');
		setIsProcessing(true);

		// Simulate assistant response (placeholder for now)
		setTimeout(() => {
			const assistantMessage: Message = {
				role: 'assistant',
				content: `You said: "${value}". This is a placeholder response. AI integration coming soon!`,
			};
			setMessages((prev) => [...prev, assistantMessage]);
			setIsProcessing(false);
		}, 500);
	};

	return (
		<Box flexDirection="column" height="100%">
			<MessageList messages={messages} />
			<InputPrompt
				isProcessing={isProcessing}
				input={input}
				onInputChange={setInput}
				onSubmit={handleSubmit}
			/>
			{canGoBack && (
				<Box paddingX={1} paddingBottom={1}>
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				</Box>
			)}
		</Box>
	);
}
