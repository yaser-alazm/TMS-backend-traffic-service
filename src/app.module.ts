import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { MetricsController } from './metrics.controller';
import { MetricsMiddleware } from './metrics.middleware';
import { MetricsService } from './metrics.service';
import { RouteOptimizationController } from './controllers';
import { RouteOptimizationService, GoogleMapsService } from './services';
import { PrismaService } from './prisma/prisma.service';
import { RouteOptimizationGateway } from './websocket/route-optimization.gateway';
import { KafkaModule } from './kafka/kafka.module';
import { AuthGuard } from '@yatms/common';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    JwtModule.register({
      publicKey: process.env.JWT_PUBLIC_KEY_PEM,
      verifyOptions: {
        algorithms: ['RS256'],
        issuer: process.env.AUTH_ISSUER || 'yatms-user-service',
      },
    }),
    KafkaModule,
  ],
  controllers: [
    AppController,
    HealthController,
    MetricsController,
    RouteOptimizationController,
  ],
  providers: [
    AppService,
    MetricsMiddleware,
    MetricsService,
    RouteOptimizationService,
    GoogleMapsService,
    PrismaService,
    RouteOptimizationGateway,
    Reflector,
    AuthGuard,
    RolesGuard,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(MetricsMiddleware).forRoutes('*');
  }
}
