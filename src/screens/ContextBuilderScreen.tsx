import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ClaudeServiceToken } from '../services/tokens.js';
import type { Repository, Worktree } from '../storage/types.js';

interface ContextBuilderScreenProps {
	grovePath: string;
	groveName: string;
	repositories: Repository[];
	worktrees: Worktree[];
}

type BuilderStep = 'chatting' | 'reviewing' | 'saving' | 'done' | 'error';

interface DisplayMessage {
	role: 'user' | 'assistant' | 'system';
	content: string;
}

export function ContextBuilderScreen({
	grovePath,
	groveName,
	repositories,
	worktrees,
}: ContextBuilderScreenProps) {
	const { navigate } = useNavigation();
	const claudeService = useService(ClaudeServiceToken);

	const [step, setStep] = useState<BuilderStep>('chatting');
	const [displayMessages, setDisplayMessages] = useState<DisplayMessage[]>([]);
	const [anthropicMessages, setAnthropicMessages] = useState<Anthropic.MessageParam[]>([]);
	const [input, setInput] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [contextDraft, setContextDraft] = useState<string>('');
	const [error, setError] = useState<string>('');

	// Initial greeting from Claude
	useEffect(() => {
		const initializeChat = async () => {
			setIsProcessing(true);
			try {
				// Send initial message to get Claude to introduce itself and ask about the grove
				const initialMessage: Anthropic.MessageParam = {
					role: 'user',
					content: `I just created a new grove called "${groveName}" with ${worktrees.length} repository worktree(s). Please introduce yourself briefly and ask me what I'm working on so you can help create a good CONTEXT.md file.`,
				};

				const result = await claudeService.chat(
					[initialMessage],
					groveName,
					repositories,
					worktrees
				);

				setAnthropicMessages(result.updatedMessages);
				setDisplayMessages([
					{
						role: 'assistant',
						content: result.response,
					},
				]);
			} catch (err) {
				const message = err instanceof Error ? err.message : 'Failed to initialize chat';
				setError(message);
				setStep('error');
			} finally {
				setIsProcessing(false);
			}
		};

		initializeChat();
	}, [groveName, repositories, worktrees, claudeService]);

	// Handle keyboard input
	useInput(
		(_input, key) => {
			if (step === 'reviewing') {
				if (key.return) {
					// Approve the draft
					handleApproveDraft();
				} else if (key.escape) {
					// Go back to chatting
					setStep('chatting');
				}
			} else if (step === 'done' && key.return) {
				navigate('home', {});
			} else if (step === 'error' && key.escape) {
				navigate('home', {});
			}
		},
		{ isActive: step === 'reviewing' || step === 'done' || step === 'error' }
	);

	const handleSubmit = async (value: string) => {
		if (!value.trim() || isProcessing) return;

		// Check for special commands to generate draft
		const lowerValue = value.toLowerCase().trim();
		if (lowerValue === 'generate' || lowerValue === 'done' || lowerValue === 'create') {
			await handleRequestDraft();
			return;
		}

		const userMessage: DisplayMessage = {
			role: 'user',
			content: value,
		};

		setDisplayMessages((prev) => [...prev, userMessage]);
		setInput('');
		setIsProcessing(true);

		try {
			// Add user message to Anthropic messages
			const newAnthropicMessages: Anthropic.MessageParam[] = [
				...anthropicMessages,
				{ role: 'user', content: value },
			];

			const result = await claudeService.chat(
				newAnthropicMessages,
				groveName,
				repositories,
				worktrees
			);

			setAnthropicMessages(result.updatedMessages);
			setDisplayMessages((prev) => [
				...prev,
				{
					role: 'assistant',
					content: result.response,
				},
			]);

			// Check if Claude provided a CONTEXT.md draft
			const draft = claudeService.extractContextDraft(result.response);
			if (draft) {
				setContextDraft(draft);
				setStep('reviewing');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to get response';
			setDisplayMessages((prev) => [
				...prev,
				{
					role: 'system',
					content: `Error: ${message}`,
				},
			]);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleApproveDraft = () => {
		setStep('saving');
		try {
			// Write the CONTEXT.md file directly with the AI-generated content
			const contextPath = path.join(grovePath, 'CONTEXT.md');
			fs.writeFileSync(contextPath, contextDraft, 'utf-8');
			setStep('done');
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to save CONTEXT.md';
			setError(message);
			setStep('error');
		}
	};

	const handleRequestDraft = async () => {
		if (isProcessing) return;

		setIsProcessing(true);
		try {
			const requestMessage: Anthropic.MessageParam = {
				role: 'user',
				content:
					'Based on our conversation, please generate a complete CONTEXT.md file for this grove. Include the markdown in a code block so I can review it.',
			};

			const newMessages = [...anthropicMessages, requestMessage];

			setDisplayMessages((prev) => [
				...prev,
				{
					role: 'user',
					content: 'Please generate the CONTEXT.md draft now.',
				},
			]);

			const result = await claudeService.chat(newMessages, groveName, repositories, worktrees);

			setAnthropicMessages(result.updatedMessages);
			setDisplayMessages((prev) => [
				...prev,
				{
					role: 'assistant',
					content: result.response,
				},
			]);

			const draft = claudeService.extractContextDraft(result.response);
			if (draft) {
				setContextDraft(draft);
				setStep('reviewing');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to generate draft';
			setDisplayMessages((prev) => [
				...prev,
				{
					role: 'system',
					content: `Error: ${message}`,
				},
			]);
		} finally {
			setIsProcessing(false);
		}
	};

	// Render chat messages
	const renderMessages = () => (
		<Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1} overflow="hidden">
			{displayMessages.map((message, index) => (
				<Box key={index} flexDirection="column" marginBottom={1}>
					<Text
						bold
						color={
							message.role === 'user' ? 'blue' : message.role === 'assistant' ? 'green' : 'cyan'
						}
					>
						{message.role === 'user' ? 'You' : message.role === 'assistant' ? 'Claude' : 'System'}
						:
					</Text>
					<Text wrap="wrap">{message.content}</Text>
				</Box>
			))}
			{isProcessing && (
				<Box marginTop={1}>
					<Text color="yellow">Claude is thinking...</Text>
				</Box>
			)}
		</Box>
	);

	// Chatting step
	if (step === 'chatting') {
		return (
			<Box flexDirection="column" height="100%">
				<Box paddingX={1} paddingY={1} borderStyle="single" borderColor="green">
					<Text bold color="green">
						Context Builder - {groveName}
					</Text>
				</Box>
				{renderMessages()}
				<Box borderStyle="single" borderColor="blue" paddingX={1}>
					<Text color="blue" bold>
						{'→ '}
					</Text>
					{isProcessing ? (
						<Text color="gray">Processing...</Text>
					) : (
						<TextInput
							value={input}
							onChange={setInput}
							onSubmit={handleSubmit}
							placeholder="Describe your work or ask Claude to read files..."
						/>
					)}
				</Box>
				<Box paddingX={1} paddingBottom={1} flexDirection="column">
					<Text dimColor>
						Chat with Claude to build your CONTEXT.md. Claude can read files from your worktrees.
					</Text>
					<Text dimColor>
						Press <Text color="cyan">Ctrl+D</Text> when ready to generate the draft, or type
						"generate" / "done".
					</Text>
				</Box>
			</Box>
		);
	}

	// Reviewing step
	if (step === 'reviewing') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Review CONTEXT.md Draft
					</Text>
				</Box>

				<Box
					borderStyle="single"
					borderColor="cyan"
					paddingX={1}
					paddingY={1}
					marginBottom={1}
					flexDirection="column"
				>
					<Text wrap="wrap">{contextDraft}</Text>
				</Box>

				<Box flexDirection="column">
					<Text>
						Press <Text color="green" bold>Enter</Text> to approve and save
					</Text>
					<Text>
						Press <Text color="yellow" bold>Esc</Text> to go back and continue chatting
					</Text>
				</Box>
			</Box>
		);
	}

	// Saving step
	if (step === 'saving') {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow">Saving CONTEXT.md...</Text>
			</Box>
		);
	}

	// Done step
	if (step === 'done') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						CONTEXT.md Created Successfully!
					</Text>
				</Box>
				<Text>Your grove "{groveName}" is ready with a custom CONTEXT.md file.</Text>
				<Box marginTop={1}>
					<Text dimColor>
						Press <Text color="cyan">Enter</Text> to return home
					</Text>
				</Box>
			</Box>
		);
	}

	// Error step
	if (step === 'error') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="red">
						Error
					</Text>
				</Box>
				<Text color="red">{error}</Text>
				<Box marginTop={1}>
					<Text dimColor>
						Press <Text color="cyan">Esc</Text> to return home
					</Text>
				</Box>
			</Box>
		);
	}

	return null;
}
