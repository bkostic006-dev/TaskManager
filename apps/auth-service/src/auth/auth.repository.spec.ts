import { ErrorCode } from '@tally/contracts';
import { AuthRepository } from './auth.repository';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthRepository', () => {
  const prisma = {
    user: { create: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  };
  const repository = new AuthRepository(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  describe('revokeIfActive', () => {
    it('narrows on liveness so the database, not the caller, arbitrates', async () => {
      const now = new Date('2026-08-14T12:00:00.000Z');
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await expect(repository.revokeIfActive('a-hash', now)).resolves.toBe(true);

      // Both predicates matter and both must be in the *same* statement. Read
      // separately, a concurrent rotation or a lapse between the read and the
      // write goes unnoticed and two sessions are minted from one token.
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'a-hash', revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
    });

    it('reports failure rather than throwing when nothing matched', async () => {
      // Zero rows is every dead case at once: already revoked, past its
      // expiry, or never issued. The caller gets one answer for all three,
      // which is exactly what the 401 should not distinguish either.
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });

      await expect(repository.revokeIfActive('a-hash', new Date())).resolves.toBe(false);
    });
  });

  describe('createUser', () => {
    it('turns a unique-constraint violation into a Conflict', async () => {
      prisma.user.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

      await expect(
        repository.createUser({ email: 'taken@northbay.dev', name: 'Dana', passwordHash: 'x' }),
      ).rejects.toMatchObject({ code: ErrorCode.Conflict });
    });

    it('lets anything else through untranslated', async () => {
      // A connection failure is not a taken email. Swallowing it into a 409
      // would tell the user to pick another address while the database is down.
      const outage = Object.assign(new Error('connection refused'), { code: 'P1001' });
      prisma.user.create.mockRejectedValue(outage);

      await expect(
        repository.createUser({ email: 'new@northbay.dev', name: 'Dana', passwordHash: 'x' }),
      ).rejects.toBe(outage);
    });
  });
});
