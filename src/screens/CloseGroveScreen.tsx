import React, { useEffect, useState } from 'react';

import { Box, Text } from 'ink';

import TextInput from 'ink-text-input';

import { hasUncommittedChanges, hasUnpushedCommits } from '../git/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { closeGrove, getGroveById, readGroveMetadata } from '../storage/index.js';

interface WorktreeCheck {
	repositoryName: string;
	worktreePath: string;
	hasUncommittedChanges: boolean;
	hasUnpushedCommits: boolean;
}

interface CloseGroveScreenProps {
	groveId: string;
}

export function CloseGroveScreen({ groveId }: CloseGroveScreenProps) {
	const { goBack } = useNavigation();
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [checks, setChecks] = useState<WorktreeCheck[]>([]);
	const [hasIssues, setHasIssues] = useState(false);
	const [confirmationInput, setConfirmationInput] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

	// Run safety checks on mount
	useEffect(() => {
		async function runChecks() {
			try {
				const groveRef = getGroveById(groveId);
				if (!groveRef) {
					setError('Grove not found');
					setLoading(false);
					return;
				}

				setGroveName(groveRef.name);

				const metadata = readGroveMetadata(groveRef.path);
				if (!metadata) {
					setError('Grove metadata not found');
					setLoading(false);
					return;
				}

				const checkResults: WorktreeCheck[] = [];
				let foundIssues = false;

				for (const worktree of metadata.worktrees) {
					const uncommitted = hasUncommittedChanges(worktree.worktreePath);
					const unpushed = hasUnpushedCommits(worktree.worktreePath);

					if (uncommitted || unpushed) {
						foundIssues = true;
					}

					checkResults.push({
						repositoryName: worktree.repositoryName,
						worktreePath: worktree.worktreePath,
						hasUncommittedChanges: uncommitted,
						hasUnpushedCommits: unpushed,
					});
				}

				setChecks(checkResults);
				setHasIssues(foundIssues);
				setLoading(false);
				setAwaitingConfirmation(true);
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Unknown error';
				setError(errorMsg);
				setLoading(false);
			}
		}

		runChecks();
	}, [groveId]);

	// Handle confirmation
	const handleConfirm = async () => {
		// Check confirmation requirements
		if (hasIssues) {
			if (confirmationInput !== 'delete') {
				return; // Don't proceed if not typed "delete"
			}
		}

		setIsProcessing(true);
		setAwaitingConfirmation(false);

		try {
			const result = await closeGrove(groveId);

			if (result.success) {
				// Success - go back to home
				goBack();
			} else {
				setError(`Failed to close grove: ${result.message}\n${result.errors.join('\n')}`);
				setIsProcessing(false);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			setError(`Failed to close grove: ${errorMsg}`);
			setIsProcessing(false);
		}
	};

	// Handle key press for Y/N confirmation
	useEffect(() => {
		if (!awaitingConfirmation || hasIssues || isProcessing) {
			return;
		}

		const handleKeyPress = (input: string) => {
			if (input.toLowerCase() === 'y') {
				handleConfirm();
			} else if (input.toLowerCase() === 'n') {
				goBack();
			}
		};

		process.stdin.on('data', handleKeyPress);

		return () => {
			process.stdin.off('data', handleKeyPress);
		};
	}, [awaitingConfirmation, hasIssues, isProcessing]);

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Loading grove information...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">Error: {error}</Text>
				<Text dimColor>Press any key to go back</Text>
			</Box>
		);
	}

	if (isProcessing) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Closing grove...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>Close Grove: {groveName}</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold underline>
					Safety Checks:
				</Text>
				{checks.map((check) => (
					<Box key={check.repositoryName} flexDirection="column" marginLeft={2} marginTop={1}>
						<Text bold>{check.repositoryName}</Text>
						<Box marginLeft={2}>
							<Text>
								Uncommitted changes:{' '}
								{check.hasUncommittedChanges ? (
									<Text color="yellow">⚠ Yes</Text>
								) : (
									<Text color="green">✓ No</Text>
								)}
							</Text>
						</Box>
						<Box marginLeft={2}>
							<Text>
								Unpushed commits:{' '}
								{check.hasUnpushedCommits ? (
									<Text color="yellow">⚠ Yes</Text>
								) : (
									<Text color="green">✓ No</Text>
								)}
							</Text>
						</Box>
					</Box>
				))}
			</Box>

			{hasIssues ? (
				<Box flexDirection="column" marginTop={1}>
					<Box marginBottom={1}>
						<Text color="yellow" bold>
							⚠ Warning: This grove has uncommitted changes or unpushed commits.
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>Closing this grove will permanently delete all worktrees and their contents.</Text>
					</Box>
					<Box flexDirection="column" marginBottom={1}>
						<Text bold>Type "delete" to confirm deletion:</Text>
						<TextInput
							value={confirmationInput}
							onChange={setConfirmationInput}
							onSubmit={handleConfirm}
						/>
					</Box>
					<Text dimColor>Press Ctrl+C to cancel</Text>
				</Box>
			) : (
				<Box flexDirection="column" marginTop={1}>
					<Box marginBottom={1}>
						<Text color="green">✓ All safety checks passed.</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>Are you sure you want to close this grove? This will delete all worktrees.</Text>
					</Box>
					<Text>
						Press <Text bold>Y</Text> to confirm or <Text bold>N</Text> to cancel
					</Text>
				</Box>
			)}
		</Box>
	);
}
