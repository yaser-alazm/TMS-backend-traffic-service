import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'traffic-service',
      version: '0.0.1',
    };
  }

  @Get('ready')
  ready() {
    // Add readiness checks here (database, external services, etc.)
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      service: 'traffic-service',
    };
  }

  @Get('live')
  live() {
    // Add liveness checks here
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
      service: 'traffic-service',
    };
  }
}
