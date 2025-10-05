import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface GoogleMapsRouteResponse {
  routes: Array<{
    legs: Array<{
      distance: { value: number; text: string };
      duration: { value: number; text: string };
      steps: Array<{
        start_location: { lat: number; lng: number };
        end_location: { lat: number; lng: number };
        distance: { value: number; text: string };
        duration: { value: number; text: string };
        html_instructions: string;
      }>;
    }>;
    overview_polyline: { points: string };
  }>;
  status: string;
}

export interface OptimizedRoute {
  totalDistance: number;
  totalDuration: number;
  waypoints: Array<{
    latitude: number;
    longitude: number;
    address: string;
    estimatedArrival: string;
  }>;
  polyline: string;
}

@Injectable()
export class GoogleMapsService {
  private readonly logger = new Logger(GoogleMapsService.name);
  private readonly apiKey: string;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api';

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY') || '';
    if (!this.apiKey || this.apiKey === 'your_google_maps_api_key_here') {
      this.logger.warn('Google Maps API key not configured, using mock data');
      this.apiKey = ''; // Force mock mode
    }
  }

  async optimizeRoute(
    stops: Array<{ latitude: number; longitude: number; address: string }>,
    preferences: {
      avoidTolls: boolean;
      avoidHighways: boolean;
      optimizeFor: 'time' | 'distance' | 'fuel';
    }
  ): Promise<OptimizedRoute> {
    if (!this.apiKey) {
      this.logger.warn('Google Maps API key not configured, using mock data');
      return this.getMockOptimizedRoute(stops);
    }

    try {
      const waypoints = stops.slice(1, -1).map(stop => 
        `${stop.latitude},${stop.longitude}`
      ).join('|');

      const origin = `${stops[0].latitude},${stops[0].longitude}`;
      const destination = `${stops[stops.length - 1].latitude},${stops[stops.length - 1].longitude}`;

      const params = new URLSearchParams({
        origin,
        destination,
        waypoints: waypoints || '',
        key: this.apiKey,
        optimize: 'true',
        avoid: this.buildAvoidString(preferences),
        mode: 'driving',
        units: 'metric',
      });

      const response = await axios.get<GoogleMapsRouteResponse>(
        `${this.baseUrl}/directions/json?${params}`
      );

      if (response.data.status !== 'OK') {
        throw new Error(`Google Maps API error: ${response.data.status}`);
      }

      const route = response.data.routes[0];

      const totalDistance = route.legs.reduce((sum, leg) => sum + leg.distance.value, 0) / 1000; // Convert to kilometers
      const totalDuration = route.legs.reduce((sum, leg) => sum + leg.duration.value, 0); // In seconds

      // Calculate estimated arrival times for each waypoint
      const waypointsWithArrival = stops.map((stop, index) => {
        let estimatedArrival = new Date();
        
        if (index > 0) {
          // Add duration for previous legs
          for (let i = 0; i < index; i++) {
            estimatedArrival = new Date(estimatedArrival.getTime() + (route.legs[i]?.duration.value || 0) * 1000);
          }
        }

        return {
          latitude: stop.latitude,
          longitude: stop.longitude,
          address: stop.address,
          estimatedArrival: estimatedArrival.toISOString(),
        };
      });

      return {
        totalDistance,
        totalDuration,
        waypoints: waypointsWithArrival,
        polyline: route.overview_polyline.points,
      };
    } catch (error) {
      this.logger.error('Failed to optimize route with Google Maps:', error);
      throw error;
    }
  }

  async geocodeAddress(address: string): Promise<{ latitude: number; longitude: number }> {
    if (!this.apiKey) {
      throw new Error('Google Maps API key not configured');
    }

    try {
      const params = new URLSearchParams({
        address,
        key: this.apiKey,
      });

      const response = await axios.get(
        `${this.baseUrl}/geocode/json?${params}`
      );

      if (response.data.status !== 'OK' || !response.data.results.length) {
        throw new Error(`Geocoding failed for address: ${address}`);
      }

      const location = response.data.results[0].geometry.location;
      return {
        latitude: location.lat,
        longitude: location.lng,
      };
    } catch (error) {
      this.logger.error(`Failed to geocode address ${address}:`, error);
      throw error;
    }
  }

  private buildAvoidString(preferences: {
    avoidTolls: boolean;
    avoidHighways: boolean;
  }): string {
    const avoids: string[] = [];
    if (preferences.avoidTolls) avoids.push('tolls');
    if (preferences.avoidHighways) avoids.push('highways');
    return avoids.join('|');
  }

  private getMockOptimizedRoute(stops: Array<{ latitude: number; longitude: number; address: string }>): OptimizedRoute {
    if (stops.length < 2) {
      return {
        totalDistance: 0,
        totalDuration: 0,
        waypoints: stops.map(stop => ({
          latitude: stop.latitude,
          longitude: stop.longitude,
          address: stop.address,
          estimatedArrival: new Date().toISOString(),
        })),
        polyline: '',
      };
    }

    // Actually optimize the route order using a simple nearest neighbor algorithm
    const optimizedStops = this.optimizeStopOrder(stops);
    
    // Calculate realistic distances between consecutive stops using Haversine formula
    let totalDistance = 0;
    let totalDuration = 0;
    const waypoints: Array<{
      latitude: number;
      longitude: number;
      address: string;
      estimatedArrival: string;
    }> = [];
    let currentTime = Date.now();

    for (let i = 0; i < optimizedStops.length; i++) {
      const stop = optimizedStops[i];
      
      // Calculate distance to next stop (if not the last stop)
      if (i < optimizedStops.length - 1) {
        const nextStop = optimizedStops[i + 1];
        const distance = this.calculateHaversineDistance(
          stop.latitude, stop.longitude,
          nextStop.latitude, nextStop.longitude
        );
        totalDistance += distance;
        
        // Estimate travel time based on distance (assuming average speed of 30 km/h in city)
        const travelTimeMinutes = Math.round((distance / 1000) * 2); // 2 minutes per km
        totalDuration += travelTimeMinutes;
        
        // Add 5 minutes for stop/loading time (except for last stop)
        if (i < optimizedStops.length - 1) {
          totalDuration += 5;
        }
      }

      // Calculate estimated arrival time
      const estimatedArrival = new Date(currentTime + (totalDuration * 60000));
      
      waypoints.push({
        latitude: stop.latitude,
        longitude: stop.longitude,
        address: stop.address,
        estimatedArrival: estimatedArrival.toISOString(),
      });
    }

    return {
      totalDistance: Math.round(totalDistance), // Keep in meters
      totalDuration: totalDuration * 60, // Convert to seconds
      waypoints,
      polyline: '',
    };
  }

  private optimizeStopOrder(stops: Array<{ latitude: number; longitude: number; address: string }>): Array<{ latitude: number; longitude: number; address: string }> {
    if (stops.length <= 2) {
      return stops; // No optimization needed for 1-2 stops
    }

    // Simple nearest neighbor algorithm for route optimization
    const optimizedStops: Array<{ latitude: number; longitude: number; address: string }> = [];
    const remainingStops = [...stops];
    
    // Start with the first stop
    let currentStop = remainingStops.shift()!;
    optimizedStops.push(currentStop);
    
    // Find the nearest stop to the current one, repeat until all stops are visited
    while (remainingStops.length > 0) {
      let nearestStopIndex = 0;
      let shortestDistance = Infinity;
      
      for (let i = 0; i < remainingStops.length; i++) {
        const distance = this.calculateHaversineDistance(
          currentStop.latitude, currentStop.longitude,
          remainingStops[i].latitude, remainingStops[i].longitude
        );
        
        if (distance < shortestDistance) {
          shortestDistance = distance;
          nearestStopIndex = i;
        }
      }
      
      // Move to the nearest stop
      currentStop = remainingStops.splice(nearestStopIndex, 1)[0];
      optimizedStops.push(currentStop);
    }
    
    return optimizedStops;
  }

  /**
   * Calculate distance between two points using Haversine formula
   * Returns distance in meters
   */
  private calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
