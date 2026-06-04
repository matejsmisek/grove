import React, { useRef } from 'react';

import { Box, type DOMElement, Text } from 'ink';

import { useOnRelease } from '@ink-tools/ink-mouse';

import type { MergeRequestStatus, MergeRequestStatusKind } from '../plugins/gitlab/index.js';
import { hyperlink, markLinkOpened, openUrl } from '../utils/links.js';

/**
 * Per-entity merge request cell state.
 */
export type MrCellState =
	| { state: 'loading' }
	| { state: 'none' }
	| { state: 'error' }
	| { state: 'loaded'; info: MergeRequestStatus };

/** Human-readable label for each derived MR status. */
const MR_STATUS_LABEL: Record<MergeRequestStatusKind, string> = {
	open: 'open',
	draft: 'draft',
	in_review: 'in review',
	changes_requested: 'changes requested',
	merged: 'merged',
	closed: 'closed',
};

/** Color for each derived MR status. */
const MR_STATUS_COLOR: Record<MergeRequestStatusKind, string> = {
	open: 'green',
	draft: 'gray',
	in_review: 'white',
	changes_requested: 'red',
	merged: 'blue',
	closed: 'gray',
};

/** Statuses for which an approval count is meaningful (i.e. the MR is still open). */
const MR_OPEN_STATUSES: ReadonlySet<MergeRequestStatusKind> = new Set([
	'open',
	'draft',
	'in_review',
	'changes_requested',
]);

/**
 * Renders the merge request indicator (e.g. `MR !123 [in review] 2/3`).
 *
 * The MR id is clickable: it is rendered as an OSC 8 hyperlink and also opens
 * in-app on click. Since the containing tile's release handler also fires for
 * the same click, the cell marks the click via {@link markLinkOpened} so the
 * tile can skip its own activation.
 *
 * Renders nothing until a status is known.
 */
export function MergeRequestCell({
	mr,
	marginLeft = 0,
}: {
	mr?: MrCellState;
	marginLeft?: number;
}) {
	const ref = useRef<DOMElement>(null);
	const url = mr && mr.state === 'loaded' ? mr.info.webUrl : undefined;

	useOnRelease(ref, (event) => {
		if (event.button === 'left' && url) {
			markLinkOpened();
			openUrl(url);
		}
	});

	if (!mr) {
		return null;
	}

	if (mr.state === 'loading') {
		return (
			<Box ref={ref} marginLeft={marginLeft}>
				<Text dimColor>MR …</Text>
			</Box>
		);
	}

	if (mr.state === 'none') {
		return (
			<Box ref={ref} marginLeft={marginLeft}>
				<Text dimColor>no MR</Text>
			</Box>
		);
	}

	if (mr.state === 'error') {
		return (
			<Box ref={ref} marginLeft={marginLeft}>
				<Text dimColor>MR ?</Text>
			</Box>
		);
	}

	const { info } = mr;
	const showApprovals = MR_OPEN_STATUSES.has(info.status);
	const approvalsSatisfied = info.approvalsGiven >= info.approvalsRequired;

	return (
		<Box ref={ref} marginLeft={marginLeft}>
			<Text dimColor>MR </Text>
			<Text color="cyan" underline>
				{hyperlink(`!${info.iid}`, info.webUrl)}
			</Text>
			<Text color={MR_STATUS_COLOR[info.status]}> [{MR_STATUS_LABEL[info.status]}]</Text>
			{showApprovals && info.approvalsRequired > 0 && (
				<Text color={approvalsSatisfied ? 'green' : undefined} dimColor={!approvalsSatisfied}>
					{' '}
					{info.approvalsGiven}/{info.approvalsRequired}
				</Text>
			)}
			{showApprovals && info.approvalsRequired === 0 && info.approvalsGiven > 0 && (
				<Text color="green"> {info.approvalsGiven}✓</Text>
			)}
		</Box>
	);
}
