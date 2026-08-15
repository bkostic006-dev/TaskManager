import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '@tally/contracts';
import { PrismaService } from '../prisma/prisma.service';
import type { RefreshToken, User } from '../../generated/prisma';

/** Prisma's code for a unique-constraint violation. */
const UNIQUE_VIOLATION = 'P2002';

/**
 * Every database statement the auth service issues, and the only layer that
 * knows Prisma exists.
 *
 * It also owns the one translation Prisma forces on us: a unique-constraint
 * violation is a domain `Conflict`, and this is the only place with enough
 * context to say so.
 */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Inserts a new account.
   *
   * The taken-email check is the insert itself rather than a preceding
   * `findUnique`: two signups for the same address can interleave between a
   * check and a write, and the unique index is the only thing that actually
   * arbitrates. Reading P2002 back off the failure is therefore not a fallback
   * — it is the primary path.
   *
   * @throws DomainError `Conflict` when the email is already registered.
   */
  async createUser(data: { email: string; name: string; passwordHash: string }): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        throw new DomainError(ErrorCode.Conflict, 'That email is already registered.');
      }
      throw error;
    }
  }

  createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({ data });
  }

  findRefreshToken(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  /**
   * Revokes a refresh token, but only if it is still live — the compare and
   * swap that makes rotation safe.
   *
   * Two requests can present the same token at the same instant: a client
   * firing parallel 401 retries, React StrictMode double-invoking an effect, or
   * an attacker replaying a stolen cookie. `findUnique` then `update` cannot
   * separate them, because both reads see an unrevoked row before either write
   * lands, and both would go on to mint a session.
   *
   * `updateMany` narrowed on `revokedAt: null` pushes the decision into a single
   * statement: Postgres serialises the two updates, the first matches one row
   * and the second matches none. The returned count is the verdict, and it is
   * the caller's only proof that it won. `update()` cannot express this — it
   * locates a row by unique key alone and throws when it is missing, so the
   * "already revoked" case is indistinguishable from "never existed".
   *
   * `expiresAt` is in the same predicate rather than checked separately, so a
   * token that lapses between the read and the write also loses.
   *
   * @returns `true` for the single caller that revoked it; `false` for everyone
   * else, whether the token was already rotated, expired, or never existed.
   */
  async revokeIfActive(tokenHash: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });

    return count === 1;
  }

  /**
   * Rotation, as one database transaction: revoke the presented token, insert
   * its replacement, and record the link between them.
   *
   * The three statements are here rather than sequenced by the service because
   * atomicity is the whole point and it cannot be expressed from a layer that
   * does not know Prisma exists. Run separately, a failure after the revoke —
   * a dropped connection, a restart, or simply the gateway abandoning the call
   * at its three-second timeout while this side keeps going — destroys the
   * user's only credential without ever delivering the replacement. They are
   * logged out by a `500` they cannot retry, because the token the retry would
   * present is already dead. Inside a transaction that failure rolls back to a
   * session the client still holds.
   *
   * The compare-and-swap is unchanged and still the verdict: `updateMany`
   * narrowed on `revokedAt: null` behaves identically inside a transaction —
   * the second caller blocks on the row lock, then re-evaluates the predicate
   * after the winner commits and matches nothing. See {@link revokeIfActive}
   * for why the rowcount, and not a preceding read, is what decides.
   *
   * The successor is inserted with the caller's already-minted hash, so the
   * plaintext token never reaches this layer.
   *
   * @returns `true` for the caller that won the swap and now holds a committed
   * new session; `false` if the token was already rotated, expired, or unknown,
   * in which case nothing was written.
   */
  rotateRefreshToken(input: {
    tokenId: string;
    tokenHash: string;
    now: Date;
    successor: { userId: string; tokenHash: string; expiresAt: Date };
  }): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.refreshToken.updateMany({
        where: { tokenHash: input.tokenHash, revokedAt: null, expiresAt: { gt: input.now } },
        data: { revokedAt: input.now },
      });

      if (count !== 1) {
        return false;
      }

      const successor = await tx.refreshToken.create({ data: input.successor });

      // Not load-bearing today — nothing reads the chain yet. It is written
      // because reuse-detection (revoking a whole lineage when a dead token
      // reappears) is a listed future improvement, and reconstructing the links
      // afterwards is impossible; the rows are hashes with no other relation to
      // each other.
      await tx.refreshToken.update({
        where: { id: input.tokenId },
        data: { replacedById: successor.id },
      });

      return true;
    });
  }
}
