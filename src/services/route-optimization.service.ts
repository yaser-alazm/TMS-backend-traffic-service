import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { GoogleMapsService } from './google-maps.service';
import { KafkaService } from '@yatms/common';
import { PrismaService } from '../prisma/prisma.service';
import { RouteOptimizationGateway } from '../websocket/route-optimization.gateway';
import {
  OptimizeRouteDto,
  RouteUpdateDto,
  OptimizedRouteResponse,
  Waypoint,
  OptimizationMetrics,
} from '@yatms/common';
import { RouteOptimizationStatus, RouteUpdateReason } from '@prisma/client';

@Injectable()
export class RouteOptimizationService {
  private readonly logger = new Logger(RouteOptimizationService.name);

  constructor(
    private prisma: PrismaService,
    private googleMapsService: GoogleMapsService,
    private kafkaService: KafkaService,
    private routeOptimizationGateway: RouteOptimizationGateway,
  ) {}

  async optimizeRoute(
    optimizeRouteDto: OptimizeRouteDto,
    userId: string,
  ): Promise<OptimizedRouteResponse> {
    const requestId = uuidv4();
    this.logger.log(`Starting route optimization for request ${requestId}`);

    try {
      // Create route optimization request
      const routeRequest = await this.prisma.routeOptimizationRequest.create({
        data: {
          id: requestId,
          vehicleId: optimizeRouteDto.vehicleId,
          userId,
          stops: optimizeRouteDto.stops,
          preferences: optimizeRouteDto.preferences,
          status: RouteOptimizationStatus.PROCESSING,
        },
      });

      // Publish route optimization requested event (non-blocking)
      this.publishRouteOptimizationRequestedEvent(requestId, optimizeRouteDto, userId).catch(error => {
        this.logger.warn(`Failed to publish route optimization requested event: ${error.message}`);
      });

      // Broadcast WebSocket update
      this.routeOptimizationGateway.broadcastRouteOptimizationRequested(requestId, {
        vehicleId: optimizeRouteDto.vehicleId,
        userId,
        status: 'PROCESSING',
      });

      // Optimize route using Google Maps
      const optimizedRoute = await this.googleMapsService.optimizeRoute(
        optimizeRouteDto.stops,
        optimizeRouteDto.preferences,
      );

      // Calculate optimization metrics (simplified calculation)
      const optimizationMetrics = this.calculateOptimizationMetrics(optimizedRoute);

      // Save optimized route
      const savedRoute = await this.prisma.optimizedRoute.create({
        data: {
          requestId,
          vehicleId: optimizeRouteDto.vehicleId,
          totalDistance: optimizedRoute.totalDistance,
          totalDuration: optimizedRoute.totalDuration,
          waypoints: optimizedRoute.waypoints,
          optimizationMetrics,
          polyline: optimizedRoute.polyline,
        },
      });

      // Update request status
      await this.prisma.routeOptimizationRequest.update({
        where: { id: requestId },
        data: {
          status: RouteOptimizationStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      // Publish route optimized event (non-blocking)
      this.publishRouteOptimizedEvent(requestId, optimizeRouteDto.vehicleId, optimizedRoute, optimizationMetrics).catch(error => {
        this.logger.warn(`Failed to publish route optimized event: ${error.message}`);
      });

      // Broadcast WebSocket update
      this.routeOptimizationGateway.broadcastRouteOptimized(requestId, {
        vehicleId: optimizeRouteDto.vehicleId,
        optimizedRoute: {
          totalDistance: optimizedRoute.totalDistance,
          totalDuration: optimizedRoute.totalDuration,
          waypoints: optimizedRoute.waypoints,
        },
        optimizationMetrics,
      });

      return {
        requestId,
        optimizedRoute: {
          totalDistance: optimizedRoute.totalDistance,
          totalDuration: optimizedRoute.totalDuration,
          waypoints: optimizedRoute.waypoints,
        },
        optimizationMetrics,
      };
    } catch (error) {
      this.logger.error(`Failed to optimize route for request ${requestId}:`, error);

      // Update request status to failed
      await this.prisma.routeOptimizationRequest.update({
        where: { id: requestId },
        data: {
          status: RouteOptimizationStatus.FAILED,
          completedAt: new Date(),
        },
      });

      // Broadcast WebSocket update for failure
      this.routeOptimizationGateway.broadcastRouteOptimizationFailed(requestId, error);

      throw error;
    }
  }

  async getRouteStatus(requestId: string) {
    const request = await this.prisma.routeOptimizationRequest.findUnique({
      where: { id: requestId },
      include: { 
        optimizedRoutes: {
          include: {
            updates: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException(`Route optimization request ${requestId} not found`);
    }

    return request;
  }

  async getRouteTracking(vehicleId: string) {
    const activeRoutes = await this.prisma.optimizedRoute.findMany({
      where: { vehicleId },
      include: {
        request: true,
        updates: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      vehicleId,
      activeRoutes,
      totalRoutes: activeRoutes.length,
    };
  }

  async getRouteHistory(userId: string) {
    const requests = await this.prisma.routeOptimizationRequest.findMany({
      where: { userId },
      include: {
        optimizedRoutes: {
          include: {
            updates: {
              orderBy: { createdAt: 'desc' },
              take: 5,
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return {
      userId,
      requests,
      totalRequests: requests.length,
    };
  }

  async updateRoute(
    routeId: string,
    updateDto: RouteUpdateDto,
    vehicleId: string,
  ) {
    const route = await this.prisma.optimizedRoute.findFirst({
      where: { id: routeId, vehicleId },
    });

    if (!route) {
      throw new NotFoundException(`Route ${routeId} not found for vehicle ${vehicleId}`);
    }

    try {
      // Create route update record
      await this.prisma.routeUpdate.create({
        data: {
          routeId,
          vehicleId,
          updateReason: updateDto.reason as RouteUpdateReason,
          newWaypoints: route.waypoints as Waypoint[], 
        },
      });

      // Publish route update requested event (non-blocking)
      this.publishRouteUpdateRequestedEvent(routeId, vehicleId, updateDto).catch(error => {
        this.logger.warn(`Failed to publish route update requested event: ${error.message}`);
      });

      // Broadcast WebSocket update
      this.routeOptimizationGateway.broadcastRouteUpdateRequested(routeId, {
        vehicleId,
        currentLocation: updateDto.currentLocation,
        reason: updateDto.reason,
      });

      return {
        routeId,
        vehicleId,
        updateReason: updateDto.reason,
        currentLocation: updateDto.currentLocation,
        updatedAt: new Date().toISOString(),
        message: 'Route update recorded successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update route ${routeId}:`, error);
      throw error;
    }
  }

  private calculateOptimizationMetrics(optimizedRoute: OptimizedRouteResponse['optimizedRoute']) {
    // Simplified calculation - in real implementation, compare with original route
    const baseTime = optimizedRoute.totalDuration * 1.2; // Assume 20% improvement
    const baseDistance = optimizedRoute.totalDistance * 1.15; // Assume 15% improvement

    return {
      timeSaved: Math.round(baseTime - optimizedRoute.totalDuration),
      distanceSaved: Math.round((baseDistance - optimizedRoute.totalDistance) * 100) / 100,
      fuelSaved: Math.round((baseDistance - optimizedRoute.totalDistance) * 0.1 * 100) / 100, // Assume 0.1L per km
    };
  }

  private async publishRouteOptimizationRequestedEvent(
    requestId: string,
    optimizeRouteDto: OptimizeRouteDto,
    userId: string,
  ) {
    this.logger.log(`Starting to publish route optimization requested event for request ${requestId}`);
    
    const event = {
      eventId: uuidv4(),
      eventType: 'ROUTE_OPTIMIZATION_REQUESTED',
      timestamp: new Date(),
      source: 'traffic-service',
      version: '1.0',
      data: {
        requestId,
        vehicleId: optimizeRouteDto.vehicleId,
        userId,
        stops: optimizeRouteDto.stops,
        preferences: optimizeRouteDto.preferences,
      },
    };

    this.logger.log(`Publishing event to Kafka: ${event.eventId}`);
    
    this.kafkaService.publishEvent('route-optimization-events', event).then(() => {
      this.logger.log(`Route optimization requested event published: ${event.eventId}`);
    }).catch(error => {
      this.logger.warn(`Failed to publish route optimization requested event: ${error.message}`);
    });
  }

  private async publishRouteOptimizedEvent(
    requestId: string,
    vehicleId: string,
    optimizedRoute: OptimizedRouteResponse['optimizedRoute'],
    optimizationMetrics: OptimizationMetrics,
  ) {
    this.logger.log(`Starting to publish route optimized event for request ${requestId}`);
    
    const event = {
      eventId: uuidv4(),
      eventType: 'ROUTE_OPTIMIZED',
      timestamp: new Date(),
      source: 'traffic-service',
      version: '1.0',
      data: {
        requestId,
        vehicleId,
        optimizedRoute: {
          totalDistance: optimizedRoute.totalDistance,
          totalDuration: optimizedRoute.totalDuration,
          waypoints: optimizedRoute.waypoints,
        },
        optimizationMetrics,
      },
    };

    this.logger.log(`Publishing route optimized event to Kafka: ${event.eventId}`);
    
    this.kafkaService.publishEvent('route-optimization-events', event).then(() => {
      this.logger.log(`Route optimized event published: ${event.eventId}`);
    }).catch(error => {
      this.logger.warn(`Failed to publish route optimized event: ${error.message}`);
    });
  }

  private async publishRouteUpdateRequestedEvent(
    routeId: string,
    vehicleId: string,
    updateDto: RouteUpdateDto,
  ) {
    const event = {
      eventId: uuidv4(),
      eventType: 'ROUTE_UPDATE_REQUESTED',
      timestamp: new Date(),
      source: 'traffic-service',
      version: '1.0',
      data: {
        routeId,
        vehicleId,
        currentLocation: updateDto.currentLocation,
        reason: updateDto.reason,
      },
    };

    this.kafkaService.publishEvent('route-update-events', event).then(() => {
      this.logger.log(`Route update requested event published: ${event.eventId}`);
    }).catch(error => {
      this.logger.warn(`Failed to publish route update requested event: ${error.message}`);
    });
  }

  async getKafkaHealth() {
    try {
      // Test Kafka connection with a simple event
      const testEvent = {
        eventId: uuidv4(),
        eventType: 'HEALTH_CHECK',
        timestamp: new Date(),
        source: 'traffic-service',
        version: '1.0',
        data: {
          message: 'Health check test',
        },
      };

      await this.kafkaService.publishEvent('route-optimization-events', testEvent);
      
      return {
        status: 'healthy',
        message: 'Kafka connection is working',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Kafka connection failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async testKafkaPublishing() {
    const startTime = Date.now();
    
    try {
      this.logger.log('Starting Kafka publishing test...');
      
      // Test publishing to route optimization events topic
      const testEvent = {
        eventId: uuidv4(),
        eventType: 'ROUTE_OPTIMIZATION_REQUESTED',
        timestamp: new Date(),
        source: 'traffic-service',
        version: '1.0',
        data: {
          requestId: uuidv4(),
          vehicleId: 'test-vehicle-id',
          userId: 'test-user-id',
          stops: [
            { id: 'stop-1', latitude: 40.7128, longitude: -74.0060, address: 'Test Stop 1' },
            { id: 'stop-2', latitude: 40.7589, longitude: -73.9851, address: 'Test Stop 2' }
          ],
          preferences: { avoidTolls: false, avoidHighways: false, optimizeFor: 'time' }
        },
      };

      this.logger.log('Publishing test event to route-optimization-events...');
      await this.kafkaService.publishEvent('route-optimization-events', testEvent);
      
      const duration = Date.now() - startTime;
      
      return {
        status: 'success',
        message: 'Kafka publishing test completed successfully',
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Kafka publishing test failed:', error);
      
      return {
        status: 'failed',
        message: `Kafka publishing test failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  async testGoogleMaps() {
    const startTime = Date.now();
    
    try {
      this.logger.log('Starting Google Maps API test...');
      
      // Test with simple route optimization
      const testStops = [
        { latitude: 40.7128, longitude: -74.0060, address: 'New York, NY' },
        { latitude: 40.7589, longitude: -73.9851, address: 'Times Square, NY' }
      ];
      
      const testPreferences = {
        avoidTolls: false,
        avoidHighways: false,
        optimizeFor: 'time' as const
      };

      this.logger.log('Testing Google Maps route optimization...');
      const result = await this.googleMapsService.optimizeRoute(testStops, testPreferences);
      
      const duration = Date.now() - startTime;
      
      return {
        status: 'success',
        message: 'Google Maps API test completed successfully',
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
        result: {
          totalDistance: result.totalDistance,
          totalDuration: result.totalDuration,
          waypointsCount: result.waypoints.length,
          hasPolyline: !!result.polyline,
          isMockData: !result.polyline || result.polyline === ''
        }
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('Google Maps API test failed:', error);
      
      return {
        status: 'failed',
        message: `Google Maps API test failed: ${error instanceof Error ? error.message : String(error)}`,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
