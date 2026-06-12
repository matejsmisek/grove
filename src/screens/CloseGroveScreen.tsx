import React, { useEffect, useState } from 'react';

import { Box, Text } from 'ink';

import { type SafetyCheckGroup, SafetyConfirmation } from '../components/SafetyConfirmation.js';
import { buildWorktreeSafetyChecks, worktreeHasIssues } from '../components/safetyChecks.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GitServiceToken, GroveServiceToken, GrovesServiceToken } from '../services/tokens.js';

interface CloseGroveScreenProps {
	groveId: string;
}

export function CloseGroveScreen({ groveId }: CloseGroveScreenProps) {
	const { goBack, navigate } = useNavigation();
	const gitService = useService(GitServiceToken);
	const groveService = useService(GroveServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [groveName, setGroveName] = useState('');
	const [groups, setGroups] = useState<SafetyCheckGroup[]>([]);
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

				const checkGroups: SafetyCheckGroup[] = [];
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

					const input = {
						hasUncommittedChanges: uncommitted,
						hasUnpushedCommits: unpushed,
						upstreamStatus,
					};

					if (worktreeHasIssues(input)) {
						foundIssues = true;
					}

					const displayName = worktree.name;

					checkGroups.push({ title: displayName, checks: buildWorktreeSafetyChecks(input) });
				}

				setGroups(checkGroups);
				setHasIssues(foundIssues);
				setLoading(false);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Unknown error');
				setLoading(false);
			}
		}

		runChecks();
	}, [groveId]);

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

	return (
		<SafetyConfirmation
			title={`Close Grove: ${groveName}`}
			groups={groups}
			requireTypedConfirmation={hasIssues}
			warningTitle="⚠ Warning: This grove has unfinished work."
			warningBody={[
				'Some worktrees have uncommitted changes, unpushed commits, or unmerged branches.',
				'Closing this grove will permanently delete all worktrees and their contents.',
			]}
			safeSummary="✓ All branches are merged and clean."
			confirmPrompt="Are you sure you want to close this grove? This will delete all worktrees."
			processingMessage="Closing grove..."
			successMessage={`Grove "${groveName}" successfully closed`}
			onConfirm={async () => {
				let result;
				try {
					result = await groveService.closeGrove(groveId);
				} catch (err) {
					throw new Error(
						`Failed to close grove: ${err instanceof Error ? err.message : 'Unknown error'}`
					);
				}
				if (!result.success) {
					throw new Error(`Failed to close grove: ${result.message}\n${result.errors.join('\n')}`);
				}
			}}
			onCancel={goBack}
			onSuccess={() => navigate('home', {})}
		/>
	);
}
