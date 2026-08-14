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
import { TokenService } from './token.service';
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

    return (await this.issueSession(user)).session;
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

    return (await this.issueSession(user)).session;
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
   * cannot both succeed; see {@link AuthRepository.revokeIfActive}. The loser
   * is rejected exactly like a replay, because at this layer they are
   * indistinguishable.
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

    if (!(await this.repository.revokeIfActive(tokenHash, now))) {
      throw new DomainError(ErrorCode.Unauthorized, SESSION_REJECTED);
    }

    // Only reachable by the caller that won the swap, so this cannot double-issue.
    const user = await this.repository.findUserById(record.userId);
    if (!user) {
      throw new DomainError(ErrorCode.Unauthorized, SESSION_REJECTED);
    }

    const { session, refreshTokenId } = await this.issueSession(user);
    await this.repository.linkSuccessor(record.id, refreshTokenId);

    return session;
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
   * @throws DomainError `NotFound` when the id has no account — reachable only
   * if a user was deleted while holding an unexpired access token.
   */
  async findUser(id: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(id);
    if (!user) {
      throw new DomainError(ErrorCode.NotFound, 'That account no longer exists.');
    }

    return toAuthUser(user);
  }

  /**
   * Mints an access/refresh pair and persists the refresh side.
   *
   * The new row's id comes back beside the session rather than inside it, so
   * {@link refresh} can link the chain without a second lookup and without the
   * id ever reaching a response body.
   */
  private async issueSession(
    user: User,
  ): Promise<{ session: AuthSession; refreshTokenId: string }> {
    const minted = this.tokens.mintRefreshToken();
    const [accessToken, stored] = await Promise.all([
      this.tokens.signAccessToken(user),
      this.repository.createRefreshToken({
        userId: user.id,
        tokenHash: minted.tokenHash,
        expiresAt: minted.expiresAt,
      }),
    ]);

    return {
      session: {
        accessToken,
        user: toAuthUser(user),
        refreshToken: minted.token,
        refreshExpiresAt: minted.expiresAt.toISOString(),
      },
      refreshTokenId: stored.id,
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
