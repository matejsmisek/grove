import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import { MultiLineTextInput } from '../components/MultiLineTextInput.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ClaudeSessionServiceToken, SettingsServiceToken } from '../services/tokens.js';
import type {
	ClaudeSessionTemplate,
	ClaudeSessionTemplates,
	ClaudeTerminalType,
} from '../storage/types.js';

// Valid template variables for Claude session templates
const TEMPLATE_VARIABLES = ['WORKING_DIR', 'AGENT_COMMAND'] as const;

type ViewMode = 'select' | 'configure';

const TERMINAL_DISPLAY_NAMES: Record<ClaudeTerminalType, string> = {
	konsole: 'KDE Konsole',
	kitty: 'Kitty',
};

export function ClaudeTerminalSettingsScreen() {
	const { goBack, canGoBack } = useNavigation();
	const claudeSessionService = useService(ClaudeSessionServiceToken);
	const settingsService = useService(SettingsServiceToken);
	const settings = settingsService.readSettings();

	const [viewMode, setViewMode] = useState<ViewMode>('select');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	// For configure mode
	const [configuringTerminal, setConfiguringTerminal] = useState<ClaudeTerminalType | null>(null);
	const [tempTemplate, setTempTemplate] = useState('');

	// Get available terminals
	const availableTerminals = claudeSessionService.detectAvailableTerminals();
	const allTerminals: ClaudeTerminalType[] = ['konsole', 'kitty'];

	// Handle terminal selection
	const handleSelectTerminal = (terminalType: ClaudeTerminalType) => {
		settingsService.updateSettings({ selectedClaudeTerminal: terminalType });
		setSavedMessage(`Selected ${TERMINAL_DISPLAY_NAMES[terminalType]} as default terminal`);
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Start configuring a terminal
	const startConfigure = (terminalType: ClaudeTerminalType) => {
		const template = claudeSessionService.getEffectiveTemplate(terminalType);
		setConfiguringTerminal(terminalType);
		setTempTemplate(template);
		setViewMode('configure');
	};

	// Save custom template
	const saveTemplate = () => {
		if (!configuringTerminal) return;

		const currentTemplates = settings.claudeSessionTemplates || {};
		const newTemplate: ClaudeSessionTemplate = {
			content: tempTemplate,
		};

		// Create new templates object with explicit type
		const newTemplates: ClaudeSessionTemplates = {
			...currentTemplates,
		};
		newTemplates[configuringTerminal] = newTemplate;

		settingsService.updateSettings({
			claudeSessionTemplates: newTemplates,
		});

		setSavedMessage('Template saved');
		setTimeout(() => setSavedMessage(null), 1500);
	};

	useInput(
		(input, key) => {
			if (viewMode === 'select') {
				if (key.escape && canGoBack) {
					goBack();
				} else if (key.upArrow) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : allTerminals.length - 1));
				} else if (key.downArrow) {
					setSelectedIndex((prev) => (prev < allTerminals.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					handleSelectTerminal(allTerminals[selectedIndex]);
				} else if (input === 'c') {
					startConfigure(allTerminals[selectedIndex]);
				}
			}
		},
		{ isActive: viewMode === 'select' }
	);

	// Handle template submission
	const handleSubmitTemplate = () => {
		saveTemplate();
		setViewMode('select');
		setConfiguringTerminal(null);
	};

	// Handle cancel editing
	const handleCancelEdit = () => {
		setViewMode('select');
		setConfiguringTerminal(null);
	};

	// Validate template variables - find any invalid ${...} patterns
	const validateTemplateVariables = (
		template: string
	): { valid: boolean; invalidVars: string[] } => {
		const varPattern = /\$\{([^}]+)\}/g;
		const invalidVars: string[] = [];
		let match;

		while ((match = varPattern.exec(template)) !== null) {
			const varName = match[1];
			if (!TEMPLATE_VARIABLES.includes(varName as (typeof TEMPLATE_VARIABLES)[number])) {
				invalidVars.push(varName);
			}
		}

		return { valid: invalidVars.length === 0, invalidVars };
	};

	if (viewMode === 'configure' && configuringTerminal) {
		const validation = validateTemplateVariables(tempTemplate);

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Configure {TERMINAL_DISPLAY_NAMES[configuringTerminal]} Template
					</Text>
				</Box>

				{savedMessage && (
					<Box marginBottom={1}>
						<Text color="green">{savedMessage}</Text>
					</Box>
				)}

				{/* Variable hints */}
				<Box marginBottom={1} flexDirection="column">
					<Text dimColor>Available variables:</Text>
					<Box marginLeft={2} flexDirection="column">
						<Text>
							<Text color="cyan">${`{WORKING_DIR}`}</Text>
							<Text dimColor> - Working directory path</Text>
						</Text>
						<Text>
							<Text color="cyan">${`{AGENT_COMMAND}`}</Text>
							<Text dimColor> - Claude command (</Text>
							<Text color="gray">claude</Text>
							<Text dimColor> or </Text>
							<Text color="gray">claude --resume id</Text>
							<Text dimColor>)</Text>
						</Text>
					</Box>
				</Box>

				{/* Validation warnings */}
				{!validation.valid && (
					<Box marginBottom={1}>
						<Text color="yellow">
							Unknown variables: {validation.invalidVars.map((v) => `\${${v}}`).join(', ')}
						</Text>
					</Box>
				)}

				<Box flexDirection="column" marginBottom={1} borderStyle="single" padding={1}>
					<MultiLineTextInput
						value={tempTemplate}
						onChange={setTempTemplate}
						onSubmit={handleSubmitTemplate}
						onCancel={handleCancelEdit}
						isActive={true}
						maxVisibleLines={15}
						showLineNumbers={true}
					/>
				</Box>
			</Box>
		);
	}

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
							{hasCustomTemplate && <Text color="yellow"> (custom template)</Text>}
							{!isAvailable && <Text dimColor> (not detected)</Text>}
						</Text>
					</Box>
				);
			})}

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Select -{' '}
					<Text color="cyan">c</Text> Configure Template
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
