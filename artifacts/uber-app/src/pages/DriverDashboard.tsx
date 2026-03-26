import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { MapUI } from "@/components/MapUI";
import { useGeolocation } from "@/hooks/use-geolocation";
import { 
  useGetDriverProfile, 
  useRegisterAsDriver, 
  useUpdateDriverAvailability, 
  useListPendingRides, 
  useGetActiveRide,
  useAcceptRide,
  useStartRide,
  useCompleteRide,
  useUpdateDriverLocation
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatCurrency, cn } from "@/lib/utils";
import { Power, Wallet, MapPin, CarFront, Check, Navigation, Flag } from "lucide-react";
import { useEffect } from "react";

export default function DriverDashboard() {
  const loc = useGeolocation();
  
  // Data hooks with polling
  const { data: profileData, refetch: refetchProfile } = useGetDriverProfile({ query: { refetchInterval: 5000 } });
  const { data: activeRideData, refetch: refetchActive } = useGetActiveRide({ query: { refetchInterval: 3000 } });
  
  const isAvailable = profileData?.profile?.isAvailable ?? false;
  const activeRide = activeRideData?.ride;

  const { data: pendingRidesData } = useListPendingRides({ 
    query: { 
      refetchInterval: 3000,
      enabled: isAvailable && !activeRide 
    } 
  });

  // Mutations
  const registerMut = useRegisterAsDriver();
  const availMut = useUpdateDriverAvailability();
  const locMut = useUpdateDriverLocation();
  const acceptMut = useAcceptRide();
  const startMut = useStartRide();
  const completeMut = useCompleteRide();

  // Registration State
  const [vehicle, setVehicle] = useState("");
  const [plate, setPlate] = useState("");

  // Update location in background when active or available
  useEffect(() => {
    if ((isAvailable || activeRide) && !loc.error && !loc.loading) {
      locMut.mutate({
        data: { lat: loc.lat, lng: loc.lng }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.lat, loc.lng, isAvailable, activeRide?.id]);

  const profile = profileData?.profile;

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vehicle || !plate) return;
    registerMut.mutate({
      data: { vehicle, licensePlate: plate }
    }, { onSuccess: () => refetchProfile() });
  };

  const toggleAvailability = () => {
    if (!profile) return;
    availMut.mutate({
      data: { isAvailable: !profile.isAvailable }
    }, { onSuccess: () => refetchProfile() });
  };

  const handleAccept = (rideId: string) => {
    acceptMut.mutate({ rideId }, { onSuccess: () => refetchActive() });
  };

  const handleStart = () => {
    if (!activeRide) return;
    startMut.mutate({ rideId: activeRide.id }, { onSuccess: () => refetchActive() });
  };

  const handleComplete = () => {
    if (!activeRide) return;
    completeMut.mutate({ rideId: activeRide.id }, { 
      onSuccess: () => {
        refetchActive();
        refetchProfile();
      }
    });
  };

  return (
    <div className="h-screen flex flex-col bg-background relative overflow-hidden">
      <Navbar />

      <main className="flex-1 relative pt-16">
        {/* Map Background */}
        <div className="absolute inset-0 z-0">
          <MapUI 
            mode="driver"
            userLocation={{ lat: loc.lat, lng: loc.lng }}
            driverLocation={{ lat: loc.lat, lng: loc.lng }}
            activeRide={activeRide}
            pendingRides={pendingRidesData || []}
          />
        </div>

        {/* Not Registered Overlay */}
        {!profile && profileData && (
          <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-card p-8 rounded-3xl shadow-2xl border border-border max-w-md w-full">
              <h2 className="text-3xl font-display font-bold text-foreground mb-2">Drive with us</h2>
              <p className="text-muted-foreground mb-8">Register your vehicle to start earning today.</p>
              
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1.5">Vehicle Make & Model</label>
                  <input 
                    required
                    value={vehicle}
                    onChange={e => setVehicle(e.target.value)}
                    placeholder="e.g. Toyota Camry"
                    className="w-full p-4 rounded-xl bg-secondary border-2 border-transparent focus:border-primary outline-none transition-colors text-foreground font-medium"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-foreground mb-1.5">License Plate</label>
                  <input 
                    required
                    value={plate}
                    onChange={e => setPlate(e.target.value)}
                    placeholder="e.g. ABC-1234"
                    className="w-full p-4 rounded-xl bg-secondary border-2 border-transparent focus:border-primary outline-none transition-colors text-foreground font-medium uppercase"
                  />
                </div>
                <button 
                  type="submit"
                  disabled={registerMut.isPending}
                  className="w-full py-4 mt-4 rounded-xl font-bold text-lg bg-primary text-primary-foreground hover:shadow-lg hover:-translate-y-0.5 transition-all disabled:opacity-50"
                >
                  {registerMut.isPending ? "Registering..." : "Complete Registration"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Top Stats Bar */}
        {profile && (
          <div className="absolute top-4 left-0 right-0 z-10 px-4 md:px-8 pointer-events-none">
            <div className="max-w-2xl mx-auto flex gap-4 pointer-events-auto">
              <div className="flex-1 bg-card/90 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-border flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center text-green-600">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-muted-foreground">Today's Earnings</div>
                  <div className="text-2xl font-display font-bold text-foreground">{formatCurrency(profile.totalEarnings)}</div>
                </div>
              </div>
              <button 
                onClick={toggleAvailability}
                disabled={availMut.isPending || !!activeRide}
                className={cn(
                  "px-6 md:px-8 rounded-2xl shadow-lg font-bold text-lg flex items-center gap-3 transition-all",
                  profile.isAvailable 
                    ? "bg-foreground text-background hover:bg-foreground/90" 
                    : "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                  (availMut.isPending || !!activeRide) && "opacity-50 cursor-not-allowed"
                )}
              >
                <Power className="w-6 h-6" />
                <span className="hidden sm:inline">
                  {profile.isAvailable ? "Online" : "Offline"}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom Floating UI */}
        {profile && (
          <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none p-4 md:p-8 flex justify-center pb-8">
            <AnimatePresence mode="wait">
              
              {/* STATE: Online, looking for rides */}
              {isAvailable && !activeRide && (
                <motion.div 
                  key="looking"
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="w-full max-w-md pointer-events-auto"
                >
                  {pendingRidesData && pendingRidesData.length > 0 ? (
                    <div className="bg-card rounded-3xl shadow-2xl border border-border overflow-hidden">
                      <div className="p-4 bg-accent text-accent-foreground text-center font-bold">
                        {pendingRidesData.length} New Requests Nearby
                      </div>
                      <div className="max-h-[50vh] overflow-y-auto p-2">
                        {pendingRidesData.map(ride => (
                          <div key={ride.id} className="p-4 m-2 bg-secondary rounded-2xl">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-foreground font-bold">
                                  {ride.rider?.username?.[0]?.toUpperCase()}
                                </div>
                                <div className="font-bold text-foreground">{ride.rider?.username}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-bold text-lg text-accent">{formatCurrency(ride.fare || 15.00)}</div>
                                <div className="text-xs font-bold text-muted-foreground">EST. FARE</div>
                              </div>
                            </div>
                            
                            <div className="space-y-2 mb-4">
                              <div className="flex items-center gap-3 text-sm">
                                <MapPin className="w-4 h-4 text-muted-foreground" />
                                <span className="text-foreground truncate">{ride.pickupAddress}</span>
                              </div>
                              <div className="flex items-center gap-3 text-sm">
                                <Flag className="w-4 h-4 text-accent" />
                                <span className="text-foreground truncate">{ride.dropoffAddress}</span>
                              </div>
                            </div>

                            <button 
                              onClick={() => handleAccept(ride.id)}
                              disabled={acceptMut.isPending}
                              className="w-full py-3 rounded-xl font-bold bg-foreground text-background hover:bg-foreground/90 transition-colors flex items-center justify-center gap-2"
                            >
                              <Check className="w-5 h-5" /> Accept Request
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-card rounded-full shadow-2xl border border-border p-4 px-8 flex items-center gap-4">
                      <div className="relative flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-accent"></span>
                      </div>
                      <span className="font-bold text-foreground">Scanning for nearby riders...</span>
                    </div>
                  )}
                </motion.div>
              )}

              {/* STATE: Active Ride */}
              {activeRide && (
                <motion.div 
                  key="active-ride"
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 50, opacity: 0 }}
                  className="w-full max-w-md bg-card rounded-3xl shadow-2xl border border-border overflow-hidden pointer-events-auto"
                >
                  <div className="bg-foreground text-background p-4 text-center">
                    <h3 className="font-bold text-lg">
                      {activeRide.status === 'accepted' ? 'Head to Pickup' : 'Drive to Destination'}
                    </h3>
                  </div>

                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6 pb-6 border-b border-border">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-full bg-secondary border border-border overflow-hidden">
                           {activeRide.rider?.profileImageUrl ? (
                             <img src={activeRide.rider.profileImageUrl} alt="Rider" className="w-full h-full object-cover" />
                           ) : (
                             <div className="w-full h-full flex items-center justify-center font-bold text-xl text-muted-foreground">
                               {activeRide.rider?.username?.[0]?.toUpperCase()}
                             </div>
                           )}
                        </div>
                        <div>
                          <div className="font-bold text-xl text-foreground">{activeRide.rider?.username}</div>
                          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Rider</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-display font-bold text-accent">{formatCurrency(activeRide.fare || 0)}</div>
                        <div className="text-xs font-bold text-muted-foreground uppercase">Fare</div>
                      </div>
                    </div>

                    <div className="space-y-4 mb-8">
                      <div className={cn(
                        "p-4 rounded-xl border-2 transition-colors",
                        activeRide.status === 'accepted' ? "border-foreground bg-secondary" : "border-transparent bg-background"
                      )}>
                        <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Pickup Location</div>
                        <div className="font-bold text-foreground text-lg">{activeRide.pickupAddress}</div>
                      </div>
                      
                      <div className={cn(
                        "p-4 rounded-xl border-2 transition-colors",
                        activeRide.status === 'in_progress' ? "border-accent bg-accent/5" : "border-transparent bg-background"
                      )}>
                        <div className="text-xs font-bold text-muted-foreground uppercase mb-1">Dropoff Location</div>
                        <div className="font-bold text-foreground text-lg">{activeRide.dropoffAddress}</div>
                      </div>
                    </div>

                    {activeRide.status === 'accepted' && (
                      <button 
                        onClick={handleStart}
                        disabled={startMut.isPending}
                        className="w-full py-4 rounded-xl font-bold text-lg bg-foreground text-background hover:bg-foreground/90 transition-all flex justify-center items-center gap-2 shadow-xl"
                      >
                        <CarFront className="w-6 h-6" /> 
                        {startMut.isPending ? "Updating..." : "Arrived & Start Trip"}
                      </button>
                    )}

                    {activeRide.status === 'in_progress' && (
                      <button 
                        onClick={handleComplete}
                        disabled={completeMut.isPending}
                        className="w-full py-4 rounded-xl font-bold text-lg bg-accent text-accent-foreground hover:bg-accent/90 transition-all flex justify-center items-center gap-2 shadow-xl shadow-accent/20"
                      >
                        <Check className="w-6 h-6" /> 
                        {completeMut.isPending ? "Completing..." : "Complete Trip"}
                      </button>
                    )}
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        )}

      </main>
    </div>
  );
}
