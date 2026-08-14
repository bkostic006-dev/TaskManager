import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL_MS } from '@tally/contracts';

/** 32 bytes = 256 bits of entropy, the width the plan specifies. */
const REFRESH_TOKEN_BYTES = 32;

/** A freshly minted refresh token: the secret, its digest, and its deadline. */
export interface MintedRefreshToken {
  /** Returned to the caller exactly once. Never persisted. */
  token: string;
  /** What the database stores in its place. */
  tokenHash: string;
  expiresAt: Date;
}

/**
 * Mints the two credentials a session is made of.
 *
 * Separated from `AuthService` so the rotation logic can be tested without a
 * signing key, and so the asymmetry between the two token types has one place
 * to be explained.
 */
@Injectable()
export class TokenService {
  constructor(private readonly jwt: JwtService) {}

  /**
   * Signs the short-lived access token.
   *
   * Only `sub` is load-bearing downstream; `email` rides along so the gateway
   * can attribute a log line without a round trip to this service.
   */
  signAccessToken(user: { id: string; email: string }): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, email: user.email }, { expiresIn: ACCESS_TOKEN_TTL });
  }

  /**
   * Generates an opaque refresh token.
   *
   * Opaque rather than a second JWT because a refresh token must be revocable,
   * and a self-describing token is valid until it expires no matter what the
   * database says. This one means nothing on its own — the row is the authority.
   */
  mintRefreshToken(now = new Date()): MintedRefreshToken {
    const token = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

    return {
      token,
      tokenHash: this.hashRefreshToken(token),
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
    };
  }

  /**
   * Digests a refresh token for storage and lookup.
   *
   * SHA-256, not argon2 — deliberately the opposite choice from passwords. A
   * password is low-entropy and guessable, so hashing it must be slow. This
   * token is 256 random bits, so brute force is not on the table and the only
   * job left is making a database leak unusable. A slow KDF here would instead
   * tax the hot path: refresh runs on a timer for every logged-in user, and the
   * lookup is by hash, so the cost lands on every request rather than on an
   * attacker.
   */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
