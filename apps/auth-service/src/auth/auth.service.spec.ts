import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { DomainError, ErrorCode } from '@tally/contracts';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';
import type { RefreshToken, User } from '../../generated/prisma';

// argon2's exports are non-configurable, so `jest.spyOn` cannot wrap them.
// Replacing the module with one whose `verify` delegates to the real
// implementation keeps the hashing genuine — the point of the test below is
// that the work happens, so stubbing it out would test nothing.
jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return { ...actual, verify: jest.fn(actual.verify) };
});

const verifySpy = argon2.verify as unknown as jest.Mock;

const PASSWORD = 'correct-horse-battery';

/** Only the columns this service reads; the rest never leave the repository. */
function userFixture(passwordHash: string): User {
  return {
    id: 'user-1',
    email: 'dana@northbay.dev',
    name: 'Dana Whitfield',
    passwordHash,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

function tokenRowFixture(tokenHash: string): RefreshToken {
  return {
    id: 'token-row-1',
    userId: 'user-1',
    tokenHash,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedById: null,
    createdAt: new Date(),
  };
}

describe('AuthService', () => {
  let repository: jest.Mocked<AuthRepository>;
  let tokens: TokenService;
  let service: AuthService;

  beforeEach(() => {
    repository = {
      findUserByEmail: jest.fn(),
      findUserById: jest.fn(),
      createUser: jest.fn(),
      createRefreshToken: jest.fn().mockResolvedValue({ id: 'token-row-2' }),
      findRefreshToken: jest.fn(),
      revokeIfActive: jest.fn(),
      linkSuccessor: jest.fn(),
    } as unknown as jest.Mocked<AuthRepository>;

    tokens = new TokenService(new JwtService({ secret: 'test-only-signing-key' }));
    service = new AuthService(repository, tokens);
    verifySpy.mockClear();
  });

  describe('refresh', () => {
    it('burns the presented token and issues a different one', async () => {
      const presented = 'the-old-refresh-token';
      const presentedHash = tokens.hashRefreshToken(presented);

      repository.findRefreshToken.mockResolvedValue(tokenRowFixture(presentedHash));
      repository.revokeIfActive.mockResolvedValue(true);
      repository.findUserById.mockResolvedValue(userFixture('unused'));

      const session = await service.refresh(presented);

      expect(session.refreshToken).not.toBe(presented);
      expect(repository.revokeIfActive).toHaveBeenCalledWith(presentedHash, expect.any(Date));

      // The stored hash must be the new token's, or the client would hold a
      // credential the database has never seen.
      expect(repository.createRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ tokenHash: tokens.hashRefreshToken(session.refreshToken) }),
      );
      expect(repository.linkSuccessor).toHaveBeenCalledWith('token-row-1', 'token-row-2');
    });

    it('rejects a token that lost the compare-and-swap, without issuing anything', async () => {
      // What a replay of an already-rotated token looks like from here, and
      // equally what the loser of two simultaneous refreshes sees.
      repository.findRefreshToken.mockResolvedValue(tokenRowFixture('some-hash'));
      repository.revokeIfActive.mockResolvedValue(false);

      await expect(service.refresh('a-dead-token')).rejects.toMatchObject({
        code: ErrorCode.Unauthorized,
      });

      // The point of the swap: the loser must not mint a session anyway.
      expect(repository.createRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects an unknown token before attempting to revoke it', async () => {
      repository.findRefreshToken.mockResolvedValue(null);

      await expect(service.refresh('never-issued')).rejects.toBeInstanceOf(DomainError);
      expect(repository.revokeIfActive).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects a wrong password', async () => {
      repository.findUserByEmail.mockResolvedValue(
        userFixture(await argon2.hash(PASSWORD, { type: argon2.argon2id })),
      );

      await expect(
        service.login({ email: 'dana@northbay.dev', password: 'not-the-password' }),
      ).rejects.toMatchObject({ code: ErrorCode.Unauthorized });
    });

    it('answers an unknown email identically, and still pays for a hash', async () => {
      repository.findUserByEmail.mockResolvedValue(null);

      const rejection = await service
        .login({ email: 'nobody@northbay.dev', password: 'not-the-password' })
        .catch((error: DomainError) => error);

      expect(rejection).toMatchObject({
        code: ErrorCode.Unauthorized,
        message: "That email and password don't match.",
      });

      // The message alone is not the defence. Skipping the verification would
      // return in microseconds and let anyone with a stopwatch enumerate which
      // addresses have accounts, so an unknown email must still cost one hash.
      expect(verifySpy).toHaveBeenCalledTimes(1);
    });
  });
});
