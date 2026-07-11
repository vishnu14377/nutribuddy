import { useState, useEffect } from "react";
import axios from "axios";
import { Sparkles, Search, Flame, Salad, Zap, TrendingUp, Shield } from "lucide-react";
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

  const runSearch = async (query, platform = activePlatform) => {
    if (isSearching) return; // Enter key must not double-fire (and double-burn quota)
    const q = (query ?? searchQuery).trim();
    if (!q) { toast.error("Enter what you're looking for!"); return; }

    const { allowed, remaining: left } = consumeSearch();
    if (!allowed) { setRemaining(0); setShowUpgrade(true); return; }
    setRemaining(left);

    setIsSearching(true);
    try {
      const payload = { query: q, filters: {} };
      if (platform) payload.source_platform = platform;

      const { data } = await axios.post(`${NUTRIBUDDY_API}/search`, payload);
      setSearchResults(data);
      setResultsPlatform(platform ?? null);
      if (data.length === 0) {
        toast.info(
          platform
            ? `No matches on ${PLATFORMS[platform]?.label ?? platform}. Try "All platforms".`
            : "No matches found. Try different criteria!",
        );
      }
    } catch {
      refundSearch();
      setRemaining(getRemaining());
      toast.error("Search failed. Is the AI backend running?");
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickSearch = (label) => {
    setSearchQuery(label);
    runSearch(label);
  };

  const handlePlatformChip = (platform) => {
    setActivePlatform(platform);
    // Re-run whenever there's a query — including after a zero-result search,
    // where the toast explicitly tells the user to try "All platforms".
    if (searchQuery.trim()) {
      runSearch(searchQuery, platform);
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
                    {resultsPlatform
                      ? `Matches on ${PLATFORMS[resultsPlatform]?.label ?? resultsPlatform}`
                      : "Your AI Matches"}
                  </h2>
                  <p className="text-gray-500 text-sm">
                    {searchResults.length} dish{searchResults.length !== 1 ? "es" : ""} found
                  </p>
                </div>
                <div className="flex items-center gap-2">
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
