import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { RouteOptimizationService } from '../services/route-optimization.service';
import { 
  OptimizeRouteDto, 
  RouteUpdateDto,
  optimizeRouteSchema,
  routeUpdateSchema,
  createZodValidationPipe,
  AuthGuard,
  Roles 
} from '@yatms/common';
import { RolesGuard } from '../guards/roles.guard';



@Controller('traffic/routes')
@UseGuards(AuthGuard, RolesGuard)
export class RouteOptimizationController {
  constructor(
    private readonly routeOptimizationService: RouteOptimizationService,
  ) {}

  @Post('optimize')
  @Roles('driver', 'fleet_manager', 'admin')
  async optimizeRoute(
    @Body(createZodValidationPipe(optimizeRouteSchema)) optimizeRouteDto: OptimizeRouteDto,
    @Request() req: any,
  ) {
    const userId = req.user?.userId;

    if (!userId) {
      throw new Error('User ID not found in request');
    }

    return this.routeOptimizationService.optimizeRoute(optimizeRouteDto, userId);
  }

  @Post('test')
  async testRoute(@Request() req: any) {
    return {
      message: 'Route optimization test endpoint working',
      timestamp: new Date().toISOString(),
      user: req.user,
    };
  }

  @Get('kafka-health')
  async getKafkaHealth() {
    return this.routeOptimizationService.getKafkaHealth();
  }

  @Post('kafka-test')
  async testKafkaPublishing() {
    return this.routeOptimizationService.testKafkaPublishing();
  }

  @Get('google-maps-test')
  async testGoogleMaps() {
    return this.routeOptimizationService.testGoogleMaps();
  }

  @Get('status/:requestId')
  async getRouteStatus(@Param('requestId') requestId: string) {
    return this.routeOptimizationService.getRouteStatus(requestId);
  }

  @Get('tracking/:vehicleId')
  @Roles('driver', 'fleet_manager', 'admin')
  async getRouteTracking(@Param('vehicleId') vehicleId: string) {
    return this.routeOptimizationService.getRouteTracking(vehicleId);
  }

  @Get('history/:userId')
  @Roles('driver', 'fleet_manager', 'admin')
  async getRouteHistory(
    @Param('userId') userId: string,
    @Request() req: any,
  ) {
    // Temporarily skip authentication for testing
    return this.routeOptimizationService.getRouteHistory(userId);
  }

  @Put(':routeId/update')
  @Roles('driver', 'fleet_manager', 'admin')
  async updateRoute(
    @Param('routeId') routeId: string,
    @Body(createZodValidationPipe(routeUpdateSchema)) updateDto: RouteUpdateDto,
    @Request() req: any,
  ) {
    const vehicleId = req.body?.vehicleId || req.query?.vehicleId;
    if (!vehicleId) {
      throw new Error('Vehicle ID is required for route update');
    }

    return this.routeOptimizationService.updateRoute(routeId, updateDto, vehicleId);
  }
}
