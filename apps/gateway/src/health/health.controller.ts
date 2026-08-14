import { Controller, Get } from '@nestjs/common';
import { HEALTH_ROUTE, HealthResponse } from '@tally/contracts';
import { Public } from '../common/public.decorator';

// Public because the compose healthcheck has no credentials: a guarded /health
// answers 401, the container never reports healthy, and everything that depends
// on the gateway refuses to start.
@Public()
@Controller(HEALTH_ROUTE)
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', service: 'gateway' };
  }
}
