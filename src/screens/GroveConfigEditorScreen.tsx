import React, { useEffect, useState } from 'react';

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
	| 'fileList'
	| 'createSelectType'
	| 'createSelectFolder'
	| 'editConfig'
	| 'editField'
	| 'editListItem'
	| 'selectIDE';

type ConfigFileType = 'grove' | 'groveLocal';

// Represents a detected or potential config file
interface ConfigFileEntry {
	type: ConfigFileType;
	projectPath?: string; // undefined = root
	exists: boolean;
	displayPath: string;
}

interface GroveConfigEditorScreenProps {
	repositoryPath?: string;
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
	const { goBack, canGoBack, navigate } = useNavigation();
	const repositoryService = useService(RepositoryServiceToken);
	const groveConfigService = useService(GroveConfigServiceToken);

	// Find repository
	const [repository] = useState<Repository | null>(() => {
		if (!repositoryPath) return null;
		const repos = repositoryService.getAllRepositories();
		return repos.find((r) => r.path === repositoryPath) ?? null;
	});

	// State
	const [viewMode, setViewMode] = useState<ViewMode>('fileList');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [savedMessage, setSavedMessage] = useState<string | null>(null);

	// Config files detected
	const [configFiles, setConfigFiles] = useState<ConfigFileEntry[]>([]);

	// For creating new config
	const [newConfigType, setNewConfigType] = useState<ConfigFileType>('grove');
	const [availableFolders, setAvailableFolders] = useState<Array<{ path?: string; label: string }>>(
		[]
	);

	// Current editing state
	const [editingFile, setEditingFile] = useState<ConfigFileEntry | null>(null);
	const [config, setConfig] = useState<GroveRepoConfig>({});

	// Field editing
	const [editingFieldIndex, setEditingFieldIndex] = useState(0);
	const [editingField, setEditingField] = useState<ConfigFieldKey | null>(null);
	const [tempValue, setTempValue] = useState('');
	const [editingListIndex, setEditingListIndex] = useState(-1);

	// Scan for config files
	const scanConfigFiles = () => {
		if (!repository) return;

		const files: ConfigFileEntry[] = [];

		// Check root .grove.json
		if (groveConfigService.groveConfigExists(repository.path)) {
			files.push({
				type: 'grove',
				projectPath: undefined,
				exists: true,
				displayPath: '.grove.json',
			});
		}

		// Check root .grove.local.json
		if (groveConfigService.groveLocalConfigExists(repository.path)) {
			files.push({
				type: 'groveLocal',
				projectPath: undefined,
				exists: true,
				displayPath: '.grove.local.json',
			});
		}

		// For monorepos, check project folders
		if (repository.isMonorepo) {
			const projects = getMonorepoProjects(repository.path);
			for (const projectPath of projects) {
				if (groveConfigService.groveConfigExists(repository.path, projectPath)) {
					files.push({
						type: 'grove',
						projectPath,
						exists: true,
						displayPath: `${projectPath}/.grove.json`,
					});
				}
				if (groveConfigService.groveLocalConfigExists(repository.path, projectPath)) {
					files.push({
						type: 'groveLocal',
						projectPath,
						exists: true,
						displayPath: `${projectPath}/.grove.local.json`,
					});
				}
			}
		}

		setConfigFiles(files);
	};

	// Initial scan
	useEffect(() => {
		scanConfigFiles();
	}, [repository]);

	// Load config for editing
	const loadConfig = (file: ConfigFileEntry) => {
		if (!repository) return;

		const loadedConfig =
			file.type === 'grove'
				? groveConfigService.readGroveConfigOnly(repository.path, file.projectPath)
				: groveConfigService.readGroveLocalConfigOnly(repository.path, file.projectPath);

		setConfig(loadedConfig);
		setEditingFile(file);
		setEditingFieldIndex(0);
		setViewMode('editConfig');
	};

	// Save config
	const saveConfig = () => {
		if (!repository || !editingFile) return;

		if (editingFile.type === 'grove') {
			groveConfigService.writeGroveConfig(repository.path, config, editingFile.projectPath);
		} else {
			groveConfigService.writeGroveLocalConfig(repository.path, config, editingFile.projectPath);
		}

		setSavedMessage('Configuration saved');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Create new config file
	const createNewConfig = (type: ConfigFileType, projectPath?: string) => {
		if (!repository) return;

		const emptyConfig: GroveRepoConfig = {};

		if (type === 'grove') {
			groveConfigService.writeGroveConfig(repository.path, emptyConfig, projectPath);
		} else {
			groveConfigService.writeGroveLocalConfig(repository.path, emptyConfig, projectPath);
		}

		// Refresh the file list
		scanConfigFiles();

		// Open the new file for editing
		const displayPath = projectPath
			? `${projectPath}/${type === 'grove' ? '.grove.json' : '.grove.local.json'}`
			: type === 'grove'
				? '.grove.json'
				: '.grove.local.json';

		const newFile: ConfigFileEntry = {
			type,
			projectPath,
			exists: true,
			displayPath,
		};

		loadConfig(newFile);
		setSavedMessage('Config file created');
		setTimeout(() => setSavedMessage(null), 2000);
	};

	// Start create new config flow
	const startCreateConfig = () => {
		if (!repository) return;

		// Build list of available folders
		const folders: Array<{ path?: string; label: string }> = [{ path: undefined, label: '(root)' }];

		if (repository.isMonorepo) {
			const projects = getMonorepoProjects(repository.path);
			for (const projectPath of projects) {
				folders.push({ path: projectPath, label: projectPath });
			}
		}

		setAvailableFolders(folders);
		setSelectedIndex(0);
		setViewMode('createSelectType');
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
			if (viewMode === 'fileList') {
				if (key.escape && canGoBack) {
					goBack();
				} else if (key.upArrow && configFiles.length > 0) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : configFiles.length - 1));
				} else if (key.downArrow && configFiles.length > 0) {
					setSelectedIndex((prev) => (prev < configFiles.length - 1 ? prev + 1 : 0));
				} else if (key.return && configFiles.length > 0) {
					loadConfig(configFiles[selectedIndex]);
				} else if (input === 'c' || input === 'C') {
					startCreateConfig();
				}
			} else if (viewMode === 'createSelectType') {
				if (key.escape) {
					setViewMode('fileList');
					setSelectedIndex(0);
				} else if (key.upArrow || key.downArrow) {
					setSelectedIndex((prev) => (prev === 0 ? 1 : 0));
				} else if (key.return) {
					setNewConfigType(selectedIndex === 0 ? 'grove' : 'groveLocal');
					if (availableFolders.length === 1) {
						// Only root available, create directly
						createNewConfig(selectedIndex === 0 ? 'grove' : 'groveLocal', undefined);
					} else {
						// Multiple folders, let user choose
						setSelectedIndex(0);
						setViewMode('createSelectFolder');
					}
				}
			} else if (viewMode === 'createSelectFolder') {
				if (key.escape) {
					setViewMode('createSelectType');
					setSelectedIndex(0);
				} else if (key.upArrow) {
					setSelectedIndex((prev) => (prev > 0 ? prev - 1 : availableFolders.length - 1));
				} else if (key.downArrow) {
					setSelectedIndex((prev) => (prev < availableFolders.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					createNewConfig(newConfigType, availableFolders[selectedIndex].path);
				}
			} else if (viewMode === 'editConfig') {
				if (key.escape) {
					setViewMode('fileList');
					setEditingFile(null);
					setSelectedIndex(0);
					scanConfigFiles(); // Refresh in case new file was created
				} else if (key.upArrow) {
					setEditingFieldIndex((prev) => (prev > 0 ? prev - 1 : CONFIG_FIELDS.length - 1));
				} else if (key.downArrow) {
					setEditingFieldIndex((prev) => (prev < CONFIG_FIELDS.length - 1 ? prev + 1 : 0));
				} else if (key.return) {
					const field = CONFIG_FIELDS[editingFieldIndex];
					startEditField(field);
				} else if (input === 'd' || key.delete) {
					const field = CONFIG_FIELDS[editingFieldIndex];
					const newConfig = { ...config };
					delete newConfig[field.key];
					setConfig(newConfig);
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

	// Handle ESC in editField mode (for TextInput which doesn't have onCancel)
	useInput(
		(_input, key) => {
			if (key.escape) {
				handleStringCancel();
			}
		},
		{ isActive: viewMode === 'editField' && editingField !== null }
	);

	// Handle ESC when actively editing a list item (editingListIndex !== -1)
	useInput(
		(_input, key) => {
			if (key.escape) {
				setEditingListIndex(-1);
				setTempValue('');
			}
		},
		{ isActive: viewMode === 'editListItem' && editingListIndex !== -1 }
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
				setEditingField(null); // Don't set editingField for IDE selection
				setViewMode('selectIDE');
				break;
			case 'claudeTemplates':
				// Navigate to Claude Terminal Settings
				setEditingField(null);
				navigate('claudeTerminalSettings', {});
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

	// No repository found
	if (!repository) {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="red">
						Repository not found
					</Text>
				</Box>
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

	// File list view
	if (viewMode === 'fileList') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Grove Config - {repository.name}
					</Text>
					{repository.isMonorepo && <Text color="magenta"> [monorepo]</Text>}
				</Box>

				{savedMessage && (
					<Box marginBottom={1}>
						<Text color="green">{savedMessage}</Text>
					</Box>
				)}

				{configFiles.length === 0 ? (
					<Box flexDirection="column" marginTop={1}>
						<Text dimColor>No config files found.</Text>
						<Box marginTop={1}>
							<Text dimColor>
								Press <Text color="cyan">C</Text> to create a new config file.
							</Text>
						</Box>
					</Box>
				) : (
					<Box flexDirection="column" marginTop={1}>
						<Text dimColor>Select a config file to edit:</Text>
						<Box flexDirection="column" marginTop={1}>
							{configFiles.map((file, index) => (
								<Box key={file.displayPath}>
									<Text color={index === selectedIndex ? 'cyan' : undefined} bold={index === selectedIndex}>
										{index === selectedIndex ? '> ' : '  '}
										<Text color={file.type === 'grove' ? 'green' : 'yellow'}>{file.displayPath}</Text>
									</Text>
								</Box>
							))}
						</Box>
					</Box>
				)}

				<Box marginTop={2} flexDirection="column">
					{configFiles.length > 0 && (
						<Text dimColor>
							<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Edit
						</Text>
					)}
					<Text dimColor>
						<Text color="cyan">C</Text> Create new config file
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

	// Create config - select type
	if (viewMode === 'createSelectType') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Create Config File
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>Select config file type:</Text>
				</Box>

				<Box flexDirection="column">
					<Box>
						<Text color={selectedIndex === 0 ? 'cyan' : undefined} bold={selectedIndex === 0}>
							{selectedIndex === 0 ? '> ' : '  '}
							<Text color="green">.grove.json</Text>
						</Text>
					</Box>
					<Box marginLeft={4}>
						<Text dimColor>Shared config (commit to repo)</Text>
					</Box>

					<Box marginTop={1}>
						<Text color={selectedIndex === 1 ? 'cyan' : undefined} bold={selectedIndex === 1}>
							{selectedIndex === 1 ? '> ' : '  '}
							<Text color="yellow">.grove.local.json</Text>
						</Text>
					</Box>
					<Box marginLeft={4}>
						<Text dimColor>Local overrides (gitignored)</Text>
					</Box>
				</Box>

				<Box marginTop={2} flexDirection="column">
					<Text dimColor>
						<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Select
					</Text>
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to cancel
					</Text>
				</Box>
			</Box>
		);
	}

	// Create config - select folder (for monorepos)
	if (viewMode === 'createSelectFolder') {
		const fileName = newConfigType === 'grove' ? '.grove.json' : '.grove.local.json';

		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="yellow">
						Create {fileName}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text dimColor>Select location:</Text>
				</Box>

				<Box flexDirection="column">
					{availableFolders.map((folder, index) => {
						// Check if file already exists in this location
						const alreadyExists =
							newConfigType === 'grove'
								? groveConfigService.groveConfigExists(repository.path, folder.path)
								: groveConfigService.groveLocalConfigExists(repository.path, folder.path);

						return (
							<Box key={folder.path ?? 'root'}>
								<Text
									color={index === selectedIndex ? 'cyan' : undefined}
									bold={index === selectedIndex}
									dimColor={alreadyExists}
								>
									{index === selectedIndex ? '> ' : '  '}
									{folder.label}
									{alreadyExists && <Text color="gray"> (exists)</Text>}
								</Text>
							</Box>
						);
					})}
				</Box>

				<Box marginTop={2} flexDirection="column">
					<Text dimColor>
						<Text color="cyan">Up/Down</Text> Navigate - <Text color="cyan">Enter</Text> Create
					</Text>
					<Text dimColor>
						Press <Text color="cyan">ESC</Text> to go back
					</Text>
				</Box>
			</Box>
		);
	}

	// IDE selection
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

	// List item editing
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

	// String field editing
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

	// Config editing view
	if (!editingFile) {
		return null;
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="yellow">
					Edit {editingFile.displayPath}
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
					Press <Text color="cyan">ESC</Text> to go back
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
