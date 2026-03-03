import React, { useEffect, useRef, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GitServiceToken, GroveServiceToken, GrovesServiceToken } from '../services/tokens.js';
import type { BranchUpstreamStatus } from '../services/types.js';

interface MergedWorktreeCheck {
	name: string;
	repositoryName: string;
	worktreePath: string;
	hasUncommittedChanges: boolean;
	hasUnpushedCommits: boolean;
	upstreamStatus: BranchUpstreamStatus;
}

interface CloseMergedWorktreesScreenProps {
	groveId: string;
}

export function CloseMergedWorktreesScreen({ groveId }: CloseMergedWorktreesScreenProps) {
	const { goBack } = useNavigation();
	const gitService = useService(GitServiceToken);
	const groveService = useService(GroveServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [checks, setChecks] = useState<MergedWorktreeCheck[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
	const [success, setSuccess] = useState(false);
	const [closedCount, setClosedCount] = useState(0);
	const [closeErrors, setCloseErrors] = useState<string[]>([]);
	const autoGoBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Clear auto-navigate timer on unmount
	useEffect(() => {
		return () => {
			if (autoGoBackTimer.current) {
				clearTimeout(autoGoBackTimer.current);
			}
		};
	}, []);

	// Find and check merged worktrees on mount
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

				// Find all non-closed worktrees
				const openWorktrees = metadata.worktrees.filter((w) => !w.closed);

				if (openWorktrees.length === 0) {
					setError('No open worktrees in this grove');
					setLoading(false);
					return;
				}

				// Check upstream status for all open worktrees in parallel
				const checkResults = await Promise.all(
					openWorktrees.map(async (worktree) => {
						const [uncommitted, unpushed, upstreamStatus] = await Promise.all([
							gitService.hasUncommittedChanges(worktree.worktreePath),
							gitService.hasUnpushedCommits(worktree.worktreePath),
							gitService.getBranchUpstreamStatus(worktree.worktreePath),
						]);

						const name =
							worktree.name ||
							(worktree.projectPath
								? `${worktree.repositoryName}/${worktree.projectPath}`
								: worktree.repositoryName);

						return {
							name,
							repositoryName: worktree.repositoryName,
							worktreePath: worktree.worktreePath,
							hasUncommittedChanges: uncommitted,
							hasUnpushedCommits: unpushed,
							upstreamStatus,
						};
					})
				);

				// Filter to only merged worktrees (upstream gone)
				const mergedWorktrees = checkResults.filter((c) => c.upstreamStatus === 'gone');

				if (mergedWorktrees.length === 0) {
					setError('No merged worktrees found');
					setLoading(false);
					return;
				}

				setChecks(mergedWorktrees);
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

	// Handle confirmation - close all merged worktrees
	const handleConfirm = async () => {
		setIsProcessing(true);
		setAwaitingConfirmation(false);

		const errors: string[] = [];
		let closed = 0;

		for (const check of checks) {
			try {
				const result = await groveService.closeWorktree(groveId, check.worktreePath);
				if (result.success) {
					closed++;
				} else {
					errors.push(`${check.name}: ${result.message}`);
				}
			} catch (err) {
				const errorMsg = err instanceof Error ? err.message : 'Unknown error';
				errors.push(`${check.name}: ${errorMsg}`);
			}
		}

		setClosedCount(closed);
		setCloseErrors(errors);
		setSuccess(true);
		setIsProcessing(false);

		// Auto-navigate back after 2 seconds
		autoGoBackTimer.current = setTimeout(() => {
			goBack();
		}, 2000);
	};

	// Handle Y/N confirmation
	useInput(
		(input, _key) => {
			if (input.toLowerCase() === 'y') {
				handleConfirm();
			} else if (input.toLowerCase() === 'n') {
				goBack();
			}
		},
		{ isActive: awaitingConfirmation && !isProcessing }
	);

	// Handle Enter on success screen to go back immediately
	useInput(
		(_input, key) => {
			if (key.return || key.escape) {
				if (autoGoBackTimer.current) {
					clearTimeout(autoGoBackTimer.current);
					autoGoBackTimer.current = null;
				}
				goBack();
			}
		},
		{ isActive: success }
	);

	// Handle ESC to cancel
	useInput(
		(_input, key) => {
			if (key.escape) {
				goBack();
			}
		},
		{ isActive: !!error || (awaitingConfirmation && !isProcessing) }
	);

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Checking worktrees for merged branches...</Text>
			</Box>
		);
	}

	if (error) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="red">Error: {error}</Text>
				<Box marginTop={1}>
					<Text dimColor>Press ESC to go back</Text>
				</Box>
			</Box>
		);
	}

	if (isProcessing) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Closing merged worktrees...</Text>
			</Box>
		);
	}

	if (success) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text color="green" bold>
						{closedCount === checks.length
							? `✓ Successfully closed all ${closedCount} merged worktree${closedCount !== 1 ? 's' : ''}`
							: `✓ Closed ${closedCount} of ${checks.length} merged worktree${checks.length !== 1 ? 's' : ''}`}
					</Text>
				</Box>
				{closeErrors.length > 0 && (
					<Box flexDirection="column" marginBottom={1}>
						<Text color="yellow" bold>
							Errors:
						</Text>
						{closeErrors.map((err, i) => (
							<Text key={i} color="yellow">
								• {err}
							</Text>
						))}
					</Box>
				)}
				<Text dimColor>Press Enter to continue or wait to be redirected...</Text>
			</Box>
		);
	}

	// Separate clean and dirty merged worktrees
	const cleanWorktrees = checks.filter((c) => !c.hasUncommittedChanges && !c.hasUnpushedCommits);
	const dirtyWorktrees = checks.filter((c) => c.hasUncommittedChanges || c.hasUnpushedCommits);

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>Close Merged Worktrees (Grove: {groveName})</Text>
			</Box>

			<Box flexDirection="column" marginBottom={1}>
				<Text bold underline>
					Merged worktrees to close ({checks.length}):
				</Text>
				<Box flexDirection="column" marginLeft={2} marginTop={1}>
					{cleanWorktrees.map((check) => (
						<Box key={check.worktreePath}>
							<Text color="green">✓ </Text>
							<Text>{check.name}</Text>
							<Text dimColor> — merged and clean</Text>
						</Box>
					))}
					{dirtyWorktrees.map((check) => (
						<Box key={check.worktreePath} flexDirection="column">
							<Box>
								<Text color="yellow">⚠ </Text>
								<Text>{check.name}</Text>
								<Text dimColor> — merged but has:</Text>
							</Box>
							<Box marginLeft={4}>
								<Text color="yellow">
									{[
										check.hasUncommittedChanges && 'uncommitted changes',
										check.hasUnpushedCommits && 'unpushed commits',
									]
										.filter(Boolean)
										.join(', ')}
								</Text>
							</Box>
						</Box>
					))}
				</Box>
			</Box>

			<Box flexDirection="column" marginTop={1}>
				<Box marginBottom={1}>
					<Text>
						Are you sure you want to close{' '}
						{checks.length === 1 ? 'this worktree' : `all ${checks.length} merged worktrees`}?
					</Text>
				</Box>
				<Text>
					Press <Text bold>Y</Text> to confirm or <Text bold>N</Text> to cancel
				</Text>
			</Box>
		</Box>
	);
}
