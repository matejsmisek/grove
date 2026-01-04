import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useNavigation } from '../navigation/useNavigation.js';
import { getAllRepositories, removeRepository, updateRepository } from '../storage/index.js';
import type { Repository } from '../storage/index.js';

type ScreenMode = 'list' | 'confirm-delete';

export function RepositoriesScreen() {
	const { goBack, canGoBack } = useNavigation();
	const [repositories, setRepositories] = useState<Repository[]>(() => getAllRepositories());
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [mode, setMode] = useState<ScreenMode>('list');
	const [deleteSuccess, setDeleteSuccess] = useState(false);
	const [monorepoToggleSuccess, setMonorepoToggleSuccess] = useState(false);

	useInput((input, key) => {
		if (key.escape) {
			if (mode === 'confirm-delete') {
				setMode('list');
			} else if (canGoBack) {
				goBack();
			}
		} else if (mode === 'list') {
			if (key.upArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : repositories.length - 1));
			} else if (key.downArrow) {
				setSelectedIndex((prev) => (prev < repositories.length - 1 ? prev + 1 : 0));
			} else if (key.delete || key.backspace || input === 'd') {
				if (repositories.length > 0) {
					setMode('confirm-delete');
				}
			} else if (input === 'm' || input === 'M') {
				// Toggle monorepo flag
				if (repositories.length > 0) {
					const repo = repositories[selectedIndex];
					const newIsMonorepo = !repo.isMonorepo;
					updateRepository(repo.path, { isMonorepo: newIsMonorepo });
					// Refresh the list
					setRepositories(getAllRepositories());
					setMonorepoToggleSuccess(true);
					setTimeout(() => {
						setMonorepoToggleSuccess(false);
					}, 2000);
				}
			}
		} else if (mode === 'confirm-delete') {
			if (input === 'y') {
				// Confirm deletion
				const repoToDelete = repositories[selectedIndex];
				const success = removeRepository(repoToDelete.path);
				if (success) {
					const newRepos = getAllRepositories();
					setRepositories(newRepos);
					setDeleteSuccess(true);
					setMode('list');
					// Reset selected index if needed
					if (selectedIndex >= newRepos.length) {
						setSelectedIndex(Math.max(0, newRepos.length - 1));
					}
					// Clear success message after a delay
					setTimeout(() => {
						setDeleteSuccess(false);
					}, 2000);
				}
			} else if (input === 'n') {
				// Cancel deletion
				setMode('list');
			}
		}
	});

	if (repositories.length === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						📦 Registered Repositories
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>No repositories registered yet.</Text>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>To register a repository, navigate to the repository folder and run:</Text>
				</Box>

				<Box marginLeft={2} marginTop={1}>
					<Text color="cyan">grove --register</Text>
				</Box>

				<Box marginTop={2}>
					{canGoBack && (
						<Text dimColor>
							Press <Text color="cyan">ESC</Text> to go back
						</Text>
					)}
				</Box>
			</Box>
		);
	}

	if (mode === 'confirm-delete') {
		const repo = repositories[selectedIndex];
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="red">
						⚠️ Confirm Deletion
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text>Are you sure you want to unregister this repository?</Text>
				</Box>

				<Box marginTop={1} marginLeft={2} flexDirection="column">
					<Text>
						Name: <Text color="cyan">{repo.name}</Text>
					</Text>
					<Text>
						Path: <Text color="cyan">{repo.path}</Text>
					</Text>
				</Box>

				<Box marginTop={2}>
					<Text>
						<Text color="green">Y</Text> = Yes, unregister | <Text color="red">N</Text> = No, cancel
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					📦 Registered Repositories
				</Text>
			</Box>

			{deleteSuccess && (
				<Box marginBottom={1}>
					<Text color="green">✓ Repository unregistered successfully</Text>
				</Box>
			)}

			{monorepoToggleSuccess && (
				<Box marginBottom={1}>
					<Text color="green">✓ Monorepo setting updated</Text>
				</Box>
			)}

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>
					{repositories.length} {repositories.length === 1 ? 'repository' : 'repositories'} registered:
				</Text>
				<Box marginLeft={2} flexDirection="column" marginTop={1}>
					{repositories.map((repo, index) => {
						const isSelected = index === selectedIndex;
						return (
							<Box key={repo.path} flexDirection="column" marginBottom={1}>
								<Box>
									<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
										{isSelected ? '❯ ' : '  '}
										{repo.name}
										{repo.isMonorepo && <Text color="magenta"> [monorepo]</Text>}
									</Text>
								</Box>
								<Box marginLeft={2}>
									<Text dimColor>{repo.path}</Text>
								</Box>
								<Box marginLeft={2}>
									<Text dimColor>Registered: {new Date(repo.registeredAt).toLocaleString()}</Text>
								</Box>
							</Box>
						);
					})}
				</Box>
			</Box>

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>
					Use <Text color="cyan">↑/↓</Text> arrows to select
				</Text>
				<Text dimColor>
					Press <Text color="cyan">M</Text> to toggle monorepo mode
				</Text>
				<Text dimColor>
					Press <Text color="cyan">D</Text> or <Text color="cyan">Delete</Text> to unregister selected
					repository
				</Text>
				{canGoBack && (
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				)}
			</Box>
		</Box>
	);
}
