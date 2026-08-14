import { Controller, Get } from '@nestjs/common';
import { HEALTH_ROUTE, HealthResponse } from '@tally/contracts';

@Controller(HEALTH_ROUTE)
export class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: 'ok', service: 'gateway' };
  }
}
