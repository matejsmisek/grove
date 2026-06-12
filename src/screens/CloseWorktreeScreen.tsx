import React, { useEffect, useState } from 'react';

import { Box, Text } from 'ink';

import { type SafetyCheckGroup, SafetyConfirmation } from '../components/SafetyConfirmation.js';
import { buildWorktreeSafetyChecks, worktreeHasIssues } from '../components/safetyChecks.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GitServiceToken, GroveServiceToken, GrovesServiceToken } from '../services/tokens.js';

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
	const [error, setError] = useState<string | null>(null);
	const [groveName, setGroveName] = useState('');
	const [worktreeName, setWorktreeName] = useState('');
	const [group, setGroup] = useState<SafetyCheckGroup | null>(null);
	const [hasIssues, setHasIssues] = useState(false);

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

				setWorktreeName(worktree.name);

				const [uncommitted, unpushed, upstreamStatus] = await Promise.all([
					gitService.hasUncommittedChanges(worktree.worktreePath),
					gitService.hasUnpushedCommits(worktree.worktreePath),
					gitService.getBranchUpstreamStatus(worktree.worktreePath),
				]);

				const input = {
					hasUncommittedChanges: uncommitted,
					hasUnpushedCommits: unpushed,
					upstreamStatus,
				};

				setGroup({ title: worktree.repositoryName, checks: buildWorktreeSafetyChecks(input) });
				setHasIssues(worktreeHasIssues(input));
				setLoading(false);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error');
				setLoading(false);
			}
		}

		runChecks();
	}, [groveId, worktreePath]);

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

	return (
		<SafetyConfirmation
			title={`Close Worktree: ${worktreeName} (Grove: ${groveName})`}
			groups={group ? [group] : []}
			requireTypedConfirmation={hasIssues}
			warningTitle="⚠ Warning: This worktree has unfinished work."
			warningBody={[
				'This worktree has uncommitted changes, unpushed commits, or an unmerged branch.',
				'Closing this worktree will permanently delete it and its contents.',
			]}
			safeSummary="✓ Branch is merged and clean."
			confirmPrompt="Are you sure you want to close this worktree? This will delete the worktree."
			processingMessage="Closing worktree..."
			successMessage={`Worktree "${worktreeName}" successfully closed`}
			onConfirm={async () => {
				let result;
				try {
					result = await groveService.closeWorktree(groveId, worktreePath);
				} catch (err) {
					throw new Error(
						`Failed to close worktree: ${err instanceof Error ? err.message : 'Unknown error'}`
					);
				}
				if (!result.success) {
					throw new Error(`Failed to close worktree: ${result.message}\n${result.errors.join('\n')}`);
				}
			}}
			onCancel={goBack}
			onSuccess={goBack}
		/>
	);
}
