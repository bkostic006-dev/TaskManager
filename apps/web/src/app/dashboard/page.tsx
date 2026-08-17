'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Button, Group, Modal, Stack, Text, Title } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import type { Task, TaskStatusFilter } from '@tally/contracts';

import { RequireAuth } from '@/components/require-auth';
import { AppHeader } from '@/components/dashboard/app-header';
import { TaskDrawer } from '@/components/dashboard/task-drawer';
import { TaskPager } from '@/components/dashboard/task-pager';
import { TaskRow } from '@/components/dashboard/task-row';
import {
  EmptyNoResults,
  EmptyNoTasks,
  TaskListError,
  TaskListSkeleton,
} from '@/components/dashboard/task-states';
import { TaskToolbar } from '@/components/dashboard/task-toolbar';
import { useLogout, useSession } from '@/hooks/use-auth';
import {
  useCreateTask,
  useDeleteTask,
  useSetTaskCompletion,
  useTaskList,
  useUpdateTask,
} from '@/hooks/use-tasks';
import {
  applyTaskListChange,
  DEFAULT_TASK_LIST_PARAMS,
  isFiltered,
  pageWithinBounds,
  parseSortValue,
  rowNumeral,
  sortValue,
  toTaskListQuery,
} from '@/lib/task-query';

/** How long a keystroke waits before it becomes a request. */
const SEARCH_DEBOUNCE_MS = 300;

const STATUS_DESCRIPTION: Record<TaskStatusFilter, string | null> = {
  all: null,
  pending: 'pending',
  completed: 'completed',
};

function Dashboard() {
  const router = useRouter();
  const { user } = useSession();
  const logout = useLogout();

  const [params, setParams] = useState(DEFAULT_TASK_LIST_PARAMS);
  const [searchDraft, setSearchDraft] = useState('');
  const [debouncedSearch] = useDebouncedValue(searchDraft, SEARCH_DEBOUNCE_MS);

  const [drawerTask, setDrawerTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Task | null>(null);

  const query = useMemo(() => toTaskListQuery(params), [params]);
  const list = useTaskList(query);

  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const completion = useSetTaskCompletion();

  // Typing narrows the list, so it also resets the page — see
  // `applyTaskListChange`. Debounced so a ten-character query is one request.
  useEffect(() => {
    setParams((current) =>
      current.search === debouncedSearch
        ? current
        : applyTaskListChange(current, { search: debouncedSearch }),
    );
  }, [debouncedSearch]);

  // Deleting the last row on the last page, or completing the last pending task
  // while the Pending filter is on, shrinks the list under the page the user is
  // standing on. `pageWithinBounds` returns the same object when it is already
  // in range, so this settles in one pass.
  const meta = list.data?.meta;
  useEffect(() => {
    if (meta !== undefined) {
      setParams((current) => pageWithinBounds(current, meta));
    }
  }, [meta]);

  const tasks = list.data?.data ?? [];
  const saving = createTask.isPending || updateTask.isPending;
  const saveError = drawerTask === null ? createTask.error : updateTask.error;

  /**
   * Drops a save failure the moment the user edits the form again.
   *
   * The drawer already resets its fields when it *opens*, which covers moving
   * between tasks — but a `400` raised on the open drawer stayed under the
   * field until the next save resolved, so correcting the title left it red.
   * Both mutations are reset because either could own the visible failure.
   */
  function clearSaveFailure(): void {
    createTask.reset();
    updateTask.reset();
  }

  function change(next: Partial<typeof DEFAULT_TASK_LIST_PARAMS>) {
    setParams((current) => applyTaskListChange(current, next));
  }

  function openCreate() {
    createTask.reset();
    setDrawerTask(null);
    setDrawerOpen(true);
  }

  function openEdit(task: Task) {
    updateTask.reset();
    setDrawerTask(task);
    setDrawerOpen(true);
  }

  function handleSubmit({ title, description }: { title: string; description: string }) {
    if (drawerTask === null) {
      createTask.mutate(description === '' ? { title } : { title, description }, {
        onSuccess: () => setDrawerOpen(false),
      });
      return;
    }
    updateTask.mutate(
      { id: drawerTask.id, input: { title, description: description === '' ? null : description } },
      { onSuccess: () => setDrawerOpen(false) },
    );
  }

  function confirmDelete() {
    if (pendingDelete === null) {
      return;
    }
    deleteTask.mutate(pendingDelete, {
      onSuccess: () => {
        setPendingDelete(null);
        setDrawerOpen(false);
      },
    });
  }

  function handleLogout() {
    logout.mutate(undefined, { onSettled: () => router.replace('/login') });
  }

  function showAll() {
    setSearchDraft('');
    change({ status: 'all', search: '' });
  }

  const total = meta?.total ?? 0;
  const statusWord = STATUS_DESCRIPTION[params.status];

  // The row's own number, repeated in the drawer header. Null in create mode,
  // and null for a task that is no longer on the page being shown.
  const drawerNumeral =
    drawerTask === null || meta === undefined
      ? null
      : (() => {
          const index = tasks.findIndex((task) => task.id === drawerTask.id);
          return index === -1 ? null : rowNumeral(meta, index);
        })();

  return (
    <Box mih="100dvh" bg="ink.1">
      <AppHeader
        name={user?.name ?? 'Signed in'}
        onLogout={handleLogout}
        loggingOut={logout.isPending}
      />

      <Box maw={1180} mx="auto" px={{ base: 'md', sm: 'lg' }} pt="xl" pb={72}>
        <Group justify="space-between" align="flex-end" gap="lg" mb="xl">
          <Box>
            <Title order={1}>Tasks</Title>
            <Text fz={13.5} c="ink.7" mt={4}>
              {statusWord === null ? 'Everything on your list' : `Showing ${statusWord} only`}
              {params.search.trim() === '' ? '' : ` · matching “${params.search.trim()}”`}
            </Text>
          </Box>
          <Group gap={10} align="baseline">
            <Text
              ff="heading"
              fz={44}
              fw={700}
              lh={1}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {total}
            </Text>
            <Text fz={12} fw={700} c="ink.7" tt="uppercase" style={{ letterSpacing: '0.12em' }}>
              {total === 1 ? 'task' : 'tasks'}
            </Text>
          </Group>
        </Group>

        <TaskToolbar
          search={searchDraft}
          onSearchChange={setSearchDraft}
          status={params.status}
          onStatusChange={(status) => change({ status })}
          sort={sortValue(params)}
          onSortChange={(value) => change(parseSortValue(value))}
          onNewTask={openCreate}
          busy={list.isFetching}
        />

        <Box mt="md">
          {list.isPending ? (
            <TaskListSkeleton />
          ) : list.isError ? (
            <TaskListError message={list.error.message} onRetry={() => void list.refetch()} />
          ) : tasks.length === 0 ? (
            isFiltered(params) ? (
              <EmptyNoResults
                search={params.search.trim()}
                statusLabel={statusWord}
                onClearSearch={() => {
                  setSearchDraft('');
                  change({ search: '' });
                }}
                onShowAll={showAll}
              />
            ) : (
              <EmptyNoTasks onCreate={openCreate} />
            )
          ) : (
            <Stack
              gap={8}
              aria-busy={list.isFetching || undefined}
              style={{
                opacity: list.isFetching ? 0.55 : 1,
                transition: 'opacity 120ms ease',
              }}
            >
              {meta !== undefined &&
                tasks.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    numeral={rowNumeral(meta, index)}
                    busy={
                      (completion.isPending && completion.variables.task.id === task.id) ||
                      (deleteTask.isPending && deleteTask.variables.id === task.id)
                    }
                    onToggle={(target, completed) => completion.mutate({ task: target, completed })}
                    onEdit={openEdit}
                    onDelete={setPendingDelete}
                  />
                ))}
            </Stack>
          )}
        </Box>

        {meta !== undefined && meta.total > 0 && (
          <TaskPager
            meta={meta}
            onPageChange={(page) => change({ page })}
            onPageSizeChange={(pageSize) => change({ pageSize })}
          />
        )}
      </Box>

      <TaskDrawer
        opened={drawerOpen}
        task={drawerTask}
        numeral={drawerNumeral}
        saving={saving}
        error={saveError}
        onEdit={clearSaveFailure}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSubmit}
        onDelete={setPendingDelete}
      />

      <Modal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        title="Delete this task?"
        size={420}
      >
        <Text fz={13.5} c="ink.7">
          “{pendingDelete?.title}” will be removed from the list. This cannot be undone.
        </Text>
        <Group gap="sm" mt="lg" justify="flex-end">
          <Button variant="default" onClick={() => setPendingDelete(null)}>
            Cancel
          </Button>
          <Button color="brass" onClick={confirmDelete} loading={deleteTask.isPending}>
            Delete task
          </Button>
        </Group>
      </Modal>
    </Box>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}
