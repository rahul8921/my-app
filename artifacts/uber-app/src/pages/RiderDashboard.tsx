import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { MapUI } from "@/components/MapUI";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useGetActiveRide, useRequestRide, useCancelRide, useRateRide, useListRideHistory } from "@/lib/api";
import type { RideWithDetails } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Star, ShieldAlert, CarFront } from "lucide-react";
import { formatCurrency, cn } from "@/lib/utils";

const DESTINATIONS = [
  { name: "Times Square", lat: 40.7580, lng: -73.9855, address: "Manhattan, NY 10036" },
  { name: "JFK Airport", lat: 40.6413, lng: -73.7781, address: "Queens, NY 11430" },
  { name: "Central Park", lat: 40.7822, lng: -73.9653, address: "New York, NY" },
  { name: "Brooklyn Bridge", lat: 40.7061, lng: -73.9969, address: "Brooklyn, NY" },
];

export default function RiderDashboard() {
  const userLoc = useGeolocation();

  const { data: activeRideData, refetch: refetchActive } = useGetActiveRide({
    query: { refetchInterval: 3000 }
  });
  const { data: historyData, refetch: refetchHistory } = useListRideHistory();

  const requestMutation = useRequestRide();
  const cancelMutation = useCancelRide();
  const rateMutation = useRateRide();

  const [destination, setDestination] = useState<typeof DESTINATIONS[0] | null>(null);
  const [ratingRide, setRatingRide] = useState<RideWithDetails | null>(null);
  const [rating, setRating] = useState(5);

  const activeRide = activeRideData?.ride;

  useEffect(() => {
    if (!activeRide && historyData) {
      const unrated = historyData.find(r => r.status === "completed" && r.riderRating === null);
      if (unrated && !ratingRide) {
        setRatingRide(unrated);
      }
    }
  }, [activeRide, historyData, ratingRide]);

  const handleRequestRide = () => {
    if (!destination) return;
    const pickupLat = userLoc.error ? 40.7128 : userLoc.lat;
    const pickupLng = userLoc.error ? -74.0060 : userLoc.lng;

    requestMutation.mutate({
      pickupAddress: "Current Location",
      dropoffAddress: destination.address,
      pickupLat,
      pickupLng,
      dropoffLat: destination.lat,
      dropoffLng: destination.lng,
    }, { onSuccess: () => refetchActive() });
  };

  const handleCancel = () => {
    if (!activeRide) return;
    cancelMutation.mutate({ rideId: activeRide.id }, {
      onSuccess: () => { refetchActive(); setDestination(null); }
    });
  };

  const handleRate = () => {
    if (!ratingRide) return;
    rateMutation.mutate({ rideId: ratingRide.id, data: { rating } }, {
      onSuccess: () => { setRatingRide(null); refetchHistory(); }
    });
  };

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      <Navbar />

      <main className="flex-1 relative pt-16">
        <div className="absolute inset-0 z-0">
          <MapUI
            mode="rider"
            userLocation={{ lat: userLoc.lat, lng: userLoc.lng }}
            activeRide={activeRide}
            selectionMarker={!activeRide && destination ? { lat: destination.lat, lng: destination.lng } : null}
          />
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none p-4 md:p-8 flex justify-center pb-8">
          <AnimatePresence mode="wait">

            {!activeRide && !ratingRide && (
              <motion.div
                key="request"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border overflow-hidden pointer-events-auto"
              >
                <div className="p-6">
                  <h2 className="text-2xl font-bold text-foreground mb-6">Where to?</h2>

                  <div className="space-y-4 relative">
                    <div className="absolute left-6 top-5 bottom-5 w-0.5 bg-border z-0" />
                    <div className="relative z-10 flex items-center gap-4 bg-secondary p-4 rounded-xl">
                      <div className="w-4 h-4 rounded-full bg-foreground border-[3px] border-secondary" />
                      <div className="flex-1 font-medium text-foreground">Current Location</div>
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-4 bg-background border-2 border-border focus-within:border-primary p-3 rounded-xl transition-colors">
                        <div className="w-4 h-4 rounded-sm bg-accent border-[3px] border-background shadow-sm" />
                        <input
                          type="text"
                          placeholder="Search destination"
                          className="flex-1 bg-transparent border-none focus:outline-none font-medium text-foreground placeholder:text-muted-foreground"
                          readOnly
                          value={destination?.name || ""}
                        />
                      </div>
                    </div>
                  </div>

                  {!destination && (
                    <div className="mt-6">
                      <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Suggested Destinations</div>
                      <div className="space-y-2">
                        {DESTINATIONS.map(dest => (
                          <button
                            key={dest.name}
                            onClick={() => setDestination(dest)}
                            className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-secondary transition-colors text-left"
                          >
                            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center flex-shrink-0">
                              <MapPin className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="font-bold text-foreground">{dest.name}</div>
                              <div className="text-sm text-muted-foreground">{dest.address}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {destination && (
                    <div className="mt-6 space-y-3">
                      <div className="p-4 rounded-xl bg-secondary flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <CarFront className="w-6 h-6 text-foreground" />
                          <span className="font-bold text-lg">RideNowX</span>
                        </div>
                        <span className="font-bold text-lg text-foreground">~ {formatCurrency(24.50)}</span>
                      </div>
                      <button
                        onClick={handleRequestRide}
                        disabled={requestMutation.isPending}
                        className="w-full py-4 rounded-xl font-bold text-lg bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:transform-none"
                      >
                        {requestMutation.isPending ? "Requesting..." : "Confirm Ride"}
                      </button>
                      <button
                        onClick={() => setDestination(null)}
                        className="w-full py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeRide && (
              <motion.div
                key="active"
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 50, opacity: 0 }}
                className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border overflow-hidden pointer-events-auto"
              >
                <div className={cn(
                  "p-4 text-center border-b border-border/50 transition-colors",
                  activeRide.status === "requested" ? "bg-secondary" : "bg-primary text-primary-foreground"
                )}>
                  <h3 className="font-bold text-lg flex items-center justify-center gap-2">
                    {activeRide.status === "requested" && (
                      <><span className="w-2 h-2 rounded-full bg-accent animate-pulse" /> Finding your driver...</>
                    )}
                    {activeRide.status === "accepted" && "Driver is on the way"}
                    {activeRide.status === "in_progress" && "Heading to destination"}
                  </h3>
                </div>

                <div className="p-6 space-y-6">
                  {activeRide.driver ? (
                    <div className="flex items-center gap-4 bg-secondary/50 p-4 rounded-2xl">
                      <div className="w-14 h-14 rounded-full bg-border overflow-hidden relative">
                        {activeRide.driver.profileImageUrl ? (
                          <img src={activeRide.driver.profileImageUrl} alt="Driver" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground font-bold text-xl">
                            {activeRide.driver.username?.[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-0.5">
                          <div className="bg-accent text-accent-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                            {activeRide.driver.rating?.toFixed(1) || "5.0"} <Star className="w-2.5 h-2.5 fill-current" />
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="font-bold text-lg text-foreground">{activeRide.driver.username}</div>
                        <div className="text-sm font-medium text-muted-foreground">{activeRide.driver.vehicle}</div>
                      </div>
                      <div className="text-right">
                        <div className="px-3 py-1 bg-background border-2 border-border rounded-lg font-mono font-bold text-foreground">
                          {activeRide.driver.licensePlate}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-6">
                      <div className="w-16 h-16 rounded-full border-4 border-muted border-t-accent animate-spin" />
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 w-3 h-3 rounded-full bg-foreground border-2 border-background shadow-sm" />
                      <div>
                        <div className="text-xs font-bold text-muted-foreground uppercase">Pickup</div>
                        <div className="font-medium text-foreground">{activeRide.pickupAddress}</div>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="mt-1 w-3 h-3 rounded-sm bg-accent border-2 border-background shadow-sm" />
                      <div>
                        <div className="text-xs font-bold text-muted-foreground uppercase">Dropoff</div>
                        <div className="font-medium text-foreground">{activeRide.dropoffAddress}</div>
                      </div>
                    </div>
                  </div>

                  {activeRide.status !== "in_progress" && (
                    <button
                      onClick={handleCancel}
                      disabled={cancelMutation.isPending}
                      className="w-full py-3 rounded-xl font-bold text-destructive bg-destructive/10 hover:bg-destructive/20 transition-colors disabled:opacity-50"
                    >
                      {cancelMutation.isPending ? "Cancelling..." : "Cancel Ride"}
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {ratingRide && !activeRide && (
              <motion.div
                key="rating"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border overflow-hidden pointer-events-auto p-8 text-center"
              >
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                  <ShieldAlert className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-bold text-foreground">You've arrived!</h2>
                <p className="text-muted-foreground mt-2">How was your trip with {ratingRide.driver?.username}?</p>

                <div className="flex justify-center gap-2 mt-8 mb-8">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button key={star} onClick={() => setRating(star)} className="transition-transform hover:scale-110 focus:outline-none">
                      <Star className={cn("w-10 h-10 transition-colors", star <= rating ? "fill-accent text-accent" : "text-muted stroke-muted-foreground/30")} />
                    </button>
                  ))}
                </div>

                <div className="p-4 bg-secondary rounded-xl mb-8 flex justify-between items-center">
                  <span className="font-semibold text-muted-foreground">Final Fare</span>
                  <span className="font-bold text-xl text-foreground">{formatCurrency(ratingRide.fare || 0)}</span>
                </div>

                <button
                  onClick={handleRate}
                  disabled={rateMutation.isPending}
                  className="w-full py-4 rounded-xl font-bold text-lg bg-primary text-primary-foreground hover:shadow-lg transition-all"
                >
                  {rateMutation.isPending ? "Submitting..." : "Submit Rating"}
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
