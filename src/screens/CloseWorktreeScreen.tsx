import React, { useEffect, useRef, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import type { BranchUpstreamStatus } from '../services/interfaces.js';
import { GitServiceToken, GroveServiceToken, GrovesServiceToken } from '../services/tokens.js';

interface WorktreeCheck {
	repositoryName: string;
	worktreePath: string;
	hasUncommittedChanges: boolean;
	hasUnpushedCommits: boolean;
	upstreamStatus: BranchUpstreamStatus;
}

interface CloseWorktreeScreenProps {
	groveId: string;
	worktreePath: string;
}

export function CloseWorktreeScreen({ groveId, worktreePath }: CloseWorktreeScreenProps) {
	const { goBack } = useNavigation();
	const gitService = useService(GitServiceToken);
	const groveService = useService(GroveServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [worktreeName, setWorktreeName] = useState('');
	const [check, setCheck] = useState<WorktreeCheck | null>(null);
	const [hasIssues, setHasIssues] = useState(false);
	const [confirmationInput, setConfirmationInput] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
	const [success, setSuccess] = useState(false);
	const autoGoBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear auto-navigate timer on unmount to prevent stale goBack() calls
	// that would drain the navigation history
	useEffect(() => {
		return () => {
			if (autoGoBackTimer.current) {
				clearTimeout(autoGoBackTimer.current);
			}
		};
	}, []);

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

				const worktree = metadata.worktrees.find((w) => w.worktreePath === worktreePath);
				if (!worktree) {
					setError('Worktree not found in grove');
					setLoading(false);
					return;
				}

				if (worktree.closed) {
					setError('Worktree is already closed');
					setLoading(false);
					return;
				}

				setWorktreeName(
					worktree.name ||
						(worktree.projectPath
							? `${worktree.repositoryName}/${worktree.projectPath}`
							: worktree.repositoryName)
				);

				const [uncommitted, unpushed, upstreamStatus] = await Promise.all([
					gitService.hasUncommittedChanges(worktree.worktreePath),
					gitService.hasUnpushedCommits(worktree.worktreePath),
					gitService.getBranchUpstreamStatus(worktree.worktreePath),
				]);

				const foundIssues = uncommitted || unpushed || upstreamStatus !== 'gone';

				setCheck({
					repositoryName: worktree.repositoryName,
					worktreePath: worktree.worktreePath,
					hasUncommittedChanges: uncommitted,
					hasUnpushedCommits: unpushed,
					upstreamStatus,
				});
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
	}, [groveId, worktreePath]);

	// Handle confirmation
	const handleConfirm = async () => {
		if (hasIssues) {
			if (confirmationInput !== 'delete') {
				return;
			}
		}

		setIsProcessing(true);
		setAwaitingConfirmation(false);

		try {
			const result = await groveService.closeWorktree(groveId, worktreePath);

			if (result.success) {
				setSuccess(true);
				setIsProcessing(false);
				// Auto-navigate back after 2 seconds
				autoGoBackTimer.current = setTimeout(() => {
					goBack();
				}, 2000);
			} else {
				setError(`Failed to close worktree: ${result.message}\n${result.errors.join('\n')}`);
				setIsProcessing(false);
			}
		} catch (err) {
			const errorMsg = err instanceof Error ? err.message : 'Unknown error';
			setError(`Failed to close worktree: ${errorMsg}`);
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

	// Handle Enter key press on success screen to immediately go back
	useInput(
		(_input, key) => {
			if (key.return) {
				if (autoGoBackTimer.current) {
					clearTimeout(autoGoBackTimer.current);
					autoGoBackTimer.current = null;
				}
				goBack();
			}
		},
		{ isActive: success }
	);

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Loading worktree information...</Text>
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
				<Text>Closing worktree...</Text>
			</Box>
		);
	}

	if (success) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text color="green" bold>
						✓ Worktree "{worktreeName}" successfully closed
					</Text>
				</Box>
				<Text dimColor>Press Enter to continue or wait to be redirected...</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>
					Close Worktree: {worktreeName} (Grove: {groveName})
				</Text>
			</Box>

			{check && (
				<Box flexDirection="column" marginBottom={1}>
					<Text bold underline>
						Safety Checks:
					</Text>
					<Box flexDirection="column" marginLeft={2} marginTop={1}>
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
				</Box>
			)}

			{hasIssues ? (
				<Box flexDirection="column" marginTop={1}>
					<Box marginBottom={1}>
						<Text color="yellow" bold>
							⚠ Warning: This worktree has unfinished work.
						</Text>
					</Box>
					<Box marginBottom={1} flexDirection="column">
						<Text>This worktree has uncommitted changes, unpushed commits, or an unmerged branch.</Text>
						<Text>Closing this worktree will permanently delete it and its contents.</Text>
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
						<Text color="green">✓ Branch is merged and clean.</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>Are you sure you want to close this worktree? This will delete the worktree.</Text>
					</Box>
					<Text>
						Press <Text bold>Y</Text> to confirm or <Text bold>N</Text> to cancel
					</Text>
				</Box>
			)}
		</Box>
	);
}
