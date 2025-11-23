#!/usr/bin/env node
import React, { useState } from 'react';
import { render, Box } from 'ink';
import { Message } from './components/types.js';
import { StatusBar } from './components/StatusBar.js';
import { MessageList } from './components/MessageList.js';
import { InputPrompt } from './components/InputPrompt.js';

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
			<StatusBar isProcessing={isProcessing} />
			<MessageList messages={messages} />
			<InputPrompt
				isProcessing={isProcessing}
				input={input}
				onInputChange={setInput}
				onSubmit={handleSubmit}
			/>
		</Box>
	);
}

render(<App />);
