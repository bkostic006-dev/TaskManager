import { Module } from '@nestjs/common';
import { CoreModule } from '../common/core.module';
import { TasksClient } from './tasks.client';
import { TasksController } from './tasks.controller';

@Module({
  imports: [CoreModule],
  controllers: [TasksController],
  providers: [TasksClient],
})
export class TasksModule {}
