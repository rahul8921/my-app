import { useState, useEffect } from 'react';

interface LocationState {
  lat: number;
  lng: number;
  error: string | null;
  loading: boolean;
}

// Default to NYC coordinates for demo purposes if geolocation fails/is denied
const DEFAULT_LAT = 40.7128;
const DEFAULT_LNG = -74.0060;

export function useGeolocation() {
  const [location, setLocation] = useState<LocationState>({
    lat: DEFAULT_LAT,
    lng: DEFAULT_LNG,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocation(prev => ({ ...prev, error: 'Geolocation is not supported', loading: false }));
      return;
    }

    const watcher = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          error: null,
          loading: false,
        });
      },
      (error) => {
        setLocation(prev => ({ ...prev, error: error.message, loading: false }));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    return () => navigator.geolocation.clearWatch(watcher);
  }, []);

  return location;
}
