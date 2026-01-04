import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { useNavigation } from '../navigation/useNavigation.js';
import {
	ALL_IDE_TYPES,
	detectAvailableIDEs,
	getDefaultIDEConfig,
	getIDEDisplayName,
} from '../services/index.js';
import { readSettings, updateSettings } from '../storage/index.js';
import type { IDEConfig, IDEType } from '../storage/index.js';

type ViewMode = 'select' | 'configure';

export function IDESettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const settings = readSettings();

	const [viewMode, setViewMode] = useState<ViewMode>('select');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	// For configure mode
	const [configuringIDE, setConfiguringIDE] = useState<IDEType | null>(null);
	const [editingField, setEditingField] = useState<'command' | 'args' | null>(null);
	const [tempCommand, setTempCommand] = useState('');
	const [tempArgs, setTempArgs] = useState('');

	const availableIDEs = detectAvailableIDEs();

	// Get the current config for an IDE
	const getIDEConfig = (ideType: IDEType): IDEConfig => {
		if (settings.ideConfigs && settings.ideConfigs[ideType]) {
			return settings.ideConfigs[ideType]!;
		}
		return getDefaultIDEConfig(ideType);
	};

	// Handle IDE selection
	const handleSelectIDE = (ideType: IDEType) => {
		updateSettings({ selectedIDE: ideType });
		setSavedMessage(`Selected ${getIDEDisplayName(ideType)} as default IDE`);
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Start configuring an IDE
	const startConfigure = (ideType: IDEType) => {
		const config = getIDEConfig(ideType);
		setConfiguringIDE(ideType);
		setTempCommand(config.command);
		setTempArgs(config.args.join(' '));
		setViewMode('configure');
		setEditingField(null);
	};

	// Save custom configuration
	const saveConfiguration = () => {
		if (!configuringIDE) return;

		const newConfig: IDEConfig = {
			command: tempCommand,
			args: tempArgs.split(' ').filter((a) => a.length > 0),
		};

		const currentConfigs = settings.ideConfigs || {};
		updateSettings({
			ideConfigs: {
				...currentConfigs,
				[configuringIDE]: newConfig,
			},
		});

		setSavedMessage(`Saved configuration for ${getIDEDisplayName(configuringIDE)}`);
		setTimeout(() => setSavedMessage(null), 2000);
		setViewMode('select');
		setConfiguringIDE(null);
		setEditingField(null);
	};

	// Reset to default configuration
	const resetToDefault = () => {
		if (!configuringIDE) return;

		const currentConfigs = settings.ideConfigs || {};
		const newConfigs = { ...currentConfigs };
		delete newConfigs[configuringIDE];

		updateSettings({ ideConfigs: newConfigs });

		const defaultConfig = getDefaultIDEConfig(configuringIDE);
		setTempCommand(defaultConfig.command);
		setTempArgs(defaultConfig.args.join(' '));

		setSavedMessage(`Reset ${getIDEDisplayName(configuringIDE)} to default`);
		setTimeout(() => setSavedMessage(null), 2000);
	};

	useInput(
		(input, key) => {
			if (viewMode === 'select') {
				if (key.escape && canGoBack) {
					goBack();
				} else if (key.upArrow) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : ALL_IDE_TYPES.length - 1));
				} else if (key.downArrow) {
					setSelectedIndex((prev) => (prev < ALL_IDE_TYPES.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					handleSelectIDE(ALL_IDE_TYPES[selectedIndex]);
				} else if (input === 'c') {
					startConfigure(ALL_IDE_TYPES[selectedIndex]);
				}
			} else if (viewMode === 'configure' && editingField === null) {
				if (key.escape) {
					setViewMode('select');
					setConfiguringIDE(null);
				} else if (input === '1') {
					setEditingField('command');
				} else if (input === '2') {
					setEditingField('args');
				} else if (input === 's') {
					saveConfiguration();
				} else if (input === 'r') {
					resetToDefault();
				}
			}
		},
		{ isActive: editingField === null }
	);

	// Handle text input submission
	const handleSubmitCommand = () => {
		setEditingField(null);
	};

	const handleSubmitArgs = () => {
		setEditingField(null);
	};

	if (viewMode === 'configure' && configuringIDE) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Configure {getIDEDisplayName(configuringIDE)}
					</Text>
				</Box>

				{savedMessage && (
					<Box marginBottom={1}>
						<Text color="green">{savedMessage}</Text>
					</Box>
				)}

				<Box flexDirection="column" marginBottom={1}>
					<Box>
						<Text dimColor>1. </Text>
						<Text bold={editingField === 'command'}>Command: </Text>
						{editingField === 'command' ? (
							<TextInput value={tempCommand} onChange={setTempCommand} onSubmit={handleSubmitCommand} />
						) : (
							<Text color="cyan">{tempCommand}</Text>
						)}
					</Box>
					<Box marginTop={1}>
						<Text dimColor>2. </Text>
						<Text bold={editingField === 'args'}>Arguments: </Text>
						{editingField === 'args' ? (
							<TextInput value={tempArgs} onChange={setTempArgs} onSubmit={handleSubmitArgs} />
						) : (
							<Text color="cyan">{tempArgs || '(none)'}</Text>
						)}
					</Box>
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>
						Use <Text color="cyan">{'{path}'}</Text> as placeholder for the directory path
					</Text>
					<Text dimColor>
						Example: <Text color="gray">code {'{path}'}</Text> or <Text color="gray">vim {'{path}'}</Text>
					</Text>
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>
						Press <Text color="cyan">1</Text> to edit command, <Text color="cyan">2</Text> to edit args
					</Text>
					<Text dimColor>
						Press <Text color="cyan">s</Text> to save, <Text color="cyan">r</Text> to reset to default
					</Text>
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					IDE Settings
				</Text>
			</Box>

			{savedMessage && (
				<Box marginBottom={1}>
					<Text color="green">{savedMessage}</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>Select your preferred IDE:</Text>
			</Box>

			{ALL_IDE_TYPES.map((ideType, index) => {
				const isSelected = index === selectedIndex;
				const isCurrent = settings.selectedIDE === ideType;
				const isAvailable = availableIDEs.includes(ideType);
				const hasCustomConfig = settings.ideConfigs && settings.ideConfigs[ideType];

				return (
					<Box key={ideType}>
						<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
							{isSelected ? '> ' : '  '}
							{getIDEDisplayName(ideType)}
							{isCurrent && <Text color="green"> (current)</Text>}
							{hasCustomConfig && <Text color="yellow"> (custom)</Text>}
							{!isAvailable && <Text dimColor> (not detected)</Text>}
						</Text>
					</Box>
				);
			})}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Select -{' '}
					<Text color="cyan">c</Text> Configure
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
