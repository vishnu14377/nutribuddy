import { useState, useEffect } from "react";
import axios from "axios";
import { MapPin, MessageCircle, Sparkles, Search, Flame, Salad, Zap, TrendingUp, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import { RecipeCard } from "@/components/RecipeCard";
import { UpgradeModal } from "@/components/UpgradeModal";
import { PLATFORMS } from "@/lib/orderLink";
import { consumeSearch, refundSearch, getRemaining, isPaywallDisabled, FREE_SEARCHES_PER_DAY } from "@/lib/searchQuota";

const NUTRIBUDDY_API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const QUICK_SEARCHES = [
  { label: "High Protein Low Carb", icon: "💪" },
  { label: "Under 500 cal",         icon: "🥗" },
  { label: "Keto Friendly",         icon: "🥑" },
  { label: "Low Calorie",           icon: "🍃" },
  { label: "High Protein",          icon: "🥩" },
  { label: "Vegetarian",            icon: "🥬" },
];

export default function HomePage() {
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching]     = useState(false);
  const [activePlatform, setActivePlatform] = useState(null);   // chip selection; null = all
  const [resultsPlatform, setResultsPlatform] = useState(null); // platform the SHOWN results were fetched with
  const [stats, setStats]                 = useState(null);
  const [dataReady, setDataReady]         = useState(false);
  const [showUpgrade, setShowUpgrade]     = useState(false);
  const [remaining, setRemaining]         = useState(() => getRemaining());
  const [mode, setMode]                   = useState("search"); // search | ask
  const [askReply, setAskReply]           = useState(null);      // {answer, on_topic, results}
  const [zipcode, setZipcode]             = useState("");
  const [nearby, setNearby]               = useState(null);      // null = not asked yet
  const [isLocating, setIsLocating]       = useState(false);
  const [activeRestaurant, setActiveRestaurant] = useState(null);

  useEffect(() => {
    axios
      .get(`${NUTRIBUDDY_API}/stats`)
      .then((res) => {
        setStats(res.data);
        setDataReady((res.data?.database?.count ?? 0) > 0);
      })
      .catch(() => {});
  }, []);

  // Platform chips are driven by what's actually in the database
  const platformCounts = stats?.database?.platforms ?? {};
  const availablePlatforms = Object.keys(platformCounts).filter((p) => platformCounts[p] > 0);

  // ── Search ──────────────────────────────────────────────────────────────────

  const runSearch = async (query, platform = activePlatform, { consumeQuota = true, restaurant = null } = {}) => {
    if (isSearching) return; // Enter key must not double-fire (and double-burn quota)
    const q = (query ?? searchQuery).trim();
    if (!q) { toast.error("Enter what you're looking for!"); return; }

    if (consumeQuota) {
      const { allowed, remaining: left } = consumeSearch();
      if (!allowed) { setRemaining(0); setShowUpgrade(true); return; }
      setRemaining(left);
    }

    setIsSearching(true);
    setAskReply(null);
    try {
      const payload = { query: q, filters: {} };
      if (platform) payload.source_platform = platform;
      if (restaurant) payload.restaurant_name = restaurant;
      if (/^\d{5}$/.test(zipcode.trim())) payload.zipcode = zipcode.trim();

      const { data } = await axios.post(`${NUTRIBUDDY_API}/search`, payload);
      setSearchResults(data);
      setResultsPlatform(platform ?? null);
      setActiveRestaurant(restaurant ?? null);
      if (data.length === 0) {
        toast.info(
          platform
            ? `No matches on ${PLATFORMS[platform]?.label ?? platform}. Try "All platforms".`
            : "No matches found. Try different criteria!",
        );
      }
    } catch (err) {
      refundSearch();
      setRemaining(getRemaining());
      if (err.response?.status === 422) {
        const detail = err.response.data?.detail;
        toast.error(
          typeof detail === "string"
            ? detail
            : "That search is too long — keep it under 1000 characters.",
        );
      } else {
        toast.error("Search failed. Is the AI backend running?");
      }
    } finally {
      setIsSearching(false);
    }
  };

  const runAsk = async (question) => {
    if (isSearching) return;
    const q = (question ?? searchQuery).trim();
    if (!q) { toast.error("Ask me anything about food!"); return; }

    const { allowed, remaining: left } = consumeSearch();
    if (!allowed) { setRemaining(0); setShowUpgrade(true); return; }
    setRemaining(left);

    setIsSearching(true);
    setSearchResults([]);
    setActiveRestaurant(null);
    try {
      const { data } = await axios.post(`${NUTRIBUDDY_API}/ask`, { question: q });
      setAskReply(data);
      setSearchResults(data.on_topic ? (data.results ?? []) : []);
    } catch {
      refundSearch();
      setRemaining(getRemaining());
      toast.error("The assistant is unavailable right now.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = () => (mode === "ask" ? runAsk() : runSearch());

  const handleQuickSearch = (label) => {
    setMode("search");
    setSearchQuery(label);
    runSearch(label);
  };

  const handleFindNearby = async () => {
    const zip = zipcode.trim();
    if (!/^\d{5}$/.test(zip)) { toast.error("Enter a 5-digit US zipcode"); return; }
    setIsLocating(true);
    try {
      const { data } = await axios.get(`${NUTRIBUDDY_API}/restaurants/nearby`, {
        params: { zipcode: zip, ...(activePlatform ? { source_platform: activePlatform } : {}) },
      });
      setNearby(data.restaurants);
      if (data.restaurants.length === 0) {
        toast.info(`No indexed restaurants near ${zip} yet — try 20009 (DC) or 18042 (Easton, PA).`);
      } else {
        toast.success(`${data.restaurants.length} restaurants near ${zip}`);
      }
    } catch (err) {
      setNearby(null);
      toast.error(err.response?.data?.detail ?? "Couldn't look up that zipcode.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleRestaurantClick = (restaurantName) => {
    setMode("search");
    const q = searchQuery.trim() || "best rated meal";
    setSearchQuery(q);
    runSearch(q, activePlatform, { restaurant: restaurantName });
    setTimeout(() => document.getElementById("ai-results")?.scrollIntoView({ behavior: "smooth" }), 300);
  };

  const handlePlatformChip = (platform) => {
    setActivePlatform(platform);
    // Re-run whenever there's a query — including after a zero-result search,
    // where the toast explicitly tells the user to try "All platforms".
    // Refining the SAME query by platform is free; only new queries burn quota.
    if (searchQuery.trim()) {
      runSearch(searchQuery, platform, { consumeQuota: false });
    }
  };

  const showQuotaBadge = !isPaywallDisabled() && remaining !== Infinity && remaining <= 2;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <Toaster position="top-right" richColors />
      <UpgradeModal open={showUpgrade} onOpenChange={setShowUpgrade} />

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
                {stats.database.count.toLocaleString()} dishes across {availablePlatforms.length} platform{availablePlatforms.length !== 1 ? "s" : ""}
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
            One Search.<br className="hidden md:block" /> Every Delivery App.
          </h1>
          <p className="text-lg text-green-100 mb-8">
            Tell us your nutrition goals. Our AI finds the exact dish across Uber Eats,
            DoorDash &amp; more — then takes you there to order.
          </p>

          {/* Mode toggle */}
          <div className="inline-flex rounded-full bg-white/15 border border-white/25 p-1 mb-3">
            {[
              { key: "search", label: "Find dishes", Icon: Search },
              { key: "ask", label: "Ask AI", Icon: MessageCircle },
            ].map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className={`flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-full transition-all ${
                  mode === key ? "bg-white text-green-700 font-semibold" : "text-white hover:bg-white/20"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>

          {/* Search / Ask bar */}
          <div className="flex gap-2 max-w-2xl mx-auto shadow-xl rounded-xl">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              maxLength={1000}
              placeholder={
                mode === "ask"
                  ? 'Ask about food — "what should I eat after a workout?"'
                  : 'Try "high protein low carb" or "under 400 cal"'
              }
              className="flex-1 px-5 py-4 rounded-l-xl text-base border-0 focus:outline-none focus:ring-2 focus:ring-green-300"
            />
            <Button
              onClick={handleSubmit}
              disabled={isSearching}
              className="bg-white text-green-700 hover:bg-green-50 px-7 rounded-r-xl text-base font-bold"
            >
              {isSearching ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  {mode === "ask" ? "Thinking" : "Searching"}
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  {mode === "ask" ? <MessageCircle className="w-4 h-4" /> : <Search className="w-4 h-4" />}
                  {mode === "ask" ? "Ask" : "Search"}
                </span>
              )}
            </Button>
          </div>

          {/* Zipcode: restaurants near me */}
          <div className="mt-3 flex items-center justify-center gap-2">
            <div className="flex items-center gap-1.5 bg-white/15 border border-white/25 rounded-full pl-3 pr-1 py-1">
              <MapPin className="w-4 h-4 text-green-100" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={zipcode}
                onChange={(e) => setZipcode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleFindNearby()}
                placeholder="Zipcode"
                className="w-20 bg-transparent text-white placeholder-green-200 text-sm focus:outline-none"
              />
              <button
                onClick={handleFindNearby}
                disabled={isLocating}
                className="text-xs font-semibold bg-white text-green-700 rounded-full px-3 py-1 hover:bg-green-50 disabled:opacity-60"
              >
                {isLocating ? "…" : "Near me"}
              </button>
            </div>
          </div>

          {showQuotaBadge && (
            <p className="mt-3 text-sm text-green-100">
              {remaining} free search{remaining !== 1 ? "es" : ""} left today
            </p>
          )}

          {/* Platform filter chips */}
          {availablePlatforms.length > 1 && (
            <div className="mt-5 flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => handlePlatformChip(null)}
                className={`text-sm px-4 py-1.5 rounded-full border transition-all ${
                  activePlatform === null
                    ? "bg-white text-green-700 border-white font-semibold"
                    : "bg-white/10 text-white border-white/25 hover:bg-white/25"
                }`}
              >
                All platforms
              </button>
              {availablePlatforms.map((p) => (
                <button
                  key={p}
                  onClick={() => handlePlatformChip(p)}
                  className={`text-sm px-4 py-1.5 rounded-full border transition-all ${
                    activePlatform === p
                      ? "bg-white text-green-700 border-white font-semibold"
                      : "bg-white/10 text-white border-white/25 hover:bg-white/25"
                  }`}
                >
                  {PLATFORMS[p]?.label ?? p}
                  <span className="ml-1.5 opacity-60 text-xs">{platformCounts[p]}</span>
                </button>
              ))}
            </div>
          )}

          {/* Quick tags */}
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
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

        {/* ── Nearby restaurants ─────────────────────────────────────────── */}
        {nearby && nearby.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-green-600" />
                Restaurants near {zipcode}
              </h2>
              <button onClick={() => setNearby(null)} className="text-xs text-gray-400 hover:text-gray-600">
                Hide
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {nearby.map((r) => (
                <button
                  key={`${r.restaurant_name}-${r.distance_km}`}
                  onClick={() => handleRestaurantClick(r.restaurant_name)}
                  className="text-left rounded-xl border border-gray-100 bg-gray-50 hover:border-green-300 hover:shadow-md transition-all p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="font-bold text-sm leading-tight">{r.restaurant_name}</span>
                    <Badge className={`text-xs border-0 shrink-0 ${PLATFORMS[r.source_platform]?.badgeClass ?? "bg-gray-100 text-gray-600"}`}>
                      {PLATFORMS[r.source_platform]?.label ?? r.source_platform}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">
                    {r.distance_km} km · {r.item_count} dish{r.item_count !== 1 ? "es" : ""}
                    {r.cuisine_type ? ` · ${r.cuisine_type}` : ""}
                  </p>
                  <p className="text-xs text-green-600 font-semibold mt-2">
                    Find nutrition matches →
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Assistant answer ───────────────────────────────────────────── */}
        {askReply && (
          <div className={`rounded-2xl border p-5 mb-8 ${
            askReply.on_topic ? "bg-white border-gray-100 shadow-sm" : "bg-gray-50 border-gray-200"
          }`}>
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <MessageCircle className="w-4 h-4 text-green-700" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-1">Nutribuddy assistant</p>
                <p className="text-gray-800">{askReply.answer}</p>
                {!askReply.on_topic && (
                  <p className="text-xs text-gray-400 mt-2">
                    I stick to food, nutrition, and ordering questions.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <div id="ai-results">
          {searchResults.length > 0 && (
            <>
              {searchResults.every((r) => r.meets_constraints === false) && (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Nothing fully matches your constraints — showing the closest options instead.
                  Each card notes exactly where it misses.
                </div>
              )}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-2xl font-bold">
                    {activeRestaurant
                      ? `Matches at ${activeRestaurant}`
                      : resultsPlatform
                      ? `Matches on ${PLATFORMS[resultsPlatform]?.label ?? resultsPlatform}`
                      : "Your AI Matches"}
                  </h2>
                  <p className="text-gray-500 text-sm">
                    {searchResults.length} dish{searchResults.length !== 1 ? "es" : ""} found
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {activeRestaurant && (
                    <Button
                      variant="outline"
                      className="text-sm"
                      onClick={() => runSearch(searchQuery, activePlatform, { consumeQuota: false })}
                    >
                      All Restaurants
                    </Button>
                  )}
                  {resultsPlatform && (
                    <Button
                      variant="outline"
                      className="text-sm"
                      onClick={() => handlePlatformChip(null)}
                    >
                      Show All Platforms
                    </Button>
                  )}
                  <Badge className="bg-green-100 text-green-700 border-0">
                    <Sparkles className="w-3 h-3 mr-1" /> AI Ranked
                  </Badge>
                </div>
              </div>

              <div className="grid gap-4">
                {searchResults.map((result, i) => (
                  <RecipeCard key={result.recipe?.id ?? i} result={result} index={i} />
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
                    title: "Prompt Your Goals",
                    desc: 'Type it like you\'d text a nutritionist — "45g protein meal" or "keto under 600 calories".',
                  },
                  {
                    Icon: Sparkles,
                    color: "bg-green-100 text-green-600",
                    title: "AI Searches Every App",
                    desc: "One search covers Uber Eats, DoorDash and more. Semantic matching plus hard macro filters.",
                  },
                  {
                    Icon: TrendingUp,
                    color: "bg-purple-100 text-purple-600",
                    title: "Tap to Order",
                    desc: "Found your dish? One tap takes you to the delivery app to place the order.",
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

              {/* Subscription story */}
              <div className="mt-10 bg-gradient-to-r from-green-600 to-emerald-700 rounded-2xl p-8 text-white">
                <h3 className="text-xl font-bold mb-2 text-center">How Nutribuddy Plus works</h3>
                <p className="text-green-100 text-sm text-center mb-6">
                  Free to try every day. Unlimited when you're serious about your goals.
                </p>
                <div className="grid md:grid-cols-3 gap-6">
                  {[
                    { Icon: Zap,        title: "Free",            label: `${FREE_SEARCHES_PER_DAY} AI meal searches every day` },
                    { Icon: TrendingUp, title: "Plus · $4.99/mo", label: "Unlimited searches (coming soon)" },
                    { Icon: Shield,     title: "Plus",            label: "One-tap ordering on Uber Eats & DoorDash (coming soon)" },
                  ].map(({ Icon, title, label }) => (
                    <div key={label} className="text-center">
                      <Icon className="w-6 h-6 mx-auto mb-1 text-green-200" />
                      <div className="text-xl font-extrabold">{title}</div>
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
                Run <code className="bg-gray-100 px-1 rounded">python scripts/seed_fixtures.py</code> in
                the backend to load the Uber Eats + DoorDash sample catalogs.
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
          </div>
          <p className="text-gray-500 text-xs">
            One search, every delivery app · AI-powered nutritional intelligence
          </p>
        </div>
      </footer>
    </div>
  );
}
