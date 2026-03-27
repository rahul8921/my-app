import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, Polyline } from 'react-leaflet';
import L from 'leaflet';
import type { RideWithDetails } from '@/types';

// --- Custom Icons ---
const createDotIcon = (color: string, glowColor?: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="position: relative; width: 18px; height: 18px;">
        <div class="custom-marker-dot" style="background-color: ${color}; width: 100%; height: 100%; position: absolute;"></div>
        ${glowColor ? `<div class="pulse-ring" style="background-color: ${glowColor};"></div>` : ''}
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
};

const ICONS = {
  pickup: createDotIcon('#222222'), // Black dot
  dropoff: createDotIcon('#111111'), // Black dot
  driver: createDotIcon('#7c3aed', '#7c3aed'), // Accent purple with pulse
  user: createDotIcon('#3b82f6', '#3b82f6'), // Blue with pulse
};

// --- Map View Updater Component ---
function MapUpdater({ 
  center, 
  bounds 
}: { 
  center?: [number, number]; 
  bounds?: L.LatLngBoundsExpression;
}) {
  const map = useMap();
  
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 1 });
    } else if (center) {
      map.setView(center, map.getZoom(), { animate: true, duration: 1 });
    }
  }, [center, bounds, map]);

  return null;
}

// --- Main Map Component ---
interface MapUIProps {
  userLocation: { lat: number; lng: number };
  activeRide?: RideWithDetails | null;
  pendingRides?: RideWithDetails[];
  driverLocation?: { lat: number; lng: number } | null;
  mode: 'rider' | 'driver';
  selectionMarker?: { lat: number; lng: number } | null;
}

export function MapUI({ userLocation, activeRide, pendingRides, driverLocation, mode, selectionMarker }: MapUIProps) {
  
  // Calculate bounds to fit relevant markers
  let bounds: L.LatLngBoundsExpression | undefined = undefined;
  let center: [number, number] = [userLocation.lat, userLocation.lng];

  if (activeRide) {
    const pts: [number, number][] = [
      [activeRide.pickupLat, activeRide.pickupLng],
      [activeRide.dropoffLat, activeRide.dropoffLng]
    ];
    if (activeRide.driver?.currentLat && activeRide.driver?.currentLng) {
      pts.push([activeRide.driver.currentLat, activeRide.driver.currentLng]);
    }
    bounds = L.latLngBounds(pts);
  } else if (selectionMarker) {
    bounds = L.latLngBounds([
      [userLocation.lat, userLocation.lng],
      [selectionMarker.lat, selectionMarker.lng]
    ]);
  } else if (mode === 'driver' && pendingRides && pendingRides.length > 0) {
    const pts: [number, number][] = [
      [userLocation.lat, userLocation.lng],
      ...pendingRides.map(r => [r.pickupLat, r.pickupLng] as [number, number])
    ];
    bounds = L.latLngBounds(pts);
  }

  return (
    <div className="w-full h-full relative bg-muted z-0">
      <MapContainer 
        center={center} 
        zoom={14} 
        zoomControl={false}
        className="w-full h-full"
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />
        
        <MapUpdater center={!bounds ? center : undefined} bounds={bounds} />

        {/* User Location Marker (if no active ride or if rider and ride is pending) */}
        {!activeRide && mode === 'rider' && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={ICONS.user} />
        )}

        {/* Selection Marker for requesting a ride */}
        {selectionMarker && !activeRide && (
          <>
            <Marker position={[selectionMarker.lat, selectionMarker.lng]} icon={ICONS.dropoff} />
            <Polyline 
              positions={[
                [userLocation.lat, userLocation.lng], 
                [selectionMarker.lat, selectionMarker.lng]
              ]} 
              color="#222" 
              weight={4} 
              dashArray="8 8" 
              opacity={0.5} 
            />
          </>
        )}

        {/* Pending Rides for Driver */}
        {mode === 'driver' && !activeRide && pendingRides?.map(ride => (
          <Marker key={ride.id} position={[ride.pickupLat, ride.pickupLng]} icon={ICONS.pickup} />
        ))}

        {/* Active Ride Markers & Route */}
        {activeRide && (
          <>
            <Marker position={[activeRide.pickupLat, activeRide.pickupLng]} icon={ICONS.pickup} />
            <Marker position={[activeRide.dropoffLat, activeRide.dropoffLng]} icon={ICONS.dropoff} />
            
            <Polyline 
              positions={[
                [activeRide.pickupLat, activeRide.pickupLng], 
                [activeRide.dropoffLat, activeRide.dropoffLng]
              ]} 
              color="#222" 
              weight={4} 
              opacity={0.8} 
            />

            {activeRide.driver?.currentLat && activeRide.driver?.currentLng && (
              <Marker 
                position={[activeRide.driver.currentLat, activeRide.driver.currentLng]} 
                icon={ICONS.driver} 
              />
            )}
            
            {/* If driver, show own location if no driver location on ride object yet */}
            {mode === 'driver' && driverLocation && (!activeRide.driver?.currentLat) && (
              <Marker position={[driverLocation.lat, driverLocation.lng]} icon={ICONS.driver} />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}
