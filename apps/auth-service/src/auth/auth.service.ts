import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import {
  AuthSession,
  AuthUser,
  DomainError,
  ErrorCode,
  PASSWORD_MIN_LENGTH,
} from '@tally/contracts';
import { AuthRepository } from './auth.repository';
import { MintedRefreshToken, TokenService } from './token.service';
import type { User } from '../../generated/prisma';

/** argon2id: the variant hardened against both GPU cracking and side channels. */
const HASH_OPTIONS = { type: argon2.argon2id } as const;

/**
 * One message for every credential failure.
 *
 * "No such account" and "wrong password" are the same answer on purpose — the
 * distinction is only useful to someone enumerating addresses.
 */
const CREDENTIALS_REJECTED = "That email and password don't match.";

/** Same message for every unusable refresh token: absent, dead, or expired. */
const SESSION_REJECTED = 'That session has expired. Log in again.';

/** Any RFC 4122 variant, which is what the `@db.Uuid` column will accept. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * All user-related logic in the system, per the brief's split of
 * responsibilities. Nothing here knows about HTTP status codes or cookies:
 * failures are `DomainError`s, and the plaintext refresh token is handed back
 * to the gateway, which decides how it reaches the browser.
 */
@Injectable()
export class AuthService {
  /**
   * A real argon2 hash of a value nobody knows, verified against when an email
   * does not exist. See {@link login}.
   */
  private dummyHash?: Promise<string>;

  constructor(
    private readonly repository: AuthRepository,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Registers an account and logs it straight in.
   *
   * The gateway's DTO has already validated the payload; the checks repeated
   * here are the service guarding its own invariants, because this endpoint is
   * reachable by anything on the internal network — including a future service
   * that forgot the rules.
   *
   * @throws DomainError `Validation` on a blank field or a short password,
   * `Conflict` when the email is taken.
   */
  async signup(input: { email: string; password: string; name: string }): Promise<AuthSession> {
    const email = normaliseEmail(input.email);
    const name = input.name.trim();

    if (!email || !name) {
      throw new DomainError(ErrorCode.Validation, 'Email and name are required.');
    }
    if (input.password.length < PASSWORD_MIN_LENGTH) {
      throw new DomainError(
        ErrorCode.Validation,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      );
    }

    const passwordHash = await argon2.hash(input.password, HASH_OPTIONS);
    const user = await this.repository.createUser({ email, name, passwordHash });

    return this.issueSession(user);
  }

  /**
   * Exchanges credentials for a session.
   *
   * An unknown email still costs a full argon2 verification, against a dummy
   * hash. Returning early would make the rejection arrive in microseconds
   * instead of the ~50ms a real hash takes, and that gap is a reliable oracle
   * for which addresses have accounts — a side channel that needs no access at
   * all, just a stopwatch.
   *
   * @throws DomainError `Unauthorized` — with the same message either way, so
   * the response body leaks nothing the timing no longer does.
   */
  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const user = await this.repository.findUserByEmail(normaliseEmail(input.email));
    const hash = user ? user.passwordHash : await this.getDummyHash();

    const matches = await argon2.verify(hash, input.password).catch(() => false);

    if (!user || !matches) {
      throw new DomainError(ErrorCode.Unauthorized, CREDENTIALS_REJECTED);
    }

    return this.issueSession(user);
  }

  /**
   * Rotates a refresh token: the brief's only hard requirement.
   *
   * Every successful refresh burns the token it was given and returns a new
   * one, so a stolen cookie is useful only until the legitimate client next
   * refreshes — after that the thief's copy is dead, and so is the victim's if
   * the thief moved first, which is what makes the theft visible.
   *
   * The revoke is a compare-and-swap, so two callers holding the same token
   * cannot both succeed; see {@link AuthRepository.rotateRefreshToken}. The
   * loser is rejected exactly like a replay, because at this layer they are
   * indistinguishable.
   *
   * Everything that can fail happens *before* the write: the user is loaded and
   * the replacement token is minted first, so the only step left after the old
   * token dies is returning it. The revoke and the insert are one transaction
   * for the same reason — a user must never be left holding a credential the
   * database has already burned.
   *
   * A dead token revokes only itself. Killing the whole chain on reuse is the
   * correct response to a confirmed theft, but it also logs out an honest user
   * whose two tabs raced, and doing it properly needs a lineage walk this stage
   * does not have. It is a named future improvement, not an oversight.
   *
   * @throws DomainError `Unauthorized` when the token is unknown, expired,
   * already rotated, or lost the race.
   */
  async refresh(refreshToken: string): Promise<AuthSession> {
    const now = new Date();
    const tokenHash = this.tokens.hashRefreshToken(refreshToken);

    const record = await this.repository.findRefreshToken(tokenHash);
    if (!record) {
      throw new DomainError(ErrorCode.Unauthorized, SESSION_REJECTED);
    }

    const user = await this.repository.findUserById(record.userId);
    if (!user) {
      throw new DomainError(ErrorCode.Unauthorized, SESSION_REJECTED);
    }

    const minted = this.tokens.mintRefreshToken();
    const rotated = await this.repository.rotateRefreshToken({
      tokenId: record.id,
      tokenHash,
      now,
      successor: {
        userId: record.userId,
        tokenHash: minted.tokenHash,
        expiresAt: minted.expiresAt,
      },
    });

    if (!rotated) {
      throw new DomainError(ErrorCode.Unauthorized, SESSION_REJECTED);
    }

    return this.buildSession(user, minted);
  }

  /**
   * Ends a session.
   *
   * Silent when the token is already dead or unknown: logout is idempotent, and
   * a client clearing a stale cookie should not be told it failed. The access
   * token stays valid until it expires — there is no denylist, which is why its
   * lifetime is 15 minutes.
   */
  async logout(refreshToken: string): Promise<void> {
    await this.repository.revokeIfActive(this.tokens.hashRefreshToken(refreshToken), new Date());
  }

  /**
   * Looks up an account by id, for the gateway's `/auth/me`.
   *
   * The shape check is not redundant with the database. `id` reaches a
   * `@db.Uuid` column, and Postgres rejects a value it cannot parse as a uuid
   * with an error Prisma raises as an unhandled failure — so an id like
   * `not-a-uuid` would leave here as `500` rather than as an answer. The
   * gateway only ever passes the `sub` of a verified token, so this is
   * unreachable in normal use; it is here because "unreachable" is exactly the
   * kind of claim that turns out to be false, and the cost is one regex.
   *
   * @throws DomainError `NotFound` when the id is malformed or has no account —
   * otherwise reachable only if a user was deleted while holding an unexpired
   * access token. The gateway turns that into a `401`, because a client with a
   * valid token for a vanished account needs to be told to log in again, not
   * that a page is missing.
   */
  async findUser(id: string): Promise<AuthUser> {
    if (!UUID_PATTERN.test(id)) {
      throw new DomainError(ErrorCode.NotFound, 'That account no longer exists.');
    }

    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new DomainError(ErrorCode.NotFound, 'That account no longer exists.');
    }

    return toAuthUser(user);
  }

  /**
   * Mints an access/refresh pair and persists the refresh side.
   *
   * The first session of a chain only — {@link refresh} does its own write,
   * because rotation has to revoke and insert in one transaction and this does
   * not.
   */
  private async issueSession(user: User): Promise<AuthSession> {
    const minted = this.tokens.mintRefreshToken();
    await this.repository.createRefreshToken({
      userId: user.id,
      tokenHash: minted.tokenHash,
      expiresAt: minted.expiresAt,
    });

    return this.buildSession(user, minted);
  }

  /**
   * Assembles the reply once the refresh token's row is committed.
   *
   * Signing happens here rather than beside the insert so that nothing which
   * can throw is left after a write that has already destroyed a credential.
   */
  private async buildSession(user: User, minted: MintedRefreshToken): Promise<AuthSession> {
    return {
      accessToken: await this.tokens.signAccessToken(user),
      user: toAuthUser(user),
      refreshToken: minted.token,
      refreshExpiresAt: minted.expiresAt.toISOString(),
    };
  }

  /**
   * Computed once and reused. Hashing per request would add ~50ms to every
   * login, and the value is arbitrary — only the work it forces matters.
   */
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= argon2.hash('unknown-account-timing-equaliser', HASH_OPTIONS);
    return this.dummyHash;
  }
}

/** Case and whitespace are not part of an identity; the unique index is exact. */
function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Narrows the row to the public shape, dropping `passwordHash` explicitly. */
function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}
