import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const PASSWORD_MAX_LENGTH = 128;

/**
 * The login payload.
 *
 * Deliberately *not* `SignupDto` minus a field: the password rule here is
 * "present", not "at least ten characters". Sharing the rule would reject an
 * older short password with a `400` that names the policy, telling an attacker
 * the length of a password that exists. Wrong credentials are always `401`.
 */
export class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address.' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password.' })
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
