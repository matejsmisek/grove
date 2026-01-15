import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ClaudeSessionServiceToken, SettingsServiceToken } from '../services/tokens.js';
import type {
	ClaudeSessionTemplate,
	ClaudeSessionTemplates,
	ClaudeTerminalType,
} from '../storage/types.js';
import { openExternalEditor } from '../utils/externalEditor.js';

const TERMINAL_DISPLAY_NAMES: Record<ClaudeTerminalType, string> = {
	konsole: 'KDE Konsole',
	kitty: 'Kitty',
};

export function ClaudeTerminalSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const settings = settingsService.readSettings();

	const [selectedIndex, setSelectedIndex] = useState(0);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	const availableTerminals = claudeSessionService.detectAvailableTerminals();
	const allTerminals: ClaudeTerminalType[] = ['konsole', 'kitty'];

	const handleSelectTerminal = (terminalType: ClaudeTerminalType) => {
		settingsService.updateSettings({ selectedClaudeTerminal: terminalType });
		setSavedMessage(`Selected ${TERMINAL_DISPLAY_NAMES[terminalType]} as default terminal`);
		setTimeout(() => setSavedMessage(null), 2000);
	};

	const handleConfigureTemplate = (terminalType: ClaudeTerminalType) => {
		const currentTemplate = claudeSessionService.getEffectiveTemplate(terminalType);

		// Add header comment to help users
		const header = `# ${TERMINAL_DISPLAY_NAMES[terminalType]} Template
# Available variables:
#   \${WORKING_DIR} - Working directory path
#   \${AGENT_COMMAND} - Claude command (claude or claude --resume <id>)
#
# Save and close to apply changes. Leave empty to reset to default.
# Lines starting with # are comments and will be removed.

`;
		const contentToEdit = header + currentTemplate;

		const editedContent = openExternalEditor(contentToEdit, {
			extension: '.txt',
			prefix: `grove-${terminalType}-template-`,
		});

		if (editedContent !== null) {
			// Remove comment lines and trim
			const cleanedContent = editedContent
				.split('\n')
				.filter((line) => !line.startsWith('#'))
				.join('\n')
				.trim();

			const currentTemplates = settings.claudeSessionTemplates || {};

			if (cleanedContent) {
				// Save the template
				const newTemplate: ClaudeSessionTemplate = { content: cleanedContent };
				const newTemplates: ClaudeSessionTemplates = {
					...currentTemplates,
					[terminalType]: newTemplate,
				};
				settingsService.updateSettings({ claudeSessionTemplates: newTemplates });
				setSavedMessage('Template saved');
			} else {
				// Clear the template (reset to default)
				const newTemplates = { ...currentTemplates };
				delete newTemplates[terminalType];
				settingsService.updateSettings({
					claudeSessionTemplates: Object.keys(newTemplates).length > 0 ? newTemplates : undefined,
				});
				setSavedMessage('Template reset to default');
			}
			setTimeout(() => setSavedMessage(null), 2000);
		}
	};

	const handleResetTemplate = (terminalType: ClaudeTerminalType) => {
		const currentTemplates = settings.claudeSessionTemplates || {};
		const newTemplates = { ...currentTemplates };
		delete newTemplates[terminalType];
		settingsService.updateSettings({
			claudeSessionTemplates: Object.keys(newTemplates).length > 0 ? newTemplates : undefined,
		});
		setSavedMessage(`Reset ${TERMINAL_DISPLAY_NAMES[terminalType]} template to default`);
		setTimeout(() => setSavedMessage(null), 2000);
	};

	useInput((input, key) => {
		if (key.escape && canGoBack) {
			goBack();
		} else if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allTerminals.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < allTerminals.length - 1 ? prev + 1 : 0));
		} else if (key.return) {
			handleSelectTerminal(allTerminals[selectedIndex]);
		} else if (input === 'e') {
			handleConfigureTemplate(allTerminals[selectedIndex]);
		} else if (input === 'r') {
			handleResetTemplate(allTerminals[selectedIndex]);
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Claude Terminal Settings
				</Text>
			</Box>

			{savedMessage && (
				<Box marginBottom={1}>
					<Text color="green">{savedMessage}</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>Select your preferred terminal for Claude sessions:</Text>
			</Box>

			{allTerminals.map((terminalType, index) => {
				const isSelected = index === selectedIndex;
				const isCurrent = settings.selectedClaudeTerminal === terminalType;
				const isAvailable = availableTerminals.includes(terminalType);
				const templates = settings.claudeSessionTemplates;
				const hasCustomTemplate = templates ? templates[terminalType] !== undefined : false;

				return (
					<Box key={terminalType}>
						<Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
							{isSelected ? '> ' : '  '}
							{TERMINAL_DISPLAY_NAMES[terminalType]}
							{isCurrent && <Text color="green"> (current)</Text>}
							{hasCustomTemplate && <Text color="yellow"> (custom)</Text>}
							{!isAvailable && <Text dimColor> (not detected)</Text>}
						</Text>
					</Box>
				);
			})}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					<Text color="cyan">Enter</Text> Select default - <Text color="cyan">e</Text> Edit template
					{' - '}
					<Text color="cyan">r</Text> Reset template
				</Text>
				{canGoBack && (
					<Text dimColor>
						<Text color="cyan">ESC</Text> Go back
					</Text>
				)}
			</Box>
		</Box>
	);
}
