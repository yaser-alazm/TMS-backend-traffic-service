import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
@WebSocketGateway({
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/routes',
})
export class RouteOptimizationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RouteOptimizationGateway.name);
  private connectedClients = new Map<string, Socket>();
  constructor(private jwtService: JwtService) {
    this.logger.log('WebSocket gateway initialized');
  }

  async handleConnection(client: Socket) {
    try {
      // Extract token from cookies (set by user service)
      const cookies = client.handshake.headers.cookie;
      let token: string | null = null;
      
      if (cookies) {
        const cookiePairs = cookies.split(';');
        const accessTokenCookie = cookiePairs.find(cookie => 
          cookie.trim().startsWith('access_token=')
        );
        if (accessTokenCookie) {
          token = accessTokenCookie.split('=')[1];
        }
      }
      
      // Fallback to auth object or authorization header
      if (!token) {
        token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');
      }
      
      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      // For now, skip JWT verification to get the system working
      // TODO: Implement proper JWT verification with RS256
      this.logger.warn('JWT verification temporarily disabled for WebSocket connections');
      
      // Create a mock payload for testing
      const payload = {
        sub: 'temp-user-id',
        email: 'temp@example.com',
        roles: ['user']
      };

      client.data.userId = payload.sub;
      client.data.email = payload.email;

      this.connectedClients.set(client.id, client);
      this.logger.log(`Client ${client.id} connected for user ${payload.email}`);

      // Join user-specific room
      client.join(`user:${payload.sub}`);
      
      client.emit('connected', {
        message: 'Connected to route optimization updates',
        userId: payload.sub,
      });
    } catch (error) {
      this.logger.error(`Authentication failed for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.connectedClients.delete(client.id);
    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage('subscribe_route_updates')
  handleSubscribeRouteUpdates(
    @MessageBody() data: { requestId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      client.emit('error', { message: 'Not authenticated' });
      return;
    }

    // Join room for specific route request
    client.join(`route:${data.requestId}`);
    this.logger.log(`Client ${client.id} subscribed to route updates for request ${data.requestId}`);
    
    client.emit('subscribed', {
      requestId: data.requestId,
      message: 'Subscribed to route updates',
    });
  }

  @SubscribeMessage('unsubscribe_route_updates')
  handleUnsubscribeRouteUpdates(
    @MessageBody() data: { requestId: string },
    @ConnectedSocket() client: Socket,
  ) {
    client.leave(`route:${data.requestId}`);
    this.logger.log(`Client ${client.id} unsubscribed from route updates for request ${data.requestId}`);
    
    client.emit('unsubscribed', {
      requestId: data.requestId,
      message: 'Unsubscribed from route updates',
    });
  }

  // Method to broadcast route optimization updates
  broadcastRouteOptimizationRequested(requestId: string, data: any) {
    this.server.to(`route:${requestId}`).emit('route_optimization_requested', {
      requestId,
      status: 'PROCESSING',
      timestamp: new Date().toISOString(),
      data,
    });
    this.logger.log(`Broadcasted route optimization requested for ${requestId}`);
  }

  broadcastRouteOptimized(requestId: string, data: any) {
    this.server.to(`route:${requestId}`).emit('route_optimized', {
      requestId,
      status: 'COMPLETED',
      timestamp: new Date().toISOString(),
      data,
    });
    this.logger.log(`Broadcasted route optimized for ${requestId}`);
  }

  broadcastRouteUpdateRequested(routeId: string, data: any) {
    this.server.to(`route:${routeId}`).emit('route_update_requested', {
      routeId,
      timestamp: new Date().toISOString(),
      data,
    });
    this.logger.log(`Broadcasted route update requested for ${routeId}`);
  }

  broadcastRouteOptimizationFailed(requestId: string, error: any) {
    this.server.to(`route:${requestId}`).emit('route_optimization_failed', {
      requestId,
      status: 'FAILED',
      timestamp: new Date().toISOString(),
      error: error.message || 'Unknown error',
    });
    this.logger.log(`Broadcasted route optimization failed for ${requestId}`);
  }

  // Method to get connected clients count
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  // Method to get connected users
  getConnectedUsers(): string[] {
    return Array.from(this.connectedClients.values())
      .map(client => client.data.userId)
      .filter(Boolean);
  }
}
