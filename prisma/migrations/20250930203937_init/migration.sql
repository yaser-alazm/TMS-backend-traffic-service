-- CreateEnum
CREATE TYPE "RouteOptimizationStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RouteUpdateReason" AS ENUM ('TRAFFIC_CHANGE', 'DRIVER_REQUEST', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "TrafficConditionType" AS ENUM ('CLEAR', 'SLOW', 'HEAVY', 'BLOCKED');

-- CreateEnum
CREATE TYPE "TrafficSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "route_optimization_requests" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stops" JSONB NOT NULL,
    "preferences" JSONB NOT NULL,
    "status" "RouteOptimizationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "route_optimization_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "optimized_routes" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "totalDistance" DOUBLE PRECISION NOT NULL,
    "totalDuration" INTEGER NOT NULL,
    "waypoints" JSONB NOT NULL,
    "optimizationMetrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "optimized_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_updates" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "updateReason" "RouteUpdateReason" NOT NULL,
    "newWaypoints" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "route_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "traffic_conditions" (
    "id" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "condition" "TrafficConditionType" NOT NULL,
    "severity" "TrafficSeverity" NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "traffic_conditions_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "optimized_routes" ADD CONSTRAINT "optimized_routes_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "route_optimization_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_updates" ADD CONSTRAINT "route_updates_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "optimized_routes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
