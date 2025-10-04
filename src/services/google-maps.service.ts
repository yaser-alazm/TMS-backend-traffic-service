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
    // Calculate mock distance and duration based on stops
    const totalDistance = stops.length * 1000; // 1km per stop
    const totalDuration = stops.length * 300; // 5 minutes per stop
    
    const waypoints = stops.map((stop, index) => ({
      latitude: stop.latitude,
      longitude: stop.longitude,
      address: stop.address,
      estimatedArrival: new Date(Date.now() + (index + 1) * 300000).toISOString(), // 5 minutes per stop
    }));

    return {
      totalDistance,
      totalDuration,
      waypoints,
      polyline: '',
    };
  }
}
