import { Link } from "wouter";
import { Navbar } from "@/components/Navbar";
import { ArrowRight, Car, MapPin } from "lucide-react";
import { motion } from "framer-motion";
import { useRideAuth as useAuth } from "@/hooks/use-ride-auth";

export default function Home() {
  const { isAuthenticated, login } = useAuth();

  return (
    <div className="min-h-screen bg-background pt-16 flex flex-col">
      <Navbar />
      
      <main className="flex-1 flex flex-col lg:flex-row">
        {/* Left Content */}
        <div className="flex-1 flex items-center justify-center p-8 lg:p-16 z-10">
          <div className="max-w-xl w-full">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl lg:text-7xl font-display font-bold leading-tight text-foreground"
            >
              Go anywhere with <span className="text-accent">RideNow</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-6 text-xl text-muted-foreground leading-relaxed"
            >
              Request a ride, hop in, and go. Or sign up to drive and earn on your own schedule.
            </motion.p>

            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mt-10 flex flex-col sm:flex-row gap-4"
            >
              {isAuthenticated ? (
                <>
                  <Link href="/rider" className="group flex-1 flex items-center justify-between p-6 rounded-2xl bg-primary text-primary-foreground hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary-foreground/10 flex items-center justify-center">
                        <MapPin className="w-6 h-6" />
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-lg">Request a ride</div>
                        <div className="text-sm text-primary-foreground/70">Find a driver nearby</div>
                      </div>
                    </div>
                    <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
                  </Link>

                  <Link href="/driver" className="group flex-1 flex items-center justify-between p-6 rounded-2xl bg-card border-2 border-border hover:border-accent hover:shadow-xl hover:shadow-accent/10 hover:-translate-y-1 transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center">
                        <Car className="w-6 h-6 text-foreground" />
                      </div>
                      <div className="text-left">
                        <div className="font-bold text-lg text-foreground">Drive & Earn</div>
                        <div className="text-sm text-muted-foreground">Make money driving</div>
                      </div>
                    </div>
                    <ArrowRight className="w-6 h-6 text-muted-foreground group-hover:translate-x-1 group-hover:text-accent transition-transform" />
                  </Link>
                </>
              ) : (
                <button 
                  onClick={login}
                  className="w-full sm:w-auto px-8 py-4 rounded-full font-bold text-lg bg-primary text-primary-foreground hover:shadow-xl hover:shadow-primary/20 hover:-translate-y-1 transition-all duration-300 flex items-center justify-center gap-3"
                >
                  Get Started <ArrowRight className="w-5 h-5" />
                </button>
              )}
            </motion.div>
          </div>
        </div>

        {/* Right Graphic */}
        <div className="flex-1 bg-secondary relative overflow-hidden hidden lg:block">
          <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-primary/5" />
          <div className="absolute inset-0 flex items-center justify-center p-12">
            <img 
              src={`${import.meta.env.BASE_URL}images/hero-map.png`} 
              alt="Map Illustration" 
              className="w-full h-full object-cover rounded-3xl shadow-2xl rotate-2 hover:rotate-0 transition-transform duration-700"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
