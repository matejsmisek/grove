#!/usr/bin/env node
import React, { useState } from 'react';
import { render, Box, Text } from 'ink';
import TextInput from 'ink-text-input';

interface Message {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

function App() {
	const [messages, setMessages] = useState<Message[]>([
		{
			role: 'system',
			content: 'Welcome to Grove - A Git management CLI powered by AI',
		},
	]);
	const [input, setInput] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);

	const handleSubmit = (value: string) => {
		if (!value.trim() || isProcessing) return;

		// Add user message
		const userMessage: Message = {
			role: 'user',
			content: value,
		};

		setMessages(prev => [...prev, userMessage]);
		setInput('');
		setIsProcessing(true);

		// Simulate assistant response (placeholder for now)
		setTimeout(() => {
			const assistantMessage: Message = {
				role: 'assistant',
				content: `You said: "${value}". This is a placeholder response. AI integration coming soon!`,
			};
			setMessages(prev => [...prev, assistantMessage]);
			setIsProcessing(false);
		}, 500);
	};

	return (
		<Box flexDirection="column" height="100%">
			{/* Status Bar */}
			<Box borderStyle="single" borderColor="cyan" paddingX={1}>
				<Text color="cyan" bold>
					Grove
				</Text>
				<Text color="gray"> | </Text>
				<Text color={isProcessing ? 'yellow' : 'green'}>
					{isProcessing ? '●' : '○'} {isProcessing ? 'Processing...' : 'Ready'}
				</Text>
			</Box>

			{/* Response Area */}
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

			{/* Input Prompt Bar */}
			<Box borderStyle="single" borderColor="blue" paddingX={1}>
				<Text color="blue" bold>
					→{' '}
				</Text>
				{isProcessing ? (
					<Text color="gray">Processing...</Text>
				) : (
					<TextInput
						value={input}
						onChange={setInput}
						onSubmit={handleSubmit}
						placeholder="Type your message..."
					/>
				)}
			</Box>
		</Box>
	);
}

render(<App />);
