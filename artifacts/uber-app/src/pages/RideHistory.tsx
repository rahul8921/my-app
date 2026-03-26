import { Navbar } from "@/components/Navbar";
import { useListRideHistory } from "@workspace/api-client-react";
import { format } from "date-fns";
import { formatCurrency, cn } from "@/lib/utils";
import { MapPin, ArrowDownToLine, Clock, Star, Car } from "lucide-react";
import { useLocation } from "wouter";

export default function RideHistory() {
  const { data: rides, isLoading } = useListRideHistory();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <div className="flex items-center gap-4 mb-8">
          <button 
            onClick={() => setLocation(-1 as any)}
            className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors"
          >
            <Clock className="w-5 h-5 text-foreground" />
          </button>
          <h1 className="text-3xl font-display font-bold text-foreground">Your Trips</h1>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-secondary/50 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : rides?.length === 0 ? (
          <div className="bg-card border-2 border-dashed border-border rounded-3xl p-12 text-center">
            <div className="w-20 h-20 bg-secondary rounded-full flex items-center justify-center mx-auto mb-4">
              <Car className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold text-foreground">No rides yet</h3>
            <p className="text-muted-foreground mt-2">When you take trips, they will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {rides?.map((ride) => (
              <div key={ride.id} className="bg-card border border-border rounded-2xl p-6 hover:shadow-lg transition-shadow flex flex-col md:flex-row gap-6">
                
                {/* Map Summary Visual */}
                <div className="w-full md:w-48 h-32 bg-secondary rounded-xl flex flex-col justify-center px-4 relative overflow-hidden">
                  <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-border z-0" />
                  
                  <div className="flex items-center gap-3 relative z-10 mb-4">
                    <div className="w-3 h-3 rounded-full bg-foreground border-2 border-secondary" />
                    <div className="text-xs font-bold text-foreground truncate">{ride.pickupAddress}</div>
                  </div>
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-3 h-3 rounded-sm bg-accent border-2 border-secondary" />
                    <div className="text-xs font-bold text-foreground truncate">{ride.dropoffAddress}</div>
                  </div>
                </div>

                {/* Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-bold text-lg text-foreground">
                        {format(new Date(ride.requestedAt), "MMM d, yyyy • h:mm a")}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn(
                          "text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wider",
                          ride.status === 'completed' ? "bg-green-100 text-green-700" :
                          ride.status === 'cancelled' ? "bg-red-100 text-red-700" :
                          "bg-blue-100 text-blue-700"
                        )}>
                          {ride.status.replace('_', ' ')}
                        </span>
                        {ride.driver && (
                          <span className="text-sm font-medium text-muted-foreground">
                            with {ride.driver.username}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-xl text-foreground">
                        {formatCurrency(ride.fare || 0)}
                      </div>
                    </div>
                  </div>

                  {ride.status === 'completed' && ride.riderRating && (
                    <div className="flex items-center gap-1 text-accent">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          className={cn("w-4 h-4", i < ride.riderRating! ? "fill-current" : "text-muted stroke-border")} 
                        />
                      ))}
                    </div>
                  )}
                </div>

              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
