-- AlterTable
ALTER TABLE "route_optimization_requests" ADD COLUMN     "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
