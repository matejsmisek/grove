import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { GroveConfigServiceToken, RepositoryServiceToken } from '../services/tokens.js';
import type { Repository } from '../storage/index.js';

type ScreenMode = 'list' | 'repo-menu' | 'confirm-delete';

interface RepoMenuOption {
	key: string;
	label: string;
	action: () => void;
}

export function RepositoriesScreen() {
	const { goBack, canGoBack, navigate } = useNavigation();
	const repositoryService = useService(RepositoryServiceToken);
	const groveConfigService = useService(GroveConfigServiceToken);
	const [repositories, setRepositories] = useState<Repository[]>(() =>
		repositoryService.getAllRepositories()
	);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [menuOptionIndex, setMenuOptionIndex] = useState(0);
	const [mode, setMode] = useState<ScreenMode>('list');
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const selectedRepo = repositories[selectedIndex] || null;

	// Build menu options for selected repository
	const getMenuOptions = (): RepoMenuOption[] => {
		if (!selectedRepo) return [];

		return [
			{
				key: 'config',
				label: 'Edit .grove config',
				action: () => {
					navigate('groveConfigEditor', { repositoryPath: selectedRepo.path });
				},
			},
			{
				key: 'monorepo',
				label: selectedRepo.isMonorepo ? 'Disable monorepo mode' : 'Enable monorepo mode',
				action: () => {
					const newIsMonorepo = !selectedRepo.isMonorepo;
					repositoryService.updateRepository(selectedRepo.path, { isMonorepo: newIsMonorepo });
					setRepositories(repositoryService.getAllRepositories());
					setSuccessMessage(newIsMonorepo ? 'Monorepo mode enabled' : 'Monorepo mode disabled');
					setTimeout(() => setSuccessMessage(null), 2000);
					// Stay on repo menu, don't go back to list
				},
			},
			{
				key: 'delete',
				label: 'Unregister repository',
				action: () => {
					setMode('confirm-delete');
				},
			},
		];
	};

	const menuOptions = getMenuOptions();

	useInput((input, key) => {
		if (key.escape) {
			if (mode === 'confirm-delete') {
				setMode('repo-menu');
			} else if (mode === 'repo-menu') {
				setMode('list');
				setMenuOptionIndex(0);
			} else if (canGoBack) {
				goBack();
			}
		} else if (mode === 'list') {
			if (key.upArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : repositories.length - 1));
			} else if (key.downArrow) {
				setSelectedIndex((prev) => (prev < repositories.length - 1 ? prev + 1 : 0));
			} else if (key.return && repositories.length > 0) {
				setMode('repo-menu');
				setMenuOptionIndex(0);
			}
		} else if (mode === 'repo-menu') {
			if (key.upArrow) {
				setMenuOptionIndex((prev) => (prev > 0 ? prev - 1 : menuOptions.length - 1));
			} else if (key.downArrow) {
				setMenuOptionIndex((prev) => (prev < menuOptions.length - 1 ? prev + 1 : 0));
			} else if (key.return && menuOptions[menuOptionIndex]) {
				menuOptions[menuOptionIndex].action();
			}
		} else if (mode === 'confirm-delete') {
			if (input === 'y' || input === 'Y') {
				const repoToDelete = repositories[selectedIndex];
				const success = repositoryService.removeRepository(repoToDelete.path);
				if (success) {
					const newRepos = repositoryService.getAllRepositories();
					setRepositories(newRepos);
					setSuccessMessage('Repository unregistered successfully');
					setMode('list');
					if (selectedIndex >= newRepos.length) {
						setSelectedIndex(Math.max(0, newRepos.length - 1));
					}
					setTimeout(() => setSuccessMessage(null), 2000);
				}
			} else if (input === 'n' || input === 'N') {
				setMode('repo-menu');
			}
		}
	});

	// Empty state
	if (repositories.length === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Registered Repositories
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

	// Confirm delete view
	if (mode === 'confirm-delete' && selectedRepo) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="red">
						Confirm Deletion
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text>Are you sure you want to unregister this repository?</Text>
				</Box>

				<Box marginTop={1} marginLeft={2} flexDirection="column">
					<Text>
						Name: <Text color="cyan">{selectedRepo.name}</Text>
					</Text>
					<Text>
						Path: <Text color="cyan">{selectedRepo.path}</Text>
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

	// Repository menu view
	if (mode === 'repo-menu' && selectedRepo) {
		const hasGroveConfig = groveConfigService.groveConfigExists(selectedRepo.path);
		const hasLocalConfig = groveConfigService.groveLocalConfigExists(selectedRepo.path);

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						{selectedRepo.name}
					</Text>
					{selectedRepo.isMonorepo && <Text color="magenta"> [monorepo]</Text>}
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>{selectedRepo.path}</Text>
				</Box>

				{(hasGroveConfig || hasLocalConfig) && (
					<Box marginBottom={1}>
						{hasGroveConfig && <Text color="green">.grove.json </Text>}
						{hasLocalConfig && <Text color="yellow">.grove.local.json</Text>}
					</Box>
				)}

				{successMessage && (
					<Box marginBottom={1}>
						<Text color="green">{successMessage}</Text>
					</Box>
				)}

				<Box flexDirection="column" marginTop={1}>
					{menuOptions.map((option, index) => (
						<Box key={option.key}>
							<Text
								color={index === menuOptionIndex ? 'cyan' : undefined}
								bold={index === menuOptionIndex}
							>
								{index === menuOptionIndex ? '> ' : '  '}
								{option.label}
							</Text>
						</Box>
					))}
				</Box>

				<Box marginTop={2} flexDirection="column">
					<Text dimColor>
						<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Select
					</Text>
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				</Box>
			</Box>
		);
	}

	// Repository list view
	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Registered Repositories
				</Text>
			</Box>

			{successMessage && (
				<Box marginBottom={1}>
					<Text color="green">{successMessage}</Text>
				</Box>
			)}

			<Box flexDirection="column" marginTop={1}>
				<Text dimColor>
					{repositories.length} {repositories.length === 1 ? 'repository' : 'repositories'} registered:
				</Text>
				<Box marginLeft={2} flexDirection="column" marginTop={1}>
					{repositories.map((repo, index) => {
						const isSelected = index === selectedIndex;
						const hasGroveConfig = groveConfigService.groveConfigExists(repo.path);
						const hasLocalConfig = groveConfigService.groveLocalConfigExists(repo.path);
						return (
							<Box key={repo.path} flexDirection="column" marginBottom={1}>
								<Box>
									<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
										{isSelected ? '> ' : '  '}
										{repo.name}
										{repo.isMonorepo && <Text color="magenta"> [monorepo]</Text>}
										{hasGroveConfig && <Text color="green"> [.grove.json]</Text>}
										{hasLocalConfig && <Text color="yellow"> [.grove.local.json]</Text>}
									</Text>
								</Box>
								<Box marginLeft={4}>
									<Text dimColor>{repo.path}</Text>
								</Box>
							</Box>
						);
					})}
				</Box>
			</Box>

			<Box marginTop={2} flexDirection="column">
				<Text dimColor>
					<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Select repository
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
