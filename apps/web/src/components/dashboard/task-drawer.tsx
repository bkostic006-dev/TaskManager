'use client';

import { useEffect, useState } from 'react';
import { Button, Drawer, Group, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { TASK_DESCRIPTION_MAX_LENGTH, TASK_TITLE_MAX_LENGTH, type Task } from '@tally/contracts';

import type { ApiRequestError } from '@/lib/api-client';
import { fieldError } from '@/lib/form-errors';

/** The mockup's copy, verbatim: what happened, then what to do about it. */
const MISSING_TITLE = 'This task needs a title. Add a few words so you can find it later.';

export interface TaskDrawerProps {
  opened: boolean;
  /** The task being edited, or `null` for create — the only difference between the two modes. */
  task: Task | null;
  /** The row's numeral, repeated in the header so an edit never loses its place. */
  numeral: string | null;
  saving: boolean;
  /** The last save failure, so a `400` can be shown under the field that caused it. */
  error: ApiRequestError | null;
  onClose: () => void;
  onSubmit: (values: { title: string; description: string }) => void;
  onDelete: (task: Task) => void;
}

/**
 * Create and edit, in one right drawer.
 *
 * A drawer rather than a modal because editing is a comparison job — the list
 * and the numeral spine stay visible beside it — and because it degrades to a
 * full-height sheet at 360px where a modal would have to become one anyway.
 *
 * There is no status control here even though the design source shows one:
 * completion is a domain action with its own routes, and `PATCH /tasks/:id`
 * answers `400` for a `completed` field. The row's checkbox owns it.
 */
export function TaskDrawer({
  opened,
  task,
  numeral,
  saving,
  error,
  onClose,
  onSubmit,
  onDelete,
}: TaskDrawerProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);

  // Reloads the fields whenever the drawer opens onto a different task, which
  // is also what clears a previous edit out of create mode.
  useEffect(() => {
    if (opened) {
      setTitle(task?.title ?? '');
      setDescription(task?.description ?? '');
      setTouched(false);
    }
  }, [opened, task]);

  const isBlank = title.trim() === '';
  const titleError = touched && isBlank ? MISSING_TITLE : fieldError(error, 'title');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (isBlank) {
      return;
    }
    onSubmit({ title: title.trim(), description: description.trim() });
  }

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      size="min(420px, 100%)"
      closeButtonProps={{ 'aria-label': 'Close without saving' }}
      title={
        <Group gap={10} align="baseline" wrap="nowrap">
          {numeral !== null && (
            <Text
              aria-hidden
              ff="heading"
              fz={24}
              fw={600}
              lh={1}
              c="ink.4"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {numeral}
            </Text>
          )}
          <Text ff="heading" fz={24} fw={600} lh={1}>
            {task === null ? 'New task' : 'Edit task'}
          </Text>
        </Group>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <Stack gap="md">
          <TextInput
            label="Task title"
            withAsterisk
            data-autofocus
            maxLength={TASK_TITLE_MAX_LENGTH}
            placeholder="What needs doing?"
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
            onBlur={() => setTouched(true)}
            error={titleError}
            disabled={saving}
          />

          <Textarea
            label="Notes"
            minRows={3}
            maxRows={8}
            maxLength={TASK_DESCRIPTION_MAX_LENGTH}
            placeholder="Anything you'll want to remember later."
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            error={fieldError(error, 'description')}
            disabled={saving}
          />

          <Group gap="sm" mt="sm">
            <Button type="submit" loading={saving}>
              Save task
            </Button>
            <Button variant="default" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            {task !== null && (
              <Button
                variant="subtle"
                color="brass"
                ml="auto"
                disabled={saving}
                onClick={() => onDelete(task)}
              >
                Delete task
              </Button>
            )}
          </Group>
        </Stack>
      </form>
    </Drawer>
  );
}
