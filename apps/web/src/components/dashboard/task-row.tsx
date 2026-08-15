'use client';

import { ActionIcon, Badge, Box, Checkbox, Group, Paper, Text, Tooltip } from '@mantine/core';
import type { Task } from '@tally/contracts';

import { IconCheck, IconPencil, IconTrash } from './icons';
import classes from './task-row.module.css';

/** "Aug 4" — the meta line's only variable part. */
const dayMonth = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function formatDay(iso: string): string {
  return dayMonth.format(new Date(iso));
}

export interface TaskRowProps {
  task: Task;
  /** Position in the whole filtered list, zero-padded. Counts across pages. */
  numeral: string;
  /** A mutation for this row is in flight: its own controls hold, the list does not. */
  busy: boolean;
  onToggle: (task: Task, completed: boolean) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

/**
 * One task, as the row the numeral spine opens.
 *
 * Completion is stated in three non-colour channels before colour does any
 * work: the numeral becomes a filled ink marker, the title is struck through,
 * and the badge reads "Done".
 */
export function TaskRow({ task, numeral, busy, onToggle, onEdit, onDelete }: TaskRowProps) {
  return (
    <Paper
      component="article"
      className={`${classes.row} ${task.completed ? classes.done : ''}`}
      aria-busy={busy || undefined}
    >
      {task.completed ? (
        <Box className={classes.marker} aria-hidden>
          <IconCheck size={17} />
        </Box>
      ) : (
        <Box className={classes.numeral} aria-hidden>
          {numeral}
        </Box>
      )}

      <Checkbox
        className={classes.checkbox}
        checked={task.completed}
        disabled={busy}
        onChange={(event) => onToggle(task, event.currentTarget.checked)}
        aria-label={
          task.completed ? `Mark “${task.title}” incomplete` : `Mark “${task.title}” complete`
        }
      />

      <Box miw={0}>
        <Text
          fz={14}
          lh={1.35}
          c={task.completed ? 'ink.7' : 'ink.9'}
          td={task.completed ? 'line-through' : undefined}
        >
          {task.title}
        </Text>
        <Text fz={12.5} c="ink.7" lh={1.35} style={{ fontVariantNumeric: 'tabular-nums' }}>
          {task.completed && task.completedAt !== null
            ? `Completed ${formatDay(task.completedAt)}`
            : `Added ${formatDay(task.createdAt)}`}
          {task.description !== null && task.description !== '' ? ' · 1 note' : ''}
        </Text>
      </Box>

      <Group className={classes.trailing} gap={8}>
        <Badge color={task.completed ? 'teal' : 'ink'}>{task.completed ? 'Done' : 'Pending'}</Badge>

        <Box className={classes.actions}>
          <Tooltip label="Edit task" openDelay={400}>
            <ActionIcon aria-label={`Edit “${task.title}”`} onClick={() => onEdit(task)}>
              <IconPencil size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Delete task" openDelay={400}>
            <ActionIcon
              color="brass"
              aria-label={`Delete “${task.title}”`}
              onClick={() => onDelete(task)}
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Tooltip>
        </Box>
      </Group>
    </Paper>
  );
}
