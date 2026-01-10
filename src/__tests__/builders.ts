import * as path from 'path';
import type { Volume } from 'memfs';

import type {
	GroveMetadata,
	GroveReference,
	GroveRepoConfig,
	GrovesIndex,
	IDEConfig,
	IDEType,
	Repository,
	RepositoriesData,
	Settings,
	TerminalConfig,
	Worktree,
} from '../storage/types.js';

/**
 * Builder for creating mock settings data
 */
export class SettingsBuilder {
	private settings: Settings;

	constructor(baseDir = '/home/testuser/grove-worktrees') {
		this.settings = {
			workingFolder: baseDir,
		};
	}

	withWorkingFolder(folder: string): this {
		this.settings.workingFolder = folder;
		return this;
	}

	withTerminal(terminal: TerminalConfig): this {
		this.settings.terminal = terminal;
		return this;
	}

	withSelectedIDE(ide: IDEType): this {
		this.settings.selectedIDE = ide;
		return this;
	}

	withIDEConfig(ideType: IDEType, config: IDEConfig): this {
		if (!this.settings.ideConfigs) {
			this.settings.ideConfigs = {};
		}
		this.settings.ideConfigs[ideType] = config;
		return this;
	}

	withOpenRouterApiKey(apiKey: string): this {
		this.settings.openrouterApiKey = apiKey;
		return this;
	}

	build(): Settings {
		return { ...this.settings };
	}

	/**
	 * Write settings to the filesystem
	 */
	writeTo(vol: Volume, groveFolder = '/home/testuser/.grove'): void {
		const settingsPath = path.join(groveFolder, 'settings.json');
		vol.mkdirSync(groveFolder, { recursive: true });
		vol.writeFileSync(settingsPath, JSON.stringify(this.settings, null, '\t'));
	}
}

/**
 * Builder for creating mock repository data
 */
export class RepositoryBuilder {
	private repository: Repository;

	constructor(repoPath: string, name?: string) {
		this.repository = {
			path: repoPath,
			name: name || path.basename(repoPath),
			registeredAt: new Date().toISOString(),
			isMonorepo: false,
		};
	}

	withName(name: string): this {
		this.repository.name = name;
		return this;
	}

	withRegisteredAt(date: string): this {
		this.repository.registeredAt = date;
		return this;
	}

	asMonorepo(): this {
		this.repository.isMonorepo = true;
		return this;
	}

	build(): Repository {
		return { ...this.repository };
	}

	/**
	 * Create git repository structure in the filesystem
	 */
	createGitRepo(vol: Volume): void {
		vol.mkdirSync(this.repository.path, { recursive: true });
		vol.mkdirSync(path.join(this.repository.path, '.git'), { recursive: true });
		vol.writeFileSync(
			path.join(this.repository.path, '.git', 'config'),
			'[core]\n\trepositoryformatversion = 0\n'
		);
	}

	/**
	 * Create a .grove.json config file in the repository
	 */
	createGroveConfig(vol: Volume, config: GroveRepoConfig): void {
		const configPath = path.join(this.repository.path, '.grove.json');
		vol.writeFileSync(configPath, JSON.stringify(config, null, '\t'));
	}

	/**
	 * Create monorepo project folders
	 */
	createProjects(vol: Volume, projectNames: string[]): void {
		for (const projectName of projectNames) {
			const projectPath = path.join(this.repository.path, projectName);
			vol.mkdirSync(projectPath, { recursive: true });
			// Create a package.json to make it look like a real project
			vol.writeFileSync(
				path.join(projectPath, 'package.json'),
				JSON.stringify({ name: projectName, version: '1.0.0' }, null, 2)
			);
		}
	}
}

/**
 * Builder for creating a list of repositories
 */
export class RepositoriesDataBuilder {
	private repositories: Repository[] = [];

	addRepository(builder: RepositoryBuilder): this {
		this.repositories.push(builder.build());
		return this;
	}

	build(): RepositoriesData {
		return { repositories: [...this.repositories] };
	}

	/**
	 * Write repositories data to the filesystem
	 */
	writeTo(vol: Volume, groveFolder = '/home/testuser/.grove'): void {
		const reposPath = path.join(groveFolder, 'repositories.json');
		vol.mkdirSync(groveFolder, { recursive: true });
		vol.writeFileSync(reposPath, JSON.stringify(this.build(), null, '\t'));
	}
}

/**
 * Builder for creating worktree data
 */
export class WorktreeBuilder {
	private worktree: Worktree;

	constructor(
		repositoryName: string,
		repositoryPath: string,
		worktreePath: string,
		branch: string
	) {
		this.worktree = {
			repositoryName,
			repositoryPath,
			worktreePath,
			branch,
		};
	}

	withProjectPath(projectPath: string): this {
		this.worktree.projectPath = projectPath;
		return this;
	}

	build(): Worktree {
		return { ...this.worktree };
	}
}

/**
 * Builder for creating grove metadata
 */
export class GroveMetadataBuilder {
	private metadata: GroveMetadata;

	constructor(id: string, name: string) {
		const now = new Date().toISOString();
		this.metadata = {
			id,
			name,
			worktrees: [],
			createdAt: now,
			updatedAt: now,
		};
	}

	withCreatedAt(date: string): this {
		this.metadata.createdAt = date;
		return this;
	}

	withUpdatedAt(date: string): this {
		this.metadata.updatedAt = date;
		return this;
	}

	addWorktree(builder: WorktreeBuilder): this {
		this.metadata.worktrees.push(builder.build());
		return this;
	}

	build(): GroveMetadata {
		return {
			...this.metadata,
			worktrees: [...this.metadata.worktrees],
		};
	}

	/**
	 * Write grove metadata to the filesystem
	 */
	writeTo(vol: Volume, grovePath: string): void {
		vol.mkdirSync(grovePath, { recursive: true });
		const metadataPath = path.join(grovePath, 'grove.json');
		vol.writeFileSync(metadataPath, JSON.stringify(this.build(), null, '\t'));
	}
}

/**
 * Builder for creating grove reference
 */
export class GroveReferenceBuilder {
	private reference: GroveReference;

	constructor(id: string, name: string, grovePath: string) {
		const now = new Date().toISOString();
		this.reference = {
			id,
			name,
			path: grovePath,
			createdAt: now,
			updatedAt: now,
		};
	}

	withCreatedAt(date: string): this {
		this.reference.createdAt = date;
		return this;
	}

	withUpdatedAt(date: string): this {
		this.reference.updatedAt = date;
		return this;
	}

	build(): GroveReference {
		return { ...this.reference };
	}
}

/**
 * Builder for creating groves index
 */
export class GrovesIndexBuilder {
	private groves: GroveReference[] = [];

	addGrove(builder: GroveReferenceBuilder): this {
		this.groves.push(builder.build());
		return this;
	}

	build(): GrovesIndex {
		return { groves: [...this.groves] };
	}

	/**
	 * Write groves index to the filesystem
	 */
	writeTo(vol: Volume, groveFolder = '/home/testuser/.grove'): void {
		const indexPath = path.join(groveFolder, 'groves.json');
		vol.mkdirSync(groveFolder, { recursive: true });
		vol.writeFileSync(indexPath, JSON.stringify(this.build(), null, '\t'));
	}
}

/**
 * Comprehensive builder for creating a complete grove with all necessary files
 */
export class GroveBuilder {
	private id: string;
	private name: string;
	private grovePath: string;
	private metadataBuilder: GroveMetadataBuilder;
	private referenceBuilder: GroveReferenceBuilder;

	constructor(id: string, name: string, baseWorkingFolder: string) {
		this.id = id;
		this.name = name;
		this.grovePath = path.join(baseWorkingFolder, id);
		this.metadataBuilder = new GroveMetadataBuilder(id, name);
		this.referenceBuilder = new GroveReferenceBuilder(id, name, this.grovePath);
	}

	withCreatedAt(date: string): this {
		this.metadataBuilder.withCreatedAt(date);
		this.referenceBuilder.withCreatedAt(date);
		return this;
	}

	withUpdatedAt(date: string): this {
		this.metadataBuilder.withUpdatedAt(date);
		this.referenceBuilder.withUpdatedAt(date);
		return this;
	}

	addWorktree(
		repositoryName: string,
		repositoryPath: string,
		branch: string,
		projectPath?: string
	): this {
		const worktreeName = projectPath ? `${repositoryName}-${projectPath}` : repositoryName;
		const worktreePath = path.join(this.grovePath, worktreeName);
		const builder = new WorktreeBuilder(repositoryName, repositoryPath, worktreePath, branch);
		if (projectPath) {
			builder.withProjectPath(projectPath);
		}
		this.metadataBuilder.addWorktree(builder);
		return this;
	}

	getMetadata(): GroveMetadata {
		return this.metadataBuilder.build();
	}

	getReference(): GroveReference {
		return this.referenceBuilder.build();
	}

	/**
	 * Create complete grove structure in the filesystem
	 * Including grove folder, metadata, worktree folders, and CONTEXT.md
	 */
	createInFilesystem(vol: Volume): void {
		// Create grove directory
		vol.mkdirSync(this.grovePath, { recursive: true });

		// Write metadata
		this.metadataBuilder.writeTo(vol, this.grovePath);

		// Create worktree folders
		const metadata = this.metadataBuilder.build();
		for (const worktree of metadata.worktrees) {
			vol.mkdirSync(worktree.worktreePath, { recursive: true });

			// Create basic git structure in worktree
			vol.mkdirSync(path.join(worktree.worktreePath, '.git'), { recursive: true });
		}

		// Create CONTEXT.md
		const contextContent = `# ${this.name}\n\nCreated: ${metadata.createdAt}\n\n## Worktrees\n\n${metadata.worktrees.map((w) => `- ${w.repositoryName} (${w.branch})`).join('\n')}`;
		vol.writeFileSync(path.join(this.grovePath, 'CONTEXT.md'), contextContent);
	}

	/**
	 * Get grove path
	 */
	getPath(): string {
		return this.grovePath;
	}

	/**
	 * Get grove ID
	 */
	getId(): string {
		return this.id;
	}
}

/**
 * Helper function to create a complete test environment with settings, repositories, and groves
 */
export function createTestEnvironment(vol: Volume, homeDir = '/home/testuser') {
	const groveFolder = path.join(homeDir, '.grove');
	const workingFolder = path.join(homeDir, 'grove-worktrees');

	// Create directories
	vol.mkdirSync(groveFolder, { recursive: true });
	vol.mkdirSync(workingFolder, { recursive: true });

	// Create default settings
	new SettingsBuilder(workingFolder)
		.withTerminal({ command: 'gnome-terminal', args: ['--working-directory', '{path}'] })
		.withSelectedIDE('vscode')
		.writeTo(vol, groveFolder);

	// Create empty repositories and groves files
	vol.writeFileSync(path.join(groveFolder, 'repositories.json'), JSON.stringify({ repositories: [] }, null, '\t'));
	vol.writeFileSync(path.join(groveFolder, 'groves.json'), JSON.stringify({ groves: [] }, null, '\t'));
	vol.writeFileSync(path.join(groveFolder, 'recent.json'), JSON.stringify({ selections: [] }, null, '\t'));

	return {
		groveFolder,
		workingFolder,
		homeDir,
	};
}
