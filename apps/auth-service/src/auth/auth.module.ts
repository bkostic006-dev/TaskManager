import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER } from '@tally/contracts';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      // `getOrThrow` rather than a baked-in default: a fallback secret compiled
      // into the image would be invisible. The zero-config boot the reviewer
      // gets comes from compose's `${JWT_SECRET:-…}` instead, which is visible
      // where it is chosen — and `main.ts` warns at boot when that placeholder
      // is what arrived, because `getOrThrow` cannot: the variable is always
      // set on the documented run path.
      //
      // `signOptions` is the signer's half of the contract the gateway verifies
      // against; both sides read the same constants so they cannot drift.
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: JWT_ALGORITHM,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, TokenService],
})
export class AuthModule {}
