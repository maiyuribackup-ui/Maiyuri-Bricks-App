'use client';

import { useState, useRef } from 'react';
import { Card, Spinner } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';

interface DeliveryLocationInputProps {
  address: string;
  distanceKm: number | null;
  transportCost: number;
  onAddressChange: (address: string) => void;
  onLocationSelect: (lat: number, lng: number, address: string) => void;
  isCalculating: boolean;
}

export function DeliveryLocationInput({
  address,
  distanceKm,
  transportCost,
  onAddressChange,
  onLocationSelect,
  isCalculating,
}: DeliveryLocationInputProps) {
  const [showManualCoords, setShowManualCoords] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  const handleManualSubmit = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);

    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      onLocationSelect(lat, lng, address || `${lat}, ${lng}`);
    }
  };

  // Simple geocoding using Nominatim (OpenStreetMap) - free alternative
  const handleAddressSearch = async () => {
    if (!address || address.length < 5) return;

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
        { headers: { 'User-Agent': 'MaiyuriBricksApp/1.0' } }
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const { lat, lon, display_name } = data[0];
        onLocationSelect(parseFloat(lat), parseFloat(lon), display_name);
        onAddressChange(display_name);
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  };

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium text-slate-900 dark:text-white">
        Delivery Location
      </h3>

      <div className="space-y-3">
        {/* Address Input */}
        <div>
          <label className="mb-1 block text-sm text-slate-600 dark:text-slate-400">
            Delivery Address
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={address}
              onChange={(e) => onAddressChange(e.target.value)}
              placeholder="Enter delivery address..."
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
            <button
              type="button"
              onClick={handleAddressSearch}
              disabled={!address || address.length < 5 || isCalculating}
              className="flex items-center gap-1 rounded-md bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCalculating ? (
                <Spinner size="sm" />
              ) : (
                <SearchIcon className="h-4 w-4" />
              )}
              Search
            </button>
          </div>
        </div>

        {/* Manual Coordinates Toggle */}
        <button
          type="button"
          onClick={() => setShowManualCoords(!showManualCoords)}
          className="flex items-center gap-1 text-sm text-amber-600 hover:text-amber-700 dark:text-amber-400"
        >
          <LocationIcon className="h-4 w-4" />
          {showManualCoords ? 'Hide' : 'Enter'} coordinates manually
        </button>

        {/* Manual Coordinates Input */}
        {showManualCoords && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={manualLat}
                  onChange={(e) => setManualLat(e.target.value)}
                  placeholder="e.g., 10.7905"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-500">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={manualLng}
                  onChange={(e) => setManualLng(e.target.value)}
                  placeholder="e.g., 78.7047"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleManualSubmit}
              disabled={!manualLat || !manualLng || isCalculating}
              className="mt-2 w-full rounded-md bg-slate-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Calculate Distance
            </button>
          </div>
        )}

        {/* Distance & Transport Info */}
        {distanceKm !== null && (
          <div className="rounded-md border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TruckIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-medium text-green-700 dark:text-green-300">
                    Distance: {distanceKm.toFixed(1)} km
                  </p>
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Estimated driving distance from factory
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-green-700 dark:text-green-300">
                  Rs.{transportCost.toFixed(2)}
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  Transport cost
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// Icon Components
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function LocationIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function TruckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  );
}

export default DeliveryLocationInput;
