import { Module } from '@nestjs/common';
import { CoreModule } from '../common/core.module';
import { AuthClient } from './auth.client';
import { AuthController } from './auth.controller';

@Module({
  imports: [CoreModule],
  controllers: [AuthController],
  providers: [AuthClient],
})
export class AuthModule {}
