import path from 'path';
import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GroveServiceToken, SettingsServiceToken } from '../services/tokens.js';
import { getAllRepositories, initializeStorage } from '../storage/index.js';
import type { GroveMetadata, Repository } from '../storage/types.js';

type CreateStep = 'name' | 'repositories' | 'creating' | 'done' | 'error';

export function CreateGroveScreen() {
	const { navigate, goBack } = useNavigation();
	const groveService = useService(GroveServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const [step, setStep] = useState<CreateStep>('name');
	const [groveName, setGroveName] = useState('');
	const [repositories] = useState(() => {
		initializeStorage();
		return getAllRepositories();
	});
	const [selectedRepoIndices, setSelectedRepoIndices] = useState<Set<number>>(new Set());
	const [selectedRepos, setSelectedRepos] = useState<Repository[]>([]);
	const [createdMetadata, setCreatedMetadata] = useState<GroveMetadata | null>(null);
	const [cursorIndex, setCursorIndex] = useState(0);
	const [error, setError] = useState<string>('');

	// Handle input for repository selection
	useInput(
		(input, key) => {
			if (step !== 'repositories') return;

			if (key.upArrow) {
				setCursorIndex((prev) => (prev > 0 ? prev - 1 : repositories.length - 1));
			} else if (key.downArrow) {
				setCursorIndex((prev) => (prev < repositories.length - 1 ? prev + 1 : 0));
			} else if (input === ' ') {
				// Toggle selection with spacebar
				setSelectedRepoIndices((prev) => {
					const newSet = new Set(prev);
					if (newSet.has(cursorIndex)) {
						newSet.delete(cursorIndex);
					} else {
						newSet.add(cursorIndex);
					}
					return newSet;
				});
			} else if (key.return) {
				// Create grove with selected repositories
				if (selectedRepoIndices.size === 0) {
					setError('Please select at least one repository');
					setStep('error');
					return;
				}

				// Start async grove creation
				setStep('creating');

				// Get selected repositories
				const repos = Array.from(selectedRepoIndices).map((index) => repositories[index]);
				setSelectedRepos(repos);

				// Create grove asynchronously
				groveService
					.createGrove(groveName, repos)
					.then((metadata) => {
						setCreatedMetadata(metadata);
						setStep('done');
					})
					.catch((err) => {
						setError(err instanceof Error ? err.message : 'Failed to create grove');
						setStep('error');
					});
			} else if (key.escape) {
				goBack();
			}
		},
		{ isActive: step === 'repositories' }
	);

	// Handle escape key for other steps
	useInput(
		(_input, key) => {
			if (key.escape) {
				goBack();
			}
		},
		{ isActive: step === 'name' || step === 'error' || step === 'done' }
	);

	const handleNameSubmit = (value: string) => {
		if (!value.trim()) {
			setError('Grove name cannot be empty');
			setStep('error');
			return;
		}

		setGroveName(value.trim());

		if (repositories.length === 0) {
			setError('No repositories registered. Please add repositories in Settings first.');
			setStep('error');
			return;
		}

		setStep('repositories');
	};

	if (step === 'name') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Create New Grove
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Enter a name for your grove:</Text>
				</Box>

				<Box marginBottom={1}>
					<Text color="cyan">Name: </Text>
					<TextInput value={groveName} onChange={setGroveName} onSubmit={handleNameSubmit} />
				</Box>

				<Box marginTop={1}>
					<Text dimColor>Press Enter to continue, Esc to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'repositories') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Create Grove: {groveName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select repositories to include (Space to toggle, Enter to create):</Text>
				</Box>

				<Box flexDirection="column" marginLeft={2}>
					{repositories.map((repo, index) => {
						const isSelected = selectedRepoIndices.has(index);
						const isCursor = index === cursorIndex;
						return (
							<Box key={index}>
								<Text color={isCursor ? 'cyan' : undefined} bold={isCursor}>
									{isCursor ? '❯ ' : '  '}[{isSelected ? '✓' : ' '}] {repo.name}
								</Text>
							</Box>
						);
					})}
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>• Use ↑/↓ to navigate</Text>
					<Text dimColor>• Space to toggle selection</Text>
					<Text dimColor>• Enter to create grove</Text>
					<Text dimColor>• Esc to cancel</Text>
				</Box>

				<Box marginTop={1}>
					<Text color="yellow">
						Selected: {selectedRepoIndices.size} / {repositories.length}
					</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'creating') {
		const selectedCount = selectedRepoIndices.size;
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Creating Grove...
					</Text>
				</Box>
				<Text>Setting up "{groveName}"</Text>
				<Box marginTop={1}>
					<Text dimColor>Creating {selectedCount} worktree(s)...</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'done') {
		// Navigate to context builder after a brief delay
		const settings = settingsService.readSettings();
		const grovePath = path.join(settings.workingFolder, groveName);

		// Navigate to context builder with the grove info
		setTimeout(() => {
			navigate('contextBuilder', {
				grovePath,
				groveName,
				repositories: selectedRepos,
				worktrees: createdMetadata?.worktrees ?? [],
			});
		}, 500);

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Grove Created Successfully!
					</Text>
				</Box>
				<Text>Grove "{groveName}" has been created with {createdMetadata?.worktrees.length ?? 0} worktree(s).</Text>
				<Box marginTop={1}>
					<Text dimColor>Opening Context Builder...</Text>
				</Box>
			</Box>
		);
	}

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
					<Text dimColor>Press Esc to go back</Text>
				</Box>
			</Box>
		);
	}

	return null;
}
