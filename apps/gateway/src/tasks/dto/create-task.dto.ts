import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TASK_DESCRIPTION_MAX_LENGTH, TASK_TITLE_MAX_LENGTH } from '@tally/contracts';

/** Trims a string and leaves anything else for the validator to reject. */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * The create payload.
 *
 * There is no `completed` field, and its absence is the point: a task is opened
 * pending and reaches completion only through `PATCH /tasks/:id/complete`, so
 * `completedAt` is stamped by the transition and can never be dictated by a
 * client. `forbidNonWhitelisted` turns an attempt to send one into a `400`
 * naming the field rather than a silent strip.
 *
 * Messages are the copy the dashboard shows verbatim, so a field rejected by
 * the server reads the same as one rejected by the browser.
 */
export class CreateTaskDto {
  @IsString()
  @MinLength(1, { message: 'Give the task a title.' })
  @MaxLength(TASK_TITLE_MAX_LENGTH, {
    message: `Title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.`,
  })
  @Transform(trim)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(TASK_DESCRIPTION_MAX_LENGTH, {
    message: `Description must be ${TASK_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
  })
  @Transform(trim)
  description?: string;
}
