import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TASK_DESCRIPTION_MAX_LENGTH, TASK_TITLE_MAX_LENGTH } from '@tally/contracts';

/** Trims a string and leaves anything else for the validator to reject. */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * The edit payload: title, description, or both.
 *
 * **`completed` is not accepted here and must not be added.** Completion is a
 * domain action with its own two routes, because the flag and the timestamp
 * have to move together — a field edit setting `completed: true` would leave
 * `completedAt` null, or would have to re-stamp it on every save. With
 * `forbidNonWhitelisted` on the global pipe, sending the field is a `400` that
 * names it, which is a better answer than accepting it and ignoring it.
 *
 * `description: null` is how a client clears the note, and it is distinct from
 * omitting the field, which leaves the note untouched. `@IsOptional()` passes
 * `null` through unvalidated, and the task service reads the difference: the
 * key is present with a `null` value, rather than absent.
 */
export class UpdateTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Give the task a title.' })
  @MaxLength(TASK_TITLE_MAX_LENGTH, {
    message: `Title must be ${TASK_TITLE_MAX_LENGTH} characters or fewer.`,
  })
  @Transform(trim)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(TASK_DESCRIPTION_MAX_LENGTH, {
    message: `Description must be ${TASK_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
  })
  @Transform(trim)
  description?: string | null;
}
