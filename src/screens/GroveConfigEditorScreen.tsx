import React, { useState } from 'react';

import { Box, Text, useInput } from 'ink';

import TextInput from 'ink-text-input';

import { MultiLineTextInput } from '../components/MultiLineTextInput.js';
import { useService } from '../di/index.js';
import { getMonorepoProjects } from '../git/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import { ALL_IDE_TYPES, getIDEDisplayName } from '../services/index.js';
import { GroveConfigServiceToken, RepositoryServiceToken } from '../services/tokens.js';
import type { GroveRepoConfig, Repository } from '../storage/types.js';

// Valid template variables
const BRANCH_TEMPLATE_VARIABLES = ['GROVE_NAME'] as const;
const CLAUDE_TEMPLATE_VARIABLES = ['WORKING_DIR', 'AGENT_COMMAND'] as const;

type ViewMode =
	| 'selectRepo'
	| 'selectConfigLocation'
	| 'selectConfigFile'
	| 'editConfig'
	| 'editField'
	| 'editListItem'
	| 'selectIDE';

type ConfigFileType = 'grove' | 'groveLocal';

interface ConfigLocation {
	projectPath?: string; // undefined means root config
}

interface GroveConfigEditorScreenProps {
	repositoryPath?: string; // Optional pre-selected repository
}

// Config field definitions
type ConfigFieldKey =
	| 'branchNameTemplate'
	| 'fileCopyPatterns'
	| 'initActions'
	| 'ide'
	| 'claudeSessionTemplates';

interface ConfigField {
	key: ConfigFieldKey;
	label: string;
	type: 'string' | 'stringArray' | 'ide' | 'claudeTemplates';
	hint?: string;
}

const CONFIG_FIELDS: ConfigField[] = [
	{
		key: 'branchNameTemplate',
		label: 'Branch Name Template',
		type: 'string',
		hint: 'Use ${GROVE_NAME} placeholder. Example: grove/${GROVE_NAME}',
	},
	{
		key: 'fileCopyPatterns',
		label: 'File Copy Patterns',
		type: 'stringArray',
		hint: 'Glob patterns to copy from repo to worktree',
	},
	{
		key: 'initActions',
		label: 'Init Actions',
		type: 'stringArray',
		hint: 'Commands to run after worktree creation',
	},
	{
		key: 'ide',
		label: 'IDE',
		type: 'ide',
		hint: 'IDE to use for this repo (@vscode, @phpstorm, etc.)',
	},
	{
		key: 'claudeSessionTemplates',
		label: 'Claude Session Templates',
		type: 'claudeTemplates',
		hint: 'Custom terminal templates for Claude sessions',
	},
];

export function GroveConfigEditorScreen({ repositoryPath }: GroveConfigEditorScreenProps) {
	const { goBack, canGoBack } = useNavigation();
	const repositoryService = useService(RepositoryServiceToken);
	const groveConfigService = useService(GroveConfigServiceToken);

	// State
	const [viewMode, setViewMode] = useState<ViewMode>(
		repositoryPath ? 'selectConfigLocation' : 'selectRepo'
	);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	// Repository selection
	const [repositories] = useState<Repository[]>(() => repositoryService.getAllRepositories());
	const [selectedRepo, setSelectedRepo] = useState<Repository | null>(() =>
		repositoryPath ? (repositories.find((r) => r.path === repositoryPath) ?? null) : null
	);

	// Config location (root or project folder for monorepos)
	const [configLocation, setConfigLocation] = useState<ConfigLocation>({});
	const [configLocations, setConfigLocations] = useState<ConfigLocation[]>([]);

	// Config file type (.grove.json or .grove.local.json)
	const [configFileType, setConfigFileType] = useState<ConfigFileType>('grove');

	// Config data
	const [config, setConfig] = useState<GroveRepoConfig>({});

	// Field editing
	const [editingFieldIndex, setEditingFieldIndex] = useState(0);
	const [editingField, setEditingField] = useState<ConfigFieldKey | null>(null);
	const [tempValue, setTempValue] = useState('');
	const [editingListIndex, setEditingListIndex] = useState(-1); // -1 = adding new item

	// Load config locations for selected repo
	const loadConfigLocations = (repo: Repository) => {
		const locations: ConfigLocation[] = [{ projectPath: undefined }]; // Root config

		if (repo.isMonorepo) {
			// Get projects with existing .grove.json
			const projectsWithConfig = groveConfigService.getProjectsWithGroveConfig(repo.path);
			for (const projectPath of projectsWithConfig) {
				locations.push({ projectPath });
			}

			// Also get all monorepo projects (for creating new configs)
			const allProjects = getMonorepoProjects(repo.path);
			for (const projectPath of allProjects) {
				if (!locations.find((l) => l.projectPath === projectPath)) {
					locations.push({ projectPath });
				}
			}
		}

		setConfigLocations(locations);
	};

	// Load config for selected location
	const loadConfig = (location: ConfigLocation, fileType: ConfigFileType) => {
		if (!selectedRepo) return;

		const loadedConfig =
			fileType === 'grove'
				? groveConfigService.readGroveConfigOnly(selectedRepo.path, location.projectPath)
				: groveConfigService.readGroveLocalConfigOnly(selectedRepo.path, location.projectPath);

		setConfig(loadedConfig);
	};

	// Save config
	const saveConfig = () => {
		if (!selectedRepo) return;

		if (configFileType === 'grove') {
			groveConfigService.writeGroveConfig(selectedRepo.path, config, configLocation.projectPath);
		} else {
			groveConfigService.writeGroveLocalConfig(selectedRepo.path, config, configLocation.projectPath);
		}

		setSavedMessage('Configuration saved');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Get display value for a field
	const getFieldDisplayValue = (field: ConfigField): string => {
		const value = config[field.key];

		if (value === undefined || value === null) {
			return '(not set)';
		}

		switch (field.type) {
			case 'string':
				return String(value) || '(empty)';
			case 'stringArray':
				return Array.isArray(value) && value.length > 0 ? `[${value.length} items]` : '(empty)';
			case 'ide':
				if (typeof value === 'string' && value.startsWith('@')) {
					return value;
				}
				if (typeof value === 'object' && 'command' in value) {
					return `Custom: ${value.command}`;
				}
				return '(not set)';
			case 'claudeTemplates':
				if (typeof value === 'object' && value !== null) {
					const keys = Object.keys(value);
					return keys.length > 0 ? `[${keys.join(', ')}]` : '(empty)';
				}
				return '(not set)';
			default:
				return String(value);
		}
	};

	// Validate template
	const validateTemplate = (
		template: string,
		type: 'branch' | 'claude'
	): { valid: boolean; message?: string } => {
		if (!template) return { valid: true };

		const validVars = type === 'branch' ? BRANCH_TEMPLATE_VARIABLES : CLAUDE_TEMPLATE_VARIABLES;
		const varPattern = /\$\{([^}]+)\}/g;
		const invalidVars: string[] = [];
		let match;

		while ((match = varPattern.exec(template)) !== null) {
			const varName = match[1];
			if (!validVars.includes(varName as never)) {
				invalidVars.push(varName);
			}
		}

		if (invalidVars.length > 0) {
			return {
				valid: false,
				message: `Unknown variables: ${invalidVars.map((v) => `\${${v}}`).join(', ')}`,
			};
		}

		if (type === 'branch' && !template.includes('${GROVE_NAME}')) {
			return { valid: false, message: 'Branch template must contain ${GROVE_NAME}' };
		}

		return { valid: true };
	};

	// Input handler
	useInput(
		(input, key) => {
			if (viewMode === 'selectRepo') {
				if (key.escape && canGoBack) {
					goBack();
				} else if (key.upArrow) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : repositories.length - 1));
				} else if (key.downArrow) {
					setSelectedIndex((prev) => (prev < repositories.length - 1 ? prev + 1 : 0));
				} else if (key.return && repositories.length > 0) {
					const repo = repositories[selectedIndex];
					setSelectedRepo(repo);
					loadConfigLocations(repo);
					setSelectedIndex(0);
					setViewMode('selectConfigLocation');
				}
			} else if (viewMode === 'selectConfigLocation') {
				if (key.escape) {
					setViewMode('selectRepo');
					setSelectedIndex(0);
				} else if (key.upArrow) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : configLocations.length - 1));
				} else if (key.downArrow) {
					setSelectedIndex((prev) => (prev < configLocations.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					setConfigLocation(configLocations[selectedIndex]);
					setSelectedIndex(0);
					setViewMode('selectConfigFile');
				}
			} else if (viewMode === 'selectConfigFile') {
				if (key.escape) {
					setViewMode('selectConfigLocation');
					setSelectedIndex(0);
				} else if (key.upArrow || key.downArrow) {
					setSelectedIndex((prev) => (prev === 0 ? 1 : 0));
				} else if (key.return) {
					const fileType = selectedIndex === 0 ? 'grove' : 'groveLocal';
					setConfigFileType(fileType);
					loadConfig(configLocation, fileType);
					setSelectedIndex(0);
					setEditingFieldIndex(0);
					setViewMode('editConfig');
				}
			} else if (viewMode === 'editConfig') {
				if (key.escape) {
					setViewMode('selectConfigFile');
					setSelectedIndex(0);
				} else if (key.upArrow) {
					setEditingFieldIndex((prev) => (prev > 0 ? prev - 1 : CONFIG_FIELDS.length - 1));
				} else if (key.downArrow) {
					setEditingFieldIndex((prev) => (prev < CONFIG_FIELDS.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					const field = CONFIG_FIELDS[editingFieldIndex];
					startEditField(field);
				} else if (input === 'd' || key.delete) {
					// Delete/clear field
					const field = CONFIG_FIELDS[editingFieldIndex];
					const newConfig = { ...config };
					delete newConfig[field.key];
					setConfig(newConfig);
					saveConfig();
				} else if (input === 's') {
					saveConfig();
				}
			} else if (viewMode === 'selectIDE') {
				if (key.escape) {
					setViewMode('editConfig');
				} else if (key.upArrow) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : ALL_IDE_TYPES.length));
				} else if (key.downArrow) {
					setSelectedIndex((prev) => (prev < ALL_IDE_TYPES.length ? prev + 1 : 0));
				} else if (key.return) {
					if (selectedIndex === ALL_IDE_TYPES.length) {
						// Clear IDE
						const newConfig = { ...config };
						delete newConfig.ide;
						setConfig(newConfig);
					} else {
						const ideType = ALL_IDE_TYPES[selectedIndex];
						setConfig({ ...config, ide: `@${ideType}` });
					}
					saveConfig();
					setViewMode('editConfig');
				}
			}
		},
		{ isActive: editingField === null && viewMode !== 'editField' && viewMode !== 'editListItem' }
	);

	// Start editing a field
	const startEditField = (field: ConfigField) => {
		setEditingField(field.key);

		switch (field.type) {
			case 'string':
				setTempValue(String(config[field.key] || ''));
				setViewMode('editField');
				break;
			case 'stringArray':
				setSelectedIndex(0);
				setEditingListIndex(-1);
				setViewMode('editListItem');
				break;
			case 'ide':
				setSelectedIndex(0);
				setViewMode('selectIDE');
				break;
			case 'claudeTemplates':
				// For now, show a message that this should be edited via Claude Terminal Settings
				setSavedMessage('Edit Claude templates in Claude Terminal Settings');
				setTimeout(() => setSavedMessage(null), 3000);
				setEditingField(null);
				break;
		}
	};

	// Handle string field submission
	const handleStringSubmit = () => {
		if (editingField) {
			const field = CONFIG_FIELDS.find((f) => f.key === editingField);
			if (field && field.key === 'branchNameTemplate') {
				const validation = validateTemplate(tempValue, 'branch');
				if (!validation.valid) {
					setSavedMessage(validation.message || 'Invalid template');
					setTimeout(() => setSavedMessage(null), 3000);
					return;
				}
			}

			if (tempValue) {
				setConfig({ ...config, [editingField]: tempValue });
			} else {
				const newConfig = { ...config };
				delete newConfig[editingField];
				setConfig(newConfig);
			}
			saveConfig();
		}
		setEditingField(null);
		setViewMode('editConfig');
	};

	// Handle string field cancel
	const handleStringCancel = () => {
		setEditingField(null);
		setViewMode('editConfig');
	};

	// Render repository selection
	if (viewMode === 'selectRepo') {
		if (repositories.length === 0) {
			return (
				<Box flexDirection="column" padding={1}>
					<Box marginBottom={1}>
						<Text bold color="yellow">
							Grove Config Editor
						</Text>
					</Box>
					<Text dimColor>No repositories registered. Register a repository first.</Text>
					{canGoBack && (
						<Box marginTop={1}>
							<Text dimColor>
								Press <Text color="cyan">ESC</Text> to go back
							</Text>
						</Box>
					)}
				</Box>
			);
		}

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Grove Config Editor - Select Repository
					</Text>
				</Box>

				<Box flexDirection="column" marginTop={1}>
					{repositories.map((repo, index) => (
						<Box key={repo.path} flexDirection="column" marginBottom={1}>
							<Text color={index === selectedIndex ? 'cyan' : undefined} bold={index === selectedIndex}>
								{index === selectedIndex ? '> ' : '  '}
								{repo.name}
								{repo.isMonorepo && <Text color="magenta"> [monorepo]</Text>}
							</Text>
							<Box marginLeft={4}>
								<Text dimColor>{repo.path}</Text>
							</Box>
						</Box>
					))}
				</Box>

				<Box marginTop={1} flexDirection="column">
					<Text dimColor>
						<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Select
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

	// Render config location selection (for monorepos)
	if (viewMode === 'selectConfigLocation') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Grove Config Editor - {selectedRepo?.name}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>Select configuration location:</Text>
				</Box>

				<Box flexDirection="column">
					{configLocations.map((location, index) => {
						const hasGroveConfig = selectedRepo
							? groveConfigService.groveConfigExists(selectedRepo.path, location.projectPath)
							: false;
						const hasLocalConfig = selectedRepo
							? groveConfigService.groveLocalConfigExists(selectedRepo.path, location.projectPath)
							: false;

						return (
							<Box key={location.projectPath ?? 'root'}>
								<Text color={index === selectedIndex ? 'cyan' : undefined} bold={index === selectedIndex}>
									{index === selectedIndex ? '> ' : '  '}
									{location.projectPath ?? '(root)'}
									{hasGroveConfig && <Text color="green"> .grove.json</Text>}
									{hasLocalConfig && <Text color="yellow"> .grove.local.json</Text>}
								</Text>
							</Box>
						);
					})}
				</Box>

				<Box marginTop={1} flexDirection="column">
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

	// Render config file type selection
	if (viewMode === 'selectConfigFile') {
		const locationName = configLocation.projectPath ?? '(root)';
		const hasGroveConfig = selectedRepo
			? groveConfigService.groveConfigExists(selectedRepo.path, configLocation.projectPath)
			: false;
		const hasLocalConfig = selectedRepo
			? groveConfigService.groveLocalConfigExists(selectedRepo.path, configLocation.projectPath)
			: false;

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Grove Config Editor - {selectedRepo?.name}/{locationName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>Select config file to edit:</Text>
				</Box>

				<Box flexDirection="column">
					<Text color={selectedIndex === 0 ? 'cyan' : undefined} bold={selectedIndex === 0}>
						{selectedIndex === 0 ? '> ' : '  '}
						.grove.json
						{hasGroveConfig ? <Text color="green"> (exists)</Text> : <Text dimColor> (new)</Text>}
					</Text>
					<Box marginLeft={4}>
						<Text dimColor>Shared config (commit to repo)</Text>
					</Box>

					<Box marginTop={1}>
						<Text color={selectedIndex === 1 ? 'cyan' : undefined} bold={selectedIndex === 1}>
							{selectedIndex === 1 ? '> ' : '  '}
							.grove.local.json
							{hasLocalConfig ? <Text color="green"> (exists)</Text> : <Text dimColor> (new)</Text>}
						</Text>
					</Box>
					<Box marginLeft={4}>
						<Text dimColor>Local overrides (gitignored)</Text>
					</Box>
				</Box>

				<Box marginTop={1} flexDirection="column">
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

	// Render IDE selection
	if (viewMode === 'selectIDE') {
		const currentIDE = config.ide;

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Select IDE
					</Text>
				</Box>

				<Box flexDirection="column">
					{ALL_IDE_TYPES.map((ideType, index) => {
						const isCurrent =
							currentIDE === `@${ideType}` || (typeof currentIDE === 'object' && index === 0);

						return (
							<Text
								key={ideType}
								color={index === selectedIndex ? 'cyan' : undefined}
								bold={index === selectedIndex}
							>
								{index === selectedIndex ? '> ' : '  '}
								{getIDEDisplayName(ideType)} (@{ideType})
								{isCurrent && <Text color="green"> (current)</Text>}
							</Text>
						);
					})}
					<Text
						color={selectedIndex === ALL_IDE_TYPES.length ? 'cyan' : undefined}
						bold={selectedIndex === ALL_IDE_TYPES.length}
					>
						{selectedIndex === ALL_IDE_TYPES.length ? '> ' : '  '}
						(clear)
					</Text>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>
						<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Select -{' '}
						<Text color="cyan">ESC</Text> Cancel
					</Text>
				</Box>
			</Box>
		);
	}

	// Render list item editing (for stringArray fields)
	if (viewMode === 'editListItem' && editingField) {
		const field = CONFIG_FIELDS.find((f) => f.key === editingField);
		const items = (config[editingField] as string[] | undefined) || [];

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Edit {field?.label}
					</Text>
				</Box>

				{field?.hint && (
					<Box marginBottom={1}>
						<Text dimColor>{field.hint}</Text>
					</Box>
				)}

				{savedMessage && (
					<Box marginBottom={1}>
						<Text color="green">{savedMessage}</Text>
					</Box>
				)}

				<Box flexDirection="column" marginBottom={1}>
					{items.map((item, index) => (
						<Box key={index}>
							{editingListIndex === index ? (
								<Box>
									<Text color="cyan">{index + 1}. </Text>
									<TextInput
										value={tempValue}
										onChange={setTempValue}
										onSubmit={() => {
											if (tempValue) {
												const newItems = [...items];
												newItems[index] = tempValue;
												setConfig({ ...config, [editingField]: newItems });
												saveConfig();
											}
											setEditingListIndex(-1);
											setTempValue('');
										}}
									/>
								</Box>
							) : (
								<Text color={index === selectedIndex ? 'cyan' : undefined} bold={index === selectedIndex}>
									{index === selectedIndex ? '> ' : '  '}
									{index + 1}. {item}
								</Text>
							)}
						</Box>
					))}

					{/* Add new item */}
					{editingListIndex === -1 && (
						<Box marginTop={1}>
							<Text color={selectedIndex === items.length ? 'cyan' : undefined}>
								{selectedIndex === items.length ? '> ' : '  '}+ Add new item
							</Text>
						</Box>
					)}

					{editingListIndex === items.length && (
						<Box marginTop={1}>
							<Text color="cyan">+ </Text>
							<TextInput
								value={tempValue}
								onChange={setTempValue}
								onSubmit={() => {
									if (tempValue) {
										const newItems = [...items, tempValue];
										setConfig({ ...config, [editingField]: newItems });
										saveConfig();
									}
									setEditingListIndex(-1);
									setTempValue('');
								}}
							/>
						</Box>
					)}
				</Box>

				<ListEditControls
					items={items}
					selectedIndex={selectedIndex}
					editingListIndex={editingListIndex}
					onNavigate={(delta) => {
						if (editingListIndex === -1) {
							setSelectedIndex((prev) => {
								const max = items.length;
								const next = prev + delta;
								if (next < 0) return max;
								if (next > max) return 0;
								return next;
							});
						}
					}}
					onEdit={() => {
						if (editingListIndex === -1) {
							if (selectedIndex < items.length) {
								setTempValue(items[selectedIndex]);
								setEditingListIndex(selectedIndex);
							} else {
								setTempValue('');
								setEditingListIndex(items.length);
							}
						}
					}}
					onDelete={() => {
						if (editingListIndex === -1 && selectedIndex < items.length) {
							const newItems = items.filter((_, i) => i !== selectedIndex);
							setConfig({
								...config,
								[editingField]: newItems.length > 0 ? newItems : undefined,
							});
							saveConfig();
							if (selectedIndex >= newItems.length && selectedIndex > 0) {
								setSelectedIndex(selectedIndex - 1);
							}
						}
					}}
					onCancel={() => {
						if (editingListIndex !== -1) {
							setEditingListIndex(-1);
							setTempValue('');
						} else {
							setEditingField(null);
							setViewMode('editConfig');
						}
					}}
				/>
			</Box>
		);
	}

	// Render string field editing
	if (viewMode === 'editField' && editingField) {
		const field = CONFIG_FIELDS.find((f) => f.key === editingField);
		const validation =
			field?.key === 'branchNameTemplate' ? validateTemplate(tempValue, 'branch') : { valid: true };

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Edit {field?.label}
					</Text>
				</Box>

				{field?.hint && (
					<Box marginBottom={1}>
						<Text dimColor>{field.hint}</Text>
					</Box>
				)}

				{field?.key === 'branchNameTemplate' && (
					<Box marginBottom={1} flexDirection="column">
						<Text dimColor>Available variables:</Text>
						<Box marginLeft={2}>
							<Text>
								<Text color="cyan">${`{GROVE_NAME}`}</Text>
								<Text dimColor> - Name of the grove (required)</Text>
							</Text>
						</Box>
					</Box>
				)}

				{!validation.valid && (
					<Box marginBottom={1}>
						<Text color="yellow">{validation.message}</Text>
					</Box>
				)}

				{savedMessage && (
					<Box marginBottom={1}>
						<Text color="green">{savedMessage}</Text>
					</Box>
				)}

				<Box borderStyle="single" padding={1}>
					{field?.key === 'branchNameTemplate' ? (
						<TextInput
							value={tempValue}
							onChange={setTempValue}
							onSubmit={handleStringSubmit}
							placeholder="grove/${GROVE_NAME}"
						/>
					) : (
						<MultiLineTextInput
							value={tempValue}
							onChange={setTempValue}
							onSubmit={handleStringSubmit}
							onCancel={handleStringCancel}
							maxVisibleLines={10}
						/>
					)}
				</Box>

				{field?.key === 'branchNameTemplate' && (
					<Box marginTop={1}>
						<Text dimColor>
							Press <Text color="cyan">Enter</Text> to save, <Text color="cyan">ESC</Text> to cancel
						</Text>
					</Box>
				)}
			</Box>
		);
	}

	// Render config editing
	const locationName = configLocation.projectPath ?? '(root)';
	const fileName = configFileType === 'grove' ? '.grove.json' : '.grove.local.json';

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Grove Config Editor - {selectedRepo?.name}/{locationName}/{fileName}
				</Text>
			</Box>

			{savedMessage && (
				<Box marginBottom={1}>
					<Text color="green">{savedMessage}</Text>
				</Box>
			)}

			<Box flexDirection="column" marginBottom={1}>
				{CONFIG_FIELDS.map((field, index) => (
					<Box key={field.key} flexDirection="column" marginBottom={1}>
						<Box>
							<Text
								color={index === editingFieldIndex ? 'cyan' : undefined}
								bold={index === editingFieldIndex}
							>
								{index === editingFieldIndex ? '> ' : '  '}
								{field.label}:
							</Text>
						</Box>
						<Box marginLeft={4}>
							<Text color="gray">{getFieldDisplayValue(field)}</Text>
						</Box>
					</Box>
				))}
			</Box>

			<Box marginTop={1} flexDirection="column">
				<Text dimColor>
					<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Edit -{' '}
					<Text color="cyan">d</Text> Delete field
				</Text>
				<Text dimColor>
					<Text color="cyan">s</Text> Save - <Text color="cyan">ESC</Text> Back
				</Text>
			</Box>
		</Box>
	);
}

// List edit controls component
interface ListEditControlsProps {
	items: string[];
	selectedIndex: number;
	editingListIndex: number;
	onNavigate: (delta: number) => void;
	onEdit: () => void;
	onDelete: () => void;
	onCancel: () => void;
}

function ListEditControls({
	items,
	selectedIndex,
	editingListIndex,
	onNavigate,
	onEdit,
	onDelete,
	onCancel,
}: ListEditControlsProps) {
	useInput(
		(input, key) => {
			if (key.upArrow) {
				onNavigate(-1);
			} else if (key.downArrow) {
				onNavigate(1);
			} else if (key.return) {
				onEdit();
			} else if ((input === 'd' || key.delete) && selectedIndex < items.length) {
				onDelete();
			} else if (key.escape) {
				onCancel();
			}
		},
		{ isActive: editingListIndex === -1 }
	);

	return (
		<Box marginTop={1} flexDirection="column">
			<Text dimColor>
				<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Edit/Add
			</Text>
			{selectedIndex < items.length && (
				<Text dimColor>
					<Text color="cyan">d</Text> Delete item
				</Text>
			)}
			<Text dimColor>
				Press <Text color="cyan">ESC</Text> to go back
			</Text>
		</Box>
	);
}
