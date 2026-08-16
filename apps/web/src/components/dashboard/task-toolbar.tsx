'use client';

import {
  Box,
  Button,
  CloseButton,
  Group,
  Loader,
  Paper,
  SegmentedControl,
  Select,
  TextInput,
} from '@mantine/core';
import type { TaskStatusFilter } from '@tally/contracts';

import { TASK_SORT_OPTIONS } from '@/lib/task-query';
import { IconPlus, IconSearch, IconSort } from './icons';

/** All / Pending / Completed, in the contract's own order of values. */
const STATUS_LABELS: Record<TaskStatusFilter, string> = {
  all: 'All',
  completed: 'Completed',
  pending: 'Pending',
};

const STATUS_DATA = ['all', 'pending', 'completed'].map((value) => ({
  value,
  label: STATUS_LABELS[value as TaskStatusFilter],
}));

const SORT_DATA = TASK_SORT_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

export interface TaskToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: TaskStatusFilter;
  onStatusChange: (status: TaskStatusFilter) => void;
  sort: string;
  onSortChange: (value: string) => void;
  onNewTask: () => void;
  /** A list request is in flight. Shown beside the search box, not over the rows. */
  busy: boolean;
}

/**
 * Search, status filter, sort and the one filled button on the page.
 *
 * The search box is uncontrolled by the query: it reports every keystroke and
 * the dashboard debounces it, so typing never queues one request per character.
 */
export function TaskToolbar({
  search,
  onSearchChange,
  status,
  onStatusChange,
  sort,
  onSortChange,
  onNewTask,
  busy,
}: TaskToolbarProps) {
  return (
    <Paper p={14} px="md">
      <Group gap="sm" align="center">
        <TextInput
          w={{ base: '100%', sm: 280 }}
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks"
          value={search}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          leftSection={<IconSearch size={15} />}
          rightSection={
            busy ? (
              <Loader size={14} color="teal.6" aria-label="Loading tasks" />
            ) : search === '' ? null : (
              <CloseButton size="sm" aria-label="Clear search" onClick={() => onSearchChange('')} />
            )
          }
        />

        <SegmentedControl
          w={{ base: '100%', sm: 'auto' }}
          aria-label="Filter by status"
          data={STATUS_DATA}
          value={status}
          onChange={(value) => onStatusChange(value as TaskStatusFilter)}
        />

        <Select
          w={{ base: '100%', sm: 178 }}
          aria-label="Sort tasks"
          data={SORT_DATA}
          value={sort}
          onChange={(value) => onSortChange(value ?? TASK_SORT_OPTIONS[0].value)}
          leftSection={<IconSort size={15} />}
          comboboxProps={{ withinPortal: true }}
        />

        <Box ml={{ base: 0, sm: 'auto' }} w={{ base: '100%', sm: 'auto' }}>
          <Button fullWidth h={36} onClick={onNewTask} leftSection={<IconPlus size={15} />}>
            New task
          </Button>
        </Box>
      </Group>
    </Paper>
  );
}
