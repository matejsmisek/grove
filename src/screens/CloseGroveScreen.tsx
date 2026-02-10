import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GitServiceToken, GroveServiceToken, GrovesServiceToken } from '../services/tokens.js';
import type { BranchUpstreamStatus } from '../services/types.js';

interface WorktreeCheck {
	displayName: string;
	repositoryName: string;
	worktreePath: string;
	hasUncommittedChanges: boolean;
	hasUnpushedCommits: boolean;
	upstreamStatus: BranchUpstreamStatus;
}

interface CloseGroveScreenProps {
	groveId: string;
}

export function CloseGroveScreen({ groveId }: CloseGroveScreenProps) {
	const { goBack, navigate } = useNavigation();
	const gitService = useService(GitServiceToken);
	const groveService = useService(GroveServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [checks, setChecks] = useState<WorktreeCheck[]>([]);
	const [hasIssues, setHasIssues] = useState(false);
	const [confirmationInput, setConfirmationInput] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
	const [success, setSuccess] = useState(false);

	// Run safety checks on mount
	useEffect(() => {
		async function runChecks() {
			try {
				const groveRef = grovesService.getGroveById(groveId);
				if (!groveRef) {
					setError('Grove not found');
					setLoading(false);
					return;
				}

				setGroveName(groveRef.name);

				const metadata = grovesService.readGroveMetadata(groveRef.path);
				if (!metadata) {
					setError('Grove metadata not found');
					setLoading(false);
					return;
				}

				const checkResults: WorktreeCheck[] = [];
				let foundIssues = false;

				for (const worktree of metadata.worktrees) {
					// Skip checks for already-closed worktrees
					if (worktree.closed) {
						continue;
					}

					const [uncommitted, unpushed, upstreamStatus] = await Promise.all([
						gitService.hasUncommittedChanges(worktree.worktreePath),
						gitService.hasUnpushedCommits(worktree.worktreePath),
						gitService.getBranchUpstreamStatus(worktree.worktreePath),
					]);

					// Issue if:
					// - dirty tree (uncommitted changes)
					// - unpushed commits
					// - pushed but not merged (upstream is 'active')
					// - no upstream configured (might be local-only)
					// No issue only if upstream is 'gone' (merged)
					if (uncommitted || unpushed || upstreamStatus !== 'gone') {
						foundIssues = true;
					}

					const displayName =
						worktree.name ||
						(worktree.projectPath
							? `${worktree.repositoryName}/${worktree.projectPath}`
							: worktree.repositoryName);

					checkResults.push({
						displayName,
						repositoryName: worktree.repositoryName,
						worktreePath: worktree.worktreePath,
						hasUncommittedChanges: uncommitted,
						hasUnpushedCommits: unpushed,
						upstreamStatus,
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
			const result = await groveService.closeGrove(groveId);

			if (result.success) {
				// Success - show success message and navigate to home
				setSuccess(true);
				setIsProcessing(false);
				// Auto-navigate after 2 seconds
				setTimeout(() => {
					navigate('home', {});
				}, 2000);
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

	// Handle ESC key press to cancel deletion (when typing "delete")
	useInput(
		(input, key) => {
			if (key.escape && awaitingConfirmation && hasIssues && !isProcessing) {
				goBack();
			}
		},
		{ isActive: awaitingConfirmation && hasIssues && !isProcessing }
	);

	// Handle Y/N key press for confirmation (when all checks pass)
	useInput(
		(input, _key) => {
			if (input.toLowerCase() === 'y') {
				handleConfirm();
			} else if (input.toLowerCase() === 'n') {
				goBack();
			}
		},
		{ isActive: awaitingConfirmation && !hasIssues && !isProcessing }
	);

	// Handle Enter key press on success screen to immediately navigate to home
	useInput(
		(_input, key) => {
			if (key.return) {
				navigate('home', {});
			}
		},
		{ isActive: success }
	);

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

	if (success) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text color="green" bold>
						✓ Grove "{groveName}" successfully closed
					</Text>
				</Box>
				<Text dimColor>Press Enter to continue or wait to be redirected...</Text>
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
					<Box key={check.displayName} flexDirection="column" marginLeft={2} marginTop={1}>
						<Text bold>{check.displayName}</Text>
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
						<Box marginLeft={2}>
							<Text>
								Branch status:{' '}
								{check.upstreamStatus === 'gone' ? (
									<Text color="green">✓ Merged</Text>
								) : check.upstreamStatus === 'active' ? (
									<Text color="yellow">⚠ Not merged</Text>
								) : (
									<Text color="yellow">⚠ No upstream</Text>
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
							⚠ Warning: This grove has unfinished work.
						</Text>
					</Box>
					<Box marginBottom={1} flexDirection="column">
						<Text>Some worktrees have uncommitted changes, unpushed commits, or unmerged branches.</Text>
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
					<Text dimColor>Press ESC to cancel</Text>
				</Box>
			) : (
				<Box flexDirection="column" marginTop={1}>
					<Box marginBottom={1}>
						<Text color="green">✓ All branches are merged and clean.</Text>
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
