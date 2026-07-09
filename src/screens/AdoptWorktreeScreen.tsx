import React, { useEffect, useRef, useState } from 'react';

import { Box, Text, useInput } from 'ink';

import path from 'path';

import GroveTextInput from '../components/GroveTextInput.js';
import { useService } from '../di/index.js';
import { useNavigation } from '../navigation/useNavigation.js';
import type { AdoptableWorktree } from '../services/adoptableWorktrees.js';
import { findAdoptableWorktrees } from '../services/adoptableWorktrees.js';
import {
	GitServiceToken,
	GroveServiceToken,
	GrovesServiceToken,
	RepositoryServiceToken,
} from '../services/tokens.js';

type AdoptWorktreeStep =
	| 'scanning'
	| 'worktrees'
	| 'groves'
	| 'groveName'
	| 'adopting'
	| 'done'
	| 'error';

interface AdoptWorktreeScreenProps {
	/** When set, the target grove is fixed and the grove-selection step is skipped. */
	groveId?: string;
}

/**
 * Adopt an existing git worktree (created outside Grove, e.g. with plain
 * `git worktree add`) into a grove. Scans all registered repositories for
 * linked worktrees no grove tracks yet, then lets the user pick a target
 * grove (or create a new empty one). Only grove metadata is written - the
 * worktree keeps its folder and branch.
 */
export function AdoptWorktreeScreen({ groveId }: AdoptWorktreeScreenProps) {
	const { replace, goBack } = useNavigation();
	const gitService = useService(GitServiceToken);
	const groveService = useService(GroveServiceToken);
	const grovesService = useService(GrovesServiceToken);
	const repositoryService = useService(RepositoryServiceToken);

	const [step, setStep] = useState<AdoptWorktreeStep>('scanning');
	const [candidates, setCandidates] = useState<AdoptableWorktree[]>([]);
	const [worktreeCursor, setWorktreeCursor] = useState(0);
	const [groveCursor, setGroveCursor] = useState(0);
	const [newGroveName, setNewGroveName] = useState('');
	const [error, setError] = useState('');
	const [groves] = useState(() => grovesService.getAllGroves());
	// The worktree picked in the first step (set before grove selection/creation).
	const selectedCandidateRef = useRef<AdoptableWorktree | null>(null);
	const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Scan registered repositories for linked worktrees that no grove tracks yet.
	useEffect(() => {
		let cancelled = false;

		void findAdoptableWorktrees(
			gitService,
			grovesService,
			repositoryService.getAllRepositories()
		).then((found) => {
			if (!cancelled) {
				setCandidates(found);
				setStep('worktrees');
			}
		});

		return () => {
			cancelled = true;
		};
	}, [gitService, grovesService, repositoryService]);

	// Clear a pending navigation timer if the screen unmounts first.
	useEffect(() => {
		return () => {
			if (navTimerRef.current) {
				clearTimeout(navTimerRef.current);
			}
		};
	}, []);

	// Write the adoption into the target grove and show the result. Adoption is
	// metadata-only, so it completes synchronously.
	const adoptInto = (targetGroveId: string) => {
		const candidate = selectedCandidateRef.current;
		if (!candidate) {
			return;
		}
		try {
			groveService.adoptWorktreeIntoGrove(targetGroveId, {
				repository: candidate.repository,
				worktreePath: candidate.worktreePath,
				branch: candidate.branch,
			});
			setStep('done');
			navTimerRef.current = setTimeout(
				() =>
					replace('groveDetail', {
						groveId: targetGroveId,
						focusWorktreeName: path.basename(candidate.worktreePath),
					}),
				1500
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to adopt worktree');
			setStep('error');
		}
	};

	// Create a new empty grove for the picked worktree, then adopt into it.
	const createGroveAndAdopt = (name: string) => {
		setStep('adopting');
		groveService
			.createGrove(name, [])
			.then((metadata) => adoptInto(metadata.id))
			.catch((err: unknown) => {
				setError(err instanceof Error ? err.message : 'Failed to create grove');
				setStep('error');
			});
	};

	const handlePickWorktree = (candidate: AdoptableWorktree) => {
		selectedCandidateRef.current = candidate;
		// With a fixed target grove, adopt straight away; otherwise pick one.
		if (groveId) {
			adoptInto(groveId);
			return;
		}
		if (groves.length === 0) {
			setStep('groveName');
			return;
		}
		setGroveCursor(0);
		setStep('groves');
	};

	// Grove options: every existing grove plus a trailing "create new" entry.
	const groveOptionCount = groves.length + 1;

	useInput(
		(_input, key) => {
			if (step === 'worktrees') {
				if (key.escape) {
					goBack();
				} else if (candidates.length > 0) {
					if (key.upArrow) {
						setWorktreeCursor((prev) => (prev > 0 ? prev - 1 : candidates.length - 1));
					} else if (key.downArrow) {
						setWorktreeCursor((prev) => (prev < candidates.length - 1 ? prev + 1 : 0));
					} else if (key.return) {
						handlePickWorktree(candidates[worktreeCursor]);
					}
				}
				return;
			}

			if (step === 'groves') {
				if (key.escape) {
					setStep('worktrees');
				} else if (key.upArrow) {
					setGroveCursor((prev) => (prev > 0 ? prev - 1 : groveOptionCount - 1));
				} else if (key.downArrow) {
					setGroveCursor((prev) => (prev < groveOptionCount - 1 ? prev + 1 : 0));
				} else if (key.return) {
					if (groveCursor < groves.length) {
						adoptInto(groves[groveCursor].id);
					} else {
						setStep('groveName');
					}
				}
				return;
			}

			if (step === 'groveName' && key.escape) {
				setStep(groves.length > 0 ? 'groves' : 'worktrees');
				return;
			}

			if ((step === 'done' || step === 'error') && key.escape) {
				goBack();
			}
		},
		{ isActive: step !== 'scanning' && step !== 'adopting' }
	);

	if (step === 'scanning') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Adopt Worktree
					</Text>
				</Box>
				<Text dimColor>Scanning repositories for worktrees not tracked by any grove...</Text>
			</Box>
		);
	}

	if (step === 'worktrees') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Adopt Worktree
					</Text>
				</Box>

				{candidates.length === 0 ? (
					<>
						<Text>No adoptable worktrees found.</Text>
						<Box marginTop={1}>
							<Text dimColor>
								Every linked worktree of your registered repositories is already tracked by a grove. Create
								one with `git worktree add` and it will show up here.
							</Text>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>Press Esc to go back</Text>
						</Box>
					</>
				) : (
					<>
						<Box marginBottom={1}>
							<Text>Select an existing worktree to adopt:</Text>
						</Box>

						{candidates.map((candidate, index) => {
							const isSelected = index === worktreeCursor;
							return (
								<Box key={candidate.worktreePath} flexDirection="column">
									<Text color={isSelected ? 'cyan' : undefined}>
										{isSelected ? '❯ ' : '  '}
										<Text bold={isSelected}>{path.basename(candidate.worktreePath)}</Text>
										<Text dimColor>
											{' '}
											({candidate.repository.name} · {candidate.branch})
										</Text>
									</Text>
									{isSelected && <Text dimColor> {candidate.worktreePath}</Text>}
								</Box>
							);
						})}

						<Box marginTop={1}>
							<Text dimColor>↑↓ Navigate • Enter Select • Esc Cancel</Text>
						</Box>
					</>
				)}
			</Box>
		);
	}

	if (step === 'groves') {
		const candidate = selectedCandidateRef.current;
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Adopt Worktree: {candidate ? path.basename(candidate.worktreePath) : ''}
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Select the grove to adopt it into:</Text>
				</Box>

				{groves.map((grove, index) => (
					<Text key={grove.id} color={index === groveCursor ? 'cyan' : undefined}>
						{index === groveCursor ? '❯ ' : '  '}
						{grove.name}
					</Text>
				))}
				<Text color={groveCursor === groves.length ? 'cyan' : 'green'}>
					{groveCursor === groves.length ? '❯ ' : '  '}+ Create new grove
				</Text>

				<Box marginTop={1}>
					<Text dimColor>↑↓ Navigate • Enter Select • Esc Back</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'groveName') {
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						Adopt Worktree: New Grove
					</Text>
				</Box>

				<Box marginBottom={1}>
					<Text>Enter a name for the new grove:</Text>
				</Box>

				<Box>
					<Text>Name: </Text>
					<GroveTextInput
						value={newGroveName}
						onChange={setNewGroveName}
						onSubmit={(value) => {
							if (value.trim()) {
								createGroveAndAdopt(value.trim());
							}
						}}
					/>
				</Box>

				<Box marginTop={1}>
					<Text dimColor>Press Enter to continue, Esc to go back</Text>
				</Box>
			</Box>
		);
	}

	if (step === 'adopting') {
		return (
			<Box flexDirection="column" padding={1}>
				<Text dimColor>Creating grove "{newGroveName}"...</Text>
			</Box>
		);
	}

	if (step === 'done') {
		const candidate = selectedCandidateRef.current;
		return (
			<Box flexDirection="column" padding={1}>
				<Box marginBottom={1}>
					<Text bold color="green">
						✓ Worktree Adopted Successfully!
					</Text>
				</Box>
				<Text>
					"{candidate ? path.basename(candidate.worktreePath) : ''}" is now tracked by the grove. It
					keeps its folder and branch{candidate ? ` (${candidate.branch})` : ''}.
				</Text>
				<Box marginTop={1}>
					<Text dimColor>Opening grove detail...</Text>
				</Box>
			</Box>
		);
	}

	// step === 'error'
	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="red">
					Error
				</Text>
			</Box>
			<Text color="red">{error}</Text>
			<Box marginTop={1}>
				<Text dimColor>Press Esc to go back</Text>
			</Box>
		</Box>
	);
}
