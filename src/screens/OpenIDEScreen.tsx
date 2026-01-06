import React, { useEffect, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import path from 'path';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { getIDEDisplayName, openIDEInPath, resolveIDEForPath } from '../services/index.js';
import { GrovesServiceToken, SettingsServiceToken } from '../services/tokens.js';
import { GroveConfigService } from '../storage/index.js';
import type { IDEConfig, IDEType, Settings, Worktree } from '../storage/types.js';

interface OpenIDEScreenProps {
	groveId: string;
}

type SelectionOption = { type: 'all' } | { type: 'worktree'; worktree: Worktree };

// Singleton instance for GroveConfigService
const groveConfigService = new GroveConfigService();

/**
 * Result of resolving IDE config for a worktree
 */
interface ResolvedWorktreeIDE {
	config: IDEConfig | undefined;
	resolvedType?: IDEType;
}

/**
 * Get the effective IDE config for a worktree
 * Checks .grove.json first (project overrides root), falls back to settings
 * Uses resolveIDEForPath for JetBrains autodetect support when using settings
 * @param worktree - The worktree to get IDE config for
 * @param settings - The user settings (for fallback and IDE configs lookup)
 * @param targetPath - The path to open in IDE (for JetBrains autodetect)
 * @returns The IDE config and resolved type
 */
function getIDEConfigForWorktree(
	worktree: Worktree,
	settings: Settings,
	targetPath: string
): ResolvedWorktreeIDE {
	// Check if the worktree's repository has an IDE config in .grove.json
	const repoIDEConfig = groveConfigService.getIDEConfigForSelection(
		worktree.repositoryPath,
		worktree.projectPath
	);

	if (repoIDEConfig) {
		// If it's a reference to a global IDE type (e.g., "@phpstorm")
		if ('ideType' in repoIDEConfig) {
			const ideType: IDEType = repoIDEConfig.ideType;
			// Use resolveIDEForPath for JetBrains autodetect support
			const { resolvedType, config } = resolveIDEForPath(ideType, targetPath, settings.ideConfigs);
			return { config, resolvedType };
		}
		// If it's a custom IDE config
		return { config: repoIDEConfig.ideConfig };
	}

	// Fall back to the default IDE from settings
	if (!settings.selectedIDE) {
		return { config: undefined };
	}
	// Use resolveIDEForPath for JetBrains autodetect support
	const { resolvedType, config } = resolveIDEForPath(
		settings.selectedIDE,
		targetPath,
		settings.ideConfigs
	);
	return { config, resolvedType };
}

export function OpenIDEScreen({ groveId }: OpenIDEScreenProps) {
	const { goBack } = useNavigation();
	const grovesService = useService(GrovesServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const [loading, setLoading] = useState(true);
	const [groveName, setGroveName] = useState('');
	const [worktrees, setWorktrees] = useState<Worktree[]>([]);
	const [settings, setSettings] = useState<Settings | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [resultMessage, setResultMessage] = useState<string | null>(null);

	// Build selection options: "All" + individual worktrees
	const options: SelectionOption[] =
		worktrees.length > 1
			? [
					{ type: 'all' as const },
					...worktrees.map((wt) => ({ type: 'worktree' as const, worktree: wt })),
				]
			: worktrees.map((wt) => ({ type: 'worktree' as const, worktree: wt }));

	useEffect(() => {
		// Read settings
		const currentSettings = settingsService.readSettings();
		setSettings(currentSettings);

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

		if (metadata.worktrees.length === 0) {
			setError('No worktrees found in this grove');
			setLoading(false);
			return;
		}

		// If only one worktree, open IDE directly
		if (metadata.worktrees.length === 1) {
			const worktree = metadata.worktrees[0];
			const targetPath = getWorktreePath(worktree);
			// Get the IDE config for this specific worktree (may be from .grove.json)
			const { config } = getIDEConfigForWorktree(worktree, currentSettings, targetPath);
			if (!config) {
				setError('No IDE configured. Please configure an IDE in Settings or .grove.json.');
				setLoading(false);
				return;
			}
			const result = openIDEInPath(targetPath, config);
			if (result.success) {
				goBack();
			} else {
				setError(result.message);
				setLoading(false);
			}
			return;
		}

		// Multiple worktrees - show selection
		setWorktrees(metadata.worktrees);
		setLoading(false);
	}, [groveId, goBack]);

	/**
	 * Get the path to open in IDE for a worktree
	 * For monorepos, returns the project folder path
	 */
	const getWorktreePath = (worktree: Worktree): string => {
		if (worktree.projectPath) {
			return path.join(worktree.worktreePath, worktree.projectPath);
		}
		return worktree.worktreePath;
	};

	const handleSelectAll = () => {
		if (!settings) {
			setError('Settings not loaded');
			return;
		}

		let successCount = 0;
		let failedCount = 0;

		for (const worktree of worktrees) {
			const targetPath = getWorktreePath(worktree);
			// Get the IDE config for each worktree (may differ based on .grove.json)
			const { config } = getIDEConfigForWorktree(worktree, settings, targetPath);
			if (!config) {
				failedCount++;
				continue;
			}
			const result = openIDEInPath(targetPath, config);
			if (result.success) {
				successCount++;
			} else {
				failedCount++;
			}
		}

		if (failedCount === 0) {
			setResultMessage(`Opened ${successCount} worktrees in IDE`);
		} else {
			setResultMessage(`Opened ${successCount} worktrees, ${failedCount} failed`);
		}
		// Go back after a short delay to show the message
		setTimeout(() => goBack(), 500);
	};

	const handleSelectWorktree = (worktree: Worktree) => {
		if (!settings) {
			setError('Settings not loaded');
			return;
		}

		const targetPath = getWorktreePath(worktree);
		// Get the IDE config for this worktree (may be from .grove.json)
		const { config, resolvedType } = getIDEConfigForWorktree(worktree, settings, targetPath);
		if (!config) {
			setError('No IDE configured. Please configure an IDE in Settings or .grove.json.');
			return;
		}
		const result = openIDEInPath(targetPath, config);
		if (result.success) {
			const ideName = resolvedType ? getIDEDisplayName(resolvedType) : 'IDE';
			setResultMessage(`Opened ${ideName} in ${worktree.repositoryName}`);
			// Go back after a short delay to show the message
			setTimeout(() => goBack(), 500);
		} else {
			setError(result.message);
		}
	};

	const handleSelect = (option: SelectionOption) => {
		if (option.type === 'all') {
			handleSelectAll();
		} else {
			handleSelectWorktree(option.worktree);
		}
	};

	useInput(
		(input, key) => {
			if (key.escape) {
				goBack();
			} else if (key.upArrow) {
				setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
			} else if (key.downArrow) {
				setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
			} else if (key.return) {
				handleSelect(options[selectedIndex]);
			}
		},
		{ isActive: !loading && !error && !resultMessage }
	);

	// Handle any key to go back on error
	useInput(
		() => {
			goBack();
		},
		{ isActive: !!error }
	);

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Loading worktrees...</Text>
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

	if (resultMessage) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="green">{resultMessage}</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>Open in IDE: {groveName}</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Select worktree(s) to open:</Text>
			</Box>

			{options.map((option, index) => (
				<Box key={option.type === 'all' ? 'all' : option.worktree.worktreePath}>
					<Text color={selectedIndex === index ? 'cyan' : undefined}>
						{selectedIndex === index ? '> ' : '  '}
						{option.type === 'all' ? (
							<Text bold>Open All ({worktrees.length} worktrees)</Text>
						) : (
							<>
								{option.worktree.repositoryName}
								{option.worktree.projectPath && <Text dimColor> / {option.worktree.projectPath}</Text>}
								<Text dimColor> ({option.worktree.branch})</Text>
							</>
						)}
					</Text>
				</Box>
			))}

			<Box marginTop={1}>
				<Text dimColor>Up/Down Navigate - Enter Select - ESC Cancel</Text>
			</Box>
		</Box>
	);
}
