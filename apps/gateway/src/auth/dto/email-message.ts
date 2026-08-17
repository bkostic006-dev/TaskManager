import type { ValidationArguments } from 'class-validator';

/**
 * The message `@IsEmail` shows, chosen from the value it rejected.
 *
 * An empty box and a malformed address are different mistakes and deserve
 * different sentences — "Enter a valid email address." reads as though the user
 * typed something wrong when in fact they typed nothing, and the name and
 * password fields already say "Enter your name." / "Enter your password."
 *
 * Done as one constraint with a computed message rather than adding a separate
 * `@MinLength(1)`: an empty box would fail *both* rules, and the form renders
 * only `details.email[0]`, so which sentence appeared would depend on the order
 * class-validator happened to collect the two failures in.
 */
export function emailMessage({ value }: ValidationArguments): string {
  const missing = typeof value !== 'string' || value.trim() === '';
  return missing ? 'Enter your email address.' : 'Enter a valid email address.';
}
