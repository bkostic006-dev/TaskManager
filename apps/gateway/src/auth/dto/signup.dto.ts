import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { PASSWORD_MIN_LENGTH } from '@tally/contracts';

import { emailMessage } from './email-message';

/** Guards against a body large enough to make argon2 the denial of service. */
const PASSWORD_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 80;

/**
 * The signup payload. Messages are the copy the signup form shows verbatim, so
 * a field rejected by the server reads the same as one rejected by the browser.
 */
export class SignupDto {
  @IsEmail({}, { message: emailMessage })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH, {
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
  })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @IsString()
  @MinLength(1, { message: 'Enter your name.' })
  @MaxLength(NAME_MAX_LENGTH)
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}
