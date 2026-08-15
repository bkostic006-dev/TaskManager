'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import type { Task, TaskListQuery, TaskListResponse } from '@tally/contracts';

import type { ApiRequestError } from '@/lib/api-error';
import * as tasksApi from '@/lib/tasks-api';
import type { CreateTaskInput, UpdateTaskInput } from '@/lib/tasks-api';

/**
 * The reusable task API components are allowed to touch.
 *
 * Same shape as `use-auth.ts`: nothing here returns a transport type, errors
 * arrive as `ApiRequestError` and successes as the shared `@tally/contracts`
 * shapes. No page or component imports `apiClient`, `axios` or calls `fetch` —
 * this file and `lib/tasks-api.ts` are the whole seam.
 *
 * **Feedback lives here, not at the call sites.** Every mutation raises the
 * success toast itself, so the verb on the button and the verb in the toast
 * cannot drift, and raises an error toast for everything *except* `400` — a
 * validation failure names a field, and the drawer renders it under that field
 * where it can be fixed. A toast for it would point at the wrong place.
 */

/**
 * Cache keys.
 *
 * The whole query object is part of the key, so every distinct combination of
 * page, filter, search and sort is its own entry and paging back is instant.
 * Two things make that safe: the cache is per tab and in memory, and
 * `useLogout` calls `queryClient.clear()`, so the next account never reads the
 * previous one's rows. (The *server-side* cache is a different problem with a
 * different answer — `GET /tasks?page=1` is byte-identical across users, so a
 * URL-keyed HTTP cache would be a tenancy bug. It is deliberately not here.)
 */
export const taskKeys = {
  all: ['tasks'] as const,
  list: (query: TaskListQuery) => ['tasks', 'list', query] as const,
};

/**
 * One page of tasks for the current controls.
 *
 * `keepPreviousData` is the loading-state decision: paging or filtering keeps
 * the rows on screen and dims them rather than blanking to skeletons, so the
 * page does not collapse to zero height and bounce the scroll position. Only
 * the first load — when there is nothing to keep — shows the skeleton rows.
 */
export function useTaskList(
  query: TaskListQuery,
): UseQueryResult<TaskListResponse, ApiRequestError> {
  return useQuery<TaskListResponse, ApiRequestError>({
    queryKey: taskKeys.list(query),
    queryFn: () => tasksApi.listTasks(query),
    placeholderData: keepPreviousData,
  });
}

/** Raises the toast for a failure the form cannot show inline. */
function notifyFailure(title: string, failure: ApiRequestError): void {
  if (failure.statusCode === 400) {
    return;
  }
  notifications.show({
    color: 'brass',
    autoClose: false,
    title,
    message: failure.message,
  });
}

/** Every mutation invalidates the whole task tree — totals move, not just rows. */
function useInvalidateTasks(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: taskKeys.all });
  };
}

/** Creates a task. Toasts "Task created", mirroring the drawer's Save task button. */
export function useCreateTask(): UseMutationResult<Task, ApiRequestError, CreateTaskInput> {
  const invalidate = useInvalidateTasks();

  return useMutation<Task, ApiRequestError, CreateTaskInput>({
    mutationFn: tasksApi.createTask,
    onSuccess: (task) => {
      invalidate();
      notifications.show({
        color: 'teal',
        title: 'Task created',
        message: `“${task.title}” is on the list.`,
      });
    },
    onError: (failure) => notifyFailure("Couldn't save this task", failure),
  });
}

/** Saves an edit. */
export function useUpdateTask(): UseMutationResult<
  Task,
  ApiRequestError,
  { id: string; input: UpdateTaskInput }
> {
  const invalidate = useInvalidateTasks();

  return useMutation<Task, ApiRequestError, { id: string; input: UpdateTaskInput }>({
    mutationFn: ({ id, input }) => tasksApi.updateTask(id, input),
    onSuccess: (task) => {
      invalidate();
      notifications.show({
        color: 'teal',
        title: 'Task saved',
        message: `“${task.title}” is up to date.`,
      });
    },
    onError: (failure) => notifyFailure("Couldn't save this task", failure),
  });
}

/** Deletes a task. The confirmation modal is the guard; this is the effect. */
export function useDeleteTask(): UseMutationResult<void, ApiRequestError, Task> {
  const invalidate = useInvalidateTasks();

  return useMutation<void, ApiRequestError, Task>({
    mutationFn: (task) => tasksApi.deleteTask(task.id),
    onSuccess: (_result, task) => {
      invalidate();
      notifications.show({
        color: 'teal',
        title: 'Task deleted',
        message: `“${task.title}” is off the list.`,
      });
    },
    onError: (failure) => notifyFailure("Couldn't delete this task", failure),
  });
}

/**
 * Moves a task across the completion boundary.
 *
 * The `Task` goes in whole rather than an id, so `variables.id` identifies which
 * row is mid-flight — the list disables that one checkbox instead of the list.
 */
export function useSetTaskCompletion(): UseMutationResult<
  Task,
  ApiRequestError,
  { task: Task; completed: boolean }
> {
  const invalidate = useInvalidateTasks();

  return useMutation<Task, ApiRequestError, { task: Task; completed: boolean }>({
    mutationFn: ({ task, completed }) => tasksApi.setTaskCompletion(task.id, completed),
    onSuccess: (task, { completed }) => {
      invalidate();
      notifications.show({
        color: 'teal',
        title: completed ? 'Task completed' : 'Task reopened',
        message: `“${task.title}” is now ${completed ? 'done' : 'pending'}.`,
      });
    },
    onError: (failure) => notifyFailure("Couldn't update this task", failure),
  });
}
