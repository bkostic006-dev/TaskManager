import {
  TASK_ROUTES,
  type Task,
  type TaskListQuery,
  type TaskListResponse,
} from '@tally/contracts';

import { apiClient } from './api-client';
import { toApiRequestError } from './api-error';

/**
 * The task endpoints as plain service functions, alongside `auth-api.ts`.
 *
 * Same contract as that module: they own the request shape and nothing else —
 * no React, no cache, no navigation, no toast. `hooks/use-tasks.ts` wraps them
 * for components; a script can call them directly. Every one rejects with
 * `ApiRequestError`, so callers branch on `statusCode` and render `message`
 * without knowing axios exists.
 *
 * Types are imported from `@tally/contracts` rather than restated here. The
 * gateway validates against the same constants, so a field this file invented
 * would be a `400` naming it — `forbidNonWhitelisted` is on.
 */

/** A new task. There is no `completed`: a task is opened pending, always. */
export interface CreateTaskInput {
  title: string;
  description?: string;
}

/**
 * An edit.
 *
 * `description: null` clears the note and is distinct from omitting the key,
 * which leaves it untouched. **`completed` is absent on purpose and must not be
 * added** — the gateway answers `400` for it, because completion is a domain
 * action with its own two routes rather than a field edit.
 */
export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
}

/**
 * One page of the caller's own tasks. The gateway scopes every row by the JWT's
 * `userId`, so this never takes an owner argument.
 *
 * @throws ApiRequestError `400` when `pageSize` is outside `PAGE_SIZES`, or any
 * other parameter is out of range — the contract rejects rather than clamps, so
 * a bad value surfaces here instead of quietly changing the answer.
 */
export async function listTasks(query: TaskListQuery): Promise<TaskListResponse> {
  try {
    const { data } = await apiClient.get<TaskListResponse>(TASK_ROUTES.base, { params: query });
    return data;
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}

/** @throws ApiRequestError `400` with per-field `details` when the title is missing or too long. */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  try {
    const { data } = await apiClient.post<Task>(TASK_ROUTES.base, input);
    return data;
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}

/**
 * @throws ApiRequestError `404` when the id is unknown *or belongs to someone
 * else* — the two are deliberately indistinguishable — and `400` with per-field
 * `details` when the payload fails validation.
 */
export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  try {
    const { data } = await apiClient.patch<Task>(TASK_ROUTES.byId(id), input);
    return data;
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}

/** @throws ApiRequestError `404` when the id is unknown or belongs to someone else. */
export async function deleteTask(id: string): Promise<void> {
  try {
    await apiClient.delete(TASK_ROUTES.byId(id));
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}

/**
 * Moves a task across the completion boundary.
 *
 * Two routes rather than one flag because the server stamps `completedAt` on
 * the transition; re-asking for the state a task is already in is idempotent and
 * does not re-stamp it.
 *
 * @throws ApiRequestError `404` when the id is unknown or belongs to someone else.
 */
export async function setTaskCompletion(id: string, completed: boolean): Promise<Task> {
  const route = completed ? TASK_ROUTES.complete(id) : TASK_ROUTES.uncomplete(id);
  try {
    const { data } = await apiClient.patch<Task>(route);
    return data;
  } catch (cause) {
    throw toApiRequestError(cause);
  }
}
