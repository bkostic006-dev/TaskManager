'use client';

import { Box, Button, Group, Paper, Skeleton, Stack, Text, Title } from '@mantine/core';

import { IconPlus } from './icons';
import classes from './task-row.module.css';

/**
 * The three things the list shows when it is not showing tasks: loading, empty,
 * and failed. Each one is a `Paper` on the same grid as a real row, so nothing
 * on the page moves when the state changes.
 */

/** The signature at 132px. Decorative, on-system, and never announced. */
function Figure({ children }: { children: React.ReactNode }) {
  return (
    <Box
      aria-hidden
      ff="heading"
      fz={132}
      fw={700}
      lh={0.86}
      c="ink.3"
      mb={14}
      style={{ letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums', userSelect: 'none' }}
    >
      {children}
    </Box>
  );
}

/**
 * Four skeleton rows with the loaded row's exact geometry, so nothing reflows
 * when the data lands. Four rather than eight: enough to read as a list, short
 * enough not to promise a count.
 */
export function TaskListSkeleton() {
  return (
    <Stack gap={8} aria-busy aria-live="polite" aria-label="Loading tasks">
      {[46, 62, 38, 54].map((width) => (
        <Paper key={width} component="article" className={classes.row}>
          <Skeleton height={26} width={30} radius="sm" style={{ justifySelf: 'end' }} />
          <Skeleton height={16} width={16} radius="sm" />
          <Box miw={0}>
            <Skeleton height={13} width={`${String(width)}%`} radius="sm" mb={7} />
            <Skeleton height={10} width="26%" radius="sm" />
          </Box>
          <Skeleton height={22} width={70} radius="xl" />
        </Paper>
      ))}
    </Stack>
  );
}

/** First run: no tasks exist at all, and no filter is hiding them. */
export function EmptyNoTasks({ onCreate }: { onCreate: () => void }) {
  return (
    <Paper>
      <Stack align="center" ta="center" px="lg" pt={46} pb={50} gap={0}>
        <Figure>01</Figure>
        <Title order={3} fz={26} mb={8}>
          Nothing on the list yet
        </Title>
        <Text fz={13.5} c="ink.7" maw="44ch" mb={20}>
          Write down the first thing you owe someone today. It gets number 01 and keeps it until you
          close it out.
        </Text>
        <Button onClick={onCreate} leftSection={<IconPlus size={15} />}>
          Create task
        </Button>
      </Stack>
    </Paper>
  );
}

export interface EmptyNoResultsProps {
  search: string;
  /** The filter that is also narrowing the list, or `null` when only the search is. */
  statusLabel: string | null;
  onClearSearch: () => void;
  onShowAll: () => void;
}

/**
 * A different job from the first-run state: this one must say *which*
 * constraint emptied the list and hand back the shortest way out, so it quotes
 * the query and names the filter rather than saying "no results found".
 */
export function EmptyNoResults({
  search,
  statusLabel,
  onClearSearch,
  onShowAll,
}: EmptyNoResultsProps) {
  const quoted = search === '' ? null : `“${search}”`;

  const heading =
    statusLabel !== null && quoted !== null
      ? `No ${statusLabel} tasks match ${quoted}`
      : quoted !== null
        ? `No tasks match ${quoted}`
        : `No ${statusLabel ?? ''} tasks`;

  return (
    <Paper>
      <Stack align="center" ta="center" px="lg" pt={46} pb={50} gap={0}>
        <Figure>00</Figure>
        <Title order={3} fz={26} mb={8}>
          {heading}
        </Title>
        <Text fz={13.5} c="ink.7" maw="44ch" mb={20}>
          Nothing here matches every filter at once. Widen one of them, or search something else.
        </Text>
        <Group gap="sm">
          {quoted !== null && (
            <Button variant="default" onClick={onClearSearch}>
              Clear search
            </Button>
          )}
          <Button variant="subtle" onClick={onShowAll}>
            Show all tasks
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

/**
 * The list request failed. It states the server's own message — the gateway
 * writes the copy a user sees — and offers the one action that can help.
 */
export function TaskListError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Paper>
      <Stack align="center" ta="center" px="lg" pt={46} pb={50} gap={0}>
        <Figure>!</Figure>
        <Title order={3} fz={26} mb={8}>
          Couldn&rsquo;t load your tasks
        </Title>
        <Text fz={13.5} c="ink.7" maw="44ch" mb={20}>
          {message}
        </Text>
        <Button onClick={onRetry}>Try again</Button>
      </Stack>
    </Paper>
  );
}
