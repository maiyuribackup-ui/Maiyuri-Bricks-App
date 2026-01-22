import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { success, error, parseBody } from "@/lib/api-utils";
import {
  calculateDistanceSchema,
  type DistanceCalculation,
} from "@maiyuri/shared";

// Calculate distance between two points using Haversine formula
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// POST /api/distance/calculate - Calculate distance and transport cost
export async function POST(request: NextRequest) {
  try {
    const parsed = await parseBody(request, calculateDistanceSchema);
    if (parsed.error) return parsed.error;

    const { destination_latitude, destination_longitude } = parsed.data;

    // Get factory settings
    const { data: factorySettings, error: settingsError } = await supabaseAdmin
      .from("factory_settings")
      .select(
        "latitude, longitude, transport_rate_per_km, min_transport_charge",
      )
      .limit(1)
      .single();

    if (settingsError || !factorySettings) {
      return error(
        "Factory settings not configured. Please set factory location first.",
        400,
      );
    }

    // Calculate distance using Haversine formula (straight-line distance)
    const straightLineDistance = haversineDistance(
      factorySettings.latitude,
      factorySettings.longitude,
      destination_latitude,
      destination_longitude,
    );

    // Road distance is typically 1.3-1.5x straight-line distance
    // Using 1.4 as a reasonable multiplier for Tamil Nadu roads
    const roadDistanceMultiplier = 1.4;
    const distanceKm =
      Math.round(straightLineDistance * roadDistanceMultiplier * 10) / 10;

    // Estimate duration (assuming average 40 km/h for loaded trucks)
    const averageSpeedKmh = 40;
    const durationMinutes = Math.round((distanceKm / averageSpeedKmh) * 60);

    // Calculate transport cost
    const transportRate = factorySettings.transport_rate_per_km || 15;
    const minCharge = factorySettings.min_transport_charge || 500;
    const transportCost = Math.max(distanceKm * transportRate, minCharge);

    const result: DistanceCalculation = {
      distanceKm,
      durationMinutes,
      transportCost: Math.round(transportCost),
    };

    return success<DistanceCalculation>(result);
  } catch (err) {
    console.error("Error calculating distance:", err);
    return error("Internal server error", 500);
  }
}

// Alternative endpoint using Google Distance Matrix API
// Uncomment and configure GOOGLE_MAPS_SERVER_KEY environment variable to use
/*
async function calculateWithGoogleMaps(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number
): Promise<{ distanceKm: number; durationMinutes: number }> {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    throw new Error('Google Maps API key not configured');
  }

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', `${originLat},${originLng}`);
  url.searchParams.set('destinations', `${destLat},${destLng}`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('units', 'metric');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status !== 'OK' || !data.rows?.[0]?.elements?.[0]) {
    throw new Error('Failed to calculate distance');
  }

  const element = data.rows[0].elements[0];
  if (element.status !== 'OK') {
    throw new Error('Route not found');
  }

  return {
    distanceKm: element.distance.value / 1000,
    durationMinutes: Math.round(element.duration.value / 60),
  };
}
*/
