/**
 * Nutribuddy - AI-powered nutritional food search
 */

import { useState, useEffect } from "react";
import axios from "axios";
import { Sparkles, Search, Flame, Salad } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import { RecipeCard } from "@/components/RecipeCard";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const HomePage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [recipesLoaded, setRecipesLoaded] = useState(false);

  const quickSearches = [
    { label: "High Protein Low Carb", icon: "💪" },
    { label: "Under 500 cal", icon: "🥗" },
    { label: "Keto Friendly", icon: "🥑" },
    { label: "Low Calorie", icon: "🍃" },
    { label: "High Protein", icon: "🥩" },
    { label: "Vegetarian", icon: "🥬" }
  ];

  useEffect(() => {
    axios.get(`${API}/recipes`).then(res => {
      if (res.data?.length > 0) setRecipesLoaded(true);
    }).catch(() => {});
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Enter what you're looking for!");
      return;
    }
    setIsLoading(true);
    try {
      const res = await axios.post(`${API}/search`, { query: searchQuery, filters: {} });
      setSearchResults(res.data);
      if (res.data.length === 0) toast.info("No matches found. Try different criteria!");
    } catch {
      toast.error("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickSearch = (query) => {
    setSearchQuery(query);
    setTimeout(() => handleSearch(), 100);
  };

  return (
    <div className="min-h-screen bg-white">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="bg-gradient-to-r from-green-600 to-emerald-600 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Salad className="w-8 h-8 text-white" />
              <span className="text-2xl font-bold text-white">Nutribuddy</span>
              <Badge className="bg-white/20 text-white text-xs">.com</Badge>
            </div>
            <Badge className="bg-white/20 text-white">
              <Sparkles className="w-3 h-3 mr-1" /> AI Powered
            </Badge>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-b from-green-600 to-emerald-700 pb-16 pt-12">
        <div className="container mx-auto px-6 text-center max-w-3xl">
          <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
            Find Your Perfect Meal
          </h1>
          <p className="text-lg text-green-100 mb-8">
            Search by nutrition goals — protein, calories, carbs. Our AI finds exactly what you need.
          </p>

          {/* Search */}
          <div className="flex gap-2 max-w-2xl mx-auto">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Try 'high protein low carb' or 'under 400 cal'"
              className="flex-1 px-6 py-4 rounded-xl text-lg border-0 focus:ring-2 focus:ring-green-300"
            />
            <Button 
              onClick={handleSearch} 
              disabled={isLoading}
              className="bg-white text-green-700 hover:bg-green-50 px-8 py-4 rounded-xl text-lg font-bold"
            >
              {isLoading ? "..." : <><Search className="w-5 h-5 mr-2" />Search</>}
            </Button>
          </div>

          {/* Quick Tags */}
          <div className="mt-6 flex flex-wrap gap-2 justify-center">
            {quickSearches.map((item, i) => (
              <button
                key={i}
                onClick={() => handleQuickSearch(item.label)}
                className="flex items-center gap-2 text-sm px-4 py-2 bg-white/10 hover:bg-white hover:text-green-700 text-white rounded-full transition-all"
              >
                <span>{item.icon}</span>{item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results */}
      <main className="container mx-auto px-6 py-8">
        {searchResults.length > 0 && (
          <div className="max-w-4xl mx-auto">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Your Matches</h2>
                <p className="text-gray-500">Found {searchResults.length} dishes</p>
              </div>
              <Badge className="bg-green-100 text-green-700">
                <Sparkles className="w-3 h-3 mr-1" /> AI Matched
              </Badge>
            </div>
            <div className="grid gap-4">
              {searchResults.map((result, i) => (
                <RecipeCard key={i} result={result} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {searchResults.length === 0 && recipesLoaded && (
          <div className="max-w-4xl mx-auto mt-8">
            <h2 className="text-xl font-bold text-center mb-8">How It Works</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: Search, title: "Natural Search", desc: "Type what you want — 'high protein meal' or 'under 500 cal'" },
                { icon: Sparkles, title: "AI Matching", desc: "Our AI understands nutrition and finds the best matches" },
                { icon: Flame, title: "Smart Results", desc: "Each result shows why it matches your criteria" }
              ].map((f, i) => (
                <div key={i} className="text-center p-6 bg-gray-50 rounded-xl">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <f.icon className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="font-bold mb-2">{f.title}</h3>
                  <p className="text-gray-500 text-sm">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-16">
        <div className="container mx-auto px-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Salad className="w-5 h-5" />
            <span className="font-bold">Nutribuddy.com</span>
          </div>
          <p className="text-gray-400 text-sm">AI-powered nutritional food search</p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
