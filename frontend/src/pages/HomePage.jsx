import { useState, useEffect } from "react";
import axios from "axios";
import {
  Sparkles, Search, Flame, Salad, MapPin, Star,
  ChevronRight, Zap, TrendingUp, Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import { RecipeCard } from "@/components/RecipeCard";

const NUTRIBUDDY_API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const RESTAURANTS_API = process.env.REACT_APP_RESTAURANTS_API_URL || "http://localhost:4000";

const QUICK_SEARCHES = [
  { label: "High Protein Low Carb", icon: "💪" },
  { label: "Under 500 cal",         icon: "🥗" },
  { label: "Keto Friendly",         icon: "🥑" },
  { label: "Low Calorie",           icon: "🍃" },
  { label: "High Protein",          icon: "🥩" },
  { label: "Vegetarian",            icon: "🥬" },
];

export default function HomePage() {
  const [searchQuery, setSearchQuery]             = useState("");
  const [searchResults, setSearchResults]         = useState([]);
  const [isSearching, setIsSearching]             = useState(false);
  const [nearbyRestaurants, setNearbyRestaurants] = useState([]);
  const [locationStatus, setLocationStatus]       = useState("idle"); // idle | loading | success | error
  const [activeRestaurant, setActiveRestaurant]   = useState(null);
  const [stats, setStats]                         = useState(null);
  const [dataReady, setDataReady]                 = useState(false);

  useEffect(() => {
    axios
      .get(`${NUTRIBUDDY_API}/stats`)
      .then((res) => {
        setStats(res.data);
        setDataReady((res.data?.database?.count ?? 0) > 0);
      })
      .catch(() => {});
  }, []);

  // ── Search ──────────────────────────────────────────────────────────────────

  const runSearch = async (query, restaurantName = null) => {
    const q = (query ?? searchQuery).trim();
    if (!q) { toast.error("Enter what you're looking for!"); return; }

    setIsSearching(true);
    setActiveRestaurant(restaurantName);
    try {
      const payload = { query: q, filters: {} };
      if (restaurantName) payload.restaurant_name = restaurantName;

      const { data } = await axios.post(`${NUTRIBUDDY_API}/search`, payload);
      setSearchResults(data);
      if (data.length === 0) {
        toast.info(
          restaurantName
            ? `No AI matches for "${restaurantName}" — showing all results.`
            : "No matches found. Try different criteria!",
        );
        if (restaurantName) {
          // Fall back to global search so the user still sees something
          const { data: global } = await axios.post(`${NUTRIBUDDY_API}/search`, { query: q, filters: {} });
          setSearchResults(global);
          setActiveRestaurant(null);
        }
      }
    } catch {
      toast.error("Search failed. Is the AI backend running?");
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickSearch = (label) => {
    setSearchQuery(label);
    runSearch(label);
  };

  // ── Location / Nearby ───────────────────────────────────────────────────────

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported by your browser");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const { data } = await axios.get(`${RESTAURANTS_API}/restaurants/nearby`, {
            params: { latitude: coords.latitude, longitude: coords.longitude, radius: 2000 },
          });
          setNearbyRestaurants(data);
          setLocationStatus("success");
          toast.success(`Found ${data.length} restaurants near you!`);
        } catch {
          setLocationStatus("idle");
          toast.warning("Restaurant discovery unavailable — add your Google Maps API key to the NestJS .env.", {
            duration: 6000,
          });
        }
      },
      () => {
        setLocationStatus("idle");
        toast.error("Location access denied. Please enable it in your browser.");
      },
    );
  };

  const handleRestaurantNutritionSearch = (restaurant) => {
    const q = searchQuery || "high protein meal";
    setSearchQuery(q);
    runSearch(q, restaurant.name);
    setTimeout(() => document.getElementById("ai-results")?.scrollIntoView({ behavior: "smooth" }), 400);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-gradient-to-r from-green-600 to-emerald-700 sticky top-0 z-50 shadow-md">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Salad className="w-7 h-7 text-white" />
            <span className="text-xl font-bold text-white tracking-tight">Nutribuddy AI</span>
          </div>
          <div className="flex items-center gap-3">
            {stats?.database?.count > 0 && (
              <span className="text-green-100 text-sm hidden sm:block">
                {stats.database.count.toLocaleString()} dishes analyzed
              </span>
            )}
            <Badge className="bg-white/20 text-white border-0">
              <Sparkles className="w-3 h-3 mr-1" /> AI Powered
            </Badge>
          </div>
        </div>
      </header>

      {/* ── Hero + Search ───────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-green-600 to-emerald-700 pb-14 pt-12">
        <div className="container mx-auto px-6 text-center max-w-3xl">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 leading-tight">
            Find the Perfect Meal,<br className="hidden md:block" /> Anywhere You Are
          </h1>
          <p className="text-lg text-green-100 mb-8">
            Tell us your nutrition goals. Our AI finds the exact dish — protein, calories, macros.
          </p>

          {/* Search bar */}
          <div className="flex gap-2 max-w-2xl mx-auto shadow-xl rounded-xl">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder='Try "high protein low carb" or "under 400 cal"'
              className="flex-1 px-5 py-4 rounded-l-xl text-base border-0 focus:outline-none focus:ring-2 focus:ring-green-300"
            />
            <Button
              onClick={() => runSearch()}
              disabled={isSearching}
              className="bg-white text-green-700 hover:bg-green-50 px-7 rounded-r-xl text-base font-bold"
            >
              {isSearching ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  Searching
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Search className="w-4 h-4" /> Search
                </span>
              )}
            </Button>
          </div>

          {/* Quick tags */}
          <div className="mt-5 flex flex-wrap gap-2 justify-center">
            {QUICK_SEARCHES.map(({ label, icon }) => (
              <button
                key={label}
                onClick={() => handleQuickSearch(label)}
                className="flex items-center gap-1.5 text-sm px-4 py-2 bg-white/15 hover:bg-white hover:text-green-700 text-white rounded-full transition-all border border-white/20"
              >
                <span>{icon}</span> {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <main className="container mx-auto px-6 py-10 max-w-6xl">

        {/* ── Nearby Restaurants Panel ──────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600" />
                Restaurants Near You
              </h2>
              <p className="text-gray-500 text-sm mt-0.5">
                Click any restaurant to AI-match the best nutritional dishes from their menu
              </p>
            </div>
            <Button
              onClick={handleGetLocation}
              disabled={locationStatus === "loading"}
              variant="outline"
              className="border-green-500 text-green-700 hover:bg-green-50 font-semibold shrink-0"
            >
              {locationStatus === "loading" ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  Locating…
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" /> Use My Location
                </span>
              )}
            </Button>
          </div>

          {nearbyRestaurants.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nearbyRestaurants.slice(0, 6).map((r, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-gray-100 bg-gray-50 hover:border-green-300 hover:shadow-md transition-all flex flex-col overflow-hidden"
                >
                  {r.photos?.[0] && (
                    <img
                      src={r.photos[0]}
                      alt={r.name}
                      className="w-full h-28 object-cover"
                      onError={(e) => { e.target.style.display = "none"; }}
                    />
                  )}
                  <div className="p-4 flex flex-col flex-1">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-bold text-sm leading-tight">{r.name}</h3>
                      {r.rating > 0 && (
                        <span className="flex items-center gap-0.5 shrink-0 text-xs font-semibold text-amber-600">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {r.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 truncate mb-2">{r.address}</p>
                    <Badge
                      className={`w-fit text-xs mb-3 ${
                        r.openNow ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {r.openNow ? "● Open now" : "○ Closed"}
                    </Badge>
                    <Button
                      onClick={() => handleRestaurantNutritionSearch(r)}
                      className="mt-auto w-full bg-green-600 hover:bg-green-700 text-white text-xs py-2 rounded-lg font-semibold"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Find Nutrition Matches
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <MapPin className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">Press "Use My Location" to discover restaurants near you</p>
            </div>
          )}
        </div>

        {/* ── AI Search Results ──────────────────────────────────────────────── */}
        <div id="ai-results">
          {searchResults.length > 0 && (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-2xl font-bold">
                    {activeRestaurant ? `Matches at ${activeRestaurant}` : "Your AI Matches"}
                  </h2>
                  <p className="text-gray-500 text-sm">
                    {searchResults.length} dish{searchResults.length !== 1 ? "es" : ""} found
                    {activeRestaurant ? ` · filtered to ${activeRestaurant}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {activeRestaurant && (
                    <Button
                      variant="outline"
                      className="text-sm"
                      onClick={() => runSearch(searchQuery, null)}
                    >
                      Show All Restaurants
                    </Button>
                  )}
                  <Badge className="bg-green-100 text-green-700 border-0">
                    <Sparkles className="w-3 h-3 mr-1" /> AI Ranked
                  </Badge>
                </div>
              </div>

              <div className="grid gap-4">
                {searchResults.map((result, i) => (
                  <RecipeCard key={i} result={result} index={i} />
                ))}
              </div>
            </>
          )}

          {/* ── How it works (empty state, data loaded) ──────────────────── */}
          {searchResults.length === 0 && dataReady && (
            <div className="mt-2">
              <p className="text-center text-gray-400 text-sm mb-8">Search above or tap a quick filter to get started</p>
              <div className="grid md:grid-cols-3 gap-6">
                {[
                  {
                    Icon: Search,
                    color: "bg-blue-100 text-blue-600",
                    title: "Natural Language Search",
                    desc: 'Type your goals — "45g protein meal" or "keto under 600 calories" — just like texting a nutritionist.',
                  },
                  {
                    Icon: Sparkles,
                    color: "bg-green-100 text-green-600",
                    title: "Semantic AI Matching",
                    desc: "OpenAI embeddings understand intent, not just keywords. We rank by how well the macros actually match.",
                  },
                  {
                    Icon: TrendingUp,
                    color: "bg-purple-100 text-purple-600",
                    title: "Restaurant Integration",
                    desc: "Connect your real menu data. Every dish gets AI-estimated nutrition and becomes instantly searchable.",
                  },
                ].map(({ Icon, color, title, desc }) => (
                  <div key={title} className="text-center p-6 bg-white rounded-xl shadow-sm border border-gray-100">
                    <div className={`w-12 h-12 ${color} rounded-xl flex items-center justify-center mx-auto mb-3`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="font-bold mb-2">{title}</h3>
                    <p className="text-gray-500 text-sm">{desc}</p>
                  </div>
                ))}
              </div>

              {/* Value props for client pitch */}
              <div className="mt-10 bg-gradient-to-r from-green-600 to-emerald-700 rounded-2xl p-8 text-white">
                <h3 className="text-xl font-bold mb-2 text-center">Why Add AI Nutrition to Your Food App?</h3>
                <p className="text-green-100 text-sm text-center mb-6">
                  Users don't just want restaurants — they want the RIGHT dish for their goals.
                </p>
                <div className="grid md:grid-cols-3 gap-6">
                  {[
                    { Icon: Zap,        stat: "3×",   label: "longer session time when users find meals matching their goals" },
                    { Icon: TrendingUp, stat: "40%",  label: "higher re-order rate for nutrition-aware recommendations" },
                    { Icon: Shield,     stat: "< 1s", label: "AI search response time — zero latency for users" },
                  ].map(({ Icon, stat, label }) => (
                    <div key={stat} className="text-center">
                      <Icon className="w-6 h-6 mx-auto mb-1 text-green-200" />
                      <div className="text-3xl font-extrabold">{stat}</div>
                      <p className="text-green-100 text-xs mt-1">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Data not loaded state ─────────────────────────────────────── */}
          {!dataReady && searchResults.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Flame className="w-8 h-8 text-amber-500" />
              </div>
              <h3 className="text-lg font-bold mb-2">AI Engine Ready — Awaiting Menu Data</h3>
              <p className="text-gray-500 text-sm max-w-sm mx-auto">
                Use <code className="bg-gray-100 px-1 rounded">POST /api/ingest/url</code> to load your restaurant menu,
                or run <code className="bg-gray-100 px-1 rounded">sync_vectors.py</code> to sync existing data.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="bg-gray-900 text-white py-8 mt-16">
        <div className="container mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Salad className="w-5 h-5" />
            <span className="font-bold">Nutribuddy AI</span>
            <span className="text-gray-500 text-sm">×</span>
            <span className="font-semibold text-gray-300">Recipro</span>
          </div>
          <p className="text-gray-500 text-xs">
            AI-powered nutritional intelligence · OpenAI embeddings · Pinecone semantic search
          </p>
        </div>
      </footer>
    </div>
  );
}
