import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      // `getOrThrow` rather than a baked-in default: a fallback secret compiled
      // into the image is one forgotten environment variable away from signing
      // production tokens with a value that is in the repository. The
      // zero-config boot the reviewer gets comes from compose's
      // `${JWT_SECRET:-…}`, which is visible where it is chosen.
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, TokenService],
})
export class AuthModule {}
