/**
 * Home page - Uber Eats themed AI food discovery
 */

import { useState, useEffect } from "react";
import axios from "axios";
import { Sparkles, Search, Clock, Star, Bike, Flame, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";
import { SearchBar } from "@/components/SearchBar";
import { RecipeCard } from "@/components/RecipeCard";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const HomePage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [recipesLoaded, setRecipesLoaded] = useState(false);

  // Quick search suggestions - Uber Eats style
  const quickSearches = [
    { label: "High Protein", icon: "💪" },
    { label: "Under 500 cal", icon: "🥗" },
    { label: "Spicy Food", icon: "🌶️" },
    { label: "Quick Delivery", icon: "⚡" },
    { label: "Vegetarian", icon: "🥬" },
    { label: "Comfort Food", icon: "🍜" }
  ];

  // Check if recipes are loaded on mount
  useEffect(() => {
    checkRecipes();
  }, []);

  const checkRecipes = async () => {
    try {
      const response = await axios.get(`${API}/recipes`);
      if (response.data && response.data.length > 0) {
        setRecipesLoaded(true);
      }
    } catch (error) {
      console.error("Error checking recipes:", error);
    }
  };

  const initializeRecipes = async () => {
    setIsInitializing(true);
    try {
      const response = await axios.post(`${API}/recipes/upload`);
      toast.success(response.data.message);
      setRecipesLoaded(true);
    } catch (error) {
      console.error("Error initializing recipes:", error);
      toast.error("Failed to load menu items");
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Tell us what you're craving!");
      return;
    }

    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/search`, {
        query: searchQuery,
        filters: {}
      });
      setSearchResults(response.data);
      if (response.data.length === 0) {
        toast.info("No dishes found. Try something different!");
      }
    } catch (error) {
      console.error("Error searching:", error);
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
      
      {/* Uber Eats Header */}
      <header className="bg-black sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center">
                <span className="text-3xl font-bold text-white" style={{fontFamily: 'UberMove, system-ui, sans-serif'}}>
                  Uber<span className="text-[#06C167]"> Eats</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-gray-800 px-4 py-2 rounded-full">
                <Bike className="w-4 h-4 text-[#06C167]" />
                <span className="text-white text-sm font-medium">Deliver now</span>
              </div>
              <Badge className="bg-[#06C167] text-black font-bold hover:bg-[#05a055]" data-testid="location-badge">
                📍 Singapore
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-black pb-12 pt-8">
        <div className="container mx-auto px-6">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-[#06C167] text-black px-4 py-2 rounded-full text-sm font-bold mb-6">
              <Sparkles className="w-4 h-4" />
              AI-Powered Food Discovery
            </div>
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6" style={{fontFamily: 'UberMove, system-ui, sans-serif'}}>
              What are you <span className="text-[#06C167]">craving</span>?
            </h1>
            <p className="text-xl text-gray-400 mb-8" style={{fontFamily: 'UberMove, system-ui, sans-serif'}}>
              Tell us your dietary goals, cravings, or mood — our AI finds the perfect dish for you.
            </p>

            {/* Search Bar */}
            <SearchBar
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onSearch={handleSearch}
              isLoading={isLoading}
              recipesLoaded={recipesLoaded}
            />

            {/* Quick Search Tags */}
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              {quickSearches.map((item, index) => (
                <button
                  key={index}
                  data-testid={`quick-search-${index}`}
                  onClick={() => handleQuickSearch(item.label)}
                  className="flex items-center gap-2 text-sm px-5 py-2.5 bg-gray-800 hover:bg-[#06C167] text-white hover:text-black rounded-full border border-gray-700 hover:border-[#06C167] transition-all duration-200 font-medium"
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Initialize Button */}
      {!recipesLoaded && (
        <div className="container mx-auto px-6 py-8">
          <div className="max-w-2xl mx-auto p-8 bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl text-center">
            <div className="text-5xl mb-4">🍽️</div>
            <p className="text-gray-800 mb-4 font-bold text-xl">Menu not loaded yet</p>
            <p className="text-gray-500 mb-6">Click below to load our delicious menu items</p>
            <Button
              data-testid="initialize-button"
              onClick={initializeRecipes}
              disabled={isInitializing}
              className="bg-black hover:bg-gray-800 text-white font-bold px-8 py-6 text-lg rounded-xl"
            >
              {isInitializing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span> Loading Menu...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="w-5 h-5" /> Load Menu Items
                </span>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-6 py-8">
        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="max-w-5xl mx-auto">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-black" style={{fontFamily: 'UberMove, system-ui, sans-serif'}}>
                  Perfect matches for you
                </h2>
                <p className="text-gray-500 mt-1">Found {searchResults.length} dishes based on your preferences</p>
              </div>
              <Badge className="bg-[#06C167] text-black font-bold">
                <Sparkles className="w-3 h-3 mr-1" /> AI Powered
              </Badge>
            </div>

            <div className="grid gap-6">
              {searchResults.map((result, index) => (
                <RecipeCard key={index} result={result} index={index} />
              ))}
            </div>
          </div>
        )}

        {/* Features Section */}
        {searchResults.length === 0 && recipesLoaded && (
          <div className="max-w-5xl mx-auto mt-8">
            <h2 className="text-2xl font-bold text-center mb-8 text-black" style={{fontFamily: 'UberMove, system-ui, sans-serif'}}>
              How AI Search Works
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100 hover:border-[#06C167] transition-all">
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-[#06C167]" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-black">Natural Language</h3>
                <p className="text-gray-500 text-sm">Just type what you want — "high protein dinner" or "something spicy under 400 cal"</p>
              </div>
              <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100 hover:border-[#06C167] transition-all">
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-8 h-8 text-[#06C167]" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-black">AI Matching</h3>
                <p className="text-gray-500 text-sm">Our AI understands nutrition, flavors, and your goals to find perfect dishes</p>
              </div>
              <div className="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100 hover:border-[#06C167] transition-all">
                <div className="w-16 h-16 bg-black rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Flame className="w-8 h-8 text-[#06C167]" />
                </div>
                <h3 className="font-bold text-lg mb-2 text-black">Smart Explanations</h3>
                <p className="text-gray-500 text-sm">Each result shows exactly why it matches your search criteria</p>
              </div>
            </div>

            {/* Popular Categories */}
            <div className="mt-16">
              <h2 className="text-2xl font-bold mb-6 text-black" style={{fontFamily: 'UberMove, system-ui, sans-serif'}}>
                Popular Categories
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { name: "Indian", emoji: "🍛", color: "bg-orange-50" },
                  { name: "Italian", emoji: "🍝", color: "bg-red-50" },
                  { name: "Mexican", emoji: "🌮", color: "bg-yellow-50" },
                  { name: "Thai", emoji: "🍜", color: "bg-green-50" },
                  { name: "Chinese", emoji: "🥡", color: "bg-red-50" },
                  { name: "American", emoji: "🍔", color: "bg-amber-50" },
                  { name: "Healthy", emoji: "🥗", color: "bg-emerald-50" },
                  { name: "Desserts", emoji: "🍰", color: "bg-pink-50" }
                ].map((cat, i) => (
                  <button
                    key={i}
                    onClick={() => handleQuickSearch(cat.name)}
                    className={`${cat.color} p-6 rounded-2xl text-center hover:scale-105 transition-transform border border-gray-100`}
                  >
                    <div className="text-4xl mb-2">{cat.emoji}</div>
                    <div className="font-bold text-black">{cat.name}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-black text-white py-12 mt-16">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="flex items-center gap-2 mb-4 md:mb-0">
              <span className="text-2xl font-bold">Uber<span className="text-[#06C167]"> Eats</span></span>
              <Badge className="bg-[#06C167] text-black text-xs font-bold ml-2">AI</Badge>
            </div>
            <p className="text-gray-400 text-sm">
              © 2025 Uber Eats AI Search. Powered by AI for smarter food discovery.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
