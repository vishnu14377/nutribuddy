/**
 * Home page - main entry point for NIMA application
 */

import { useState, useEffect } from "react";
import axios from "axios";
import { Sparkles, ChefHat, Search, Apple } from "lucide-react";
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

  // Quick search suggestions
  const quickSearches = [
    "High protein low carb",
    "Spicy vegetarian dinner",
    "Quick healthy lunch under 400 calories",
    "Comfort food for cold evening"
  ];

  // Check if recipes are loaded on mount
  useEffect(() => {
    checkRecipes();
  }, []);

  /**
   * Check if recipes exist in database
   */
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

  /**
   * Initialize recipe database
   */
  const initializeRecipes = async () => {
    setIsInitializing(true);
    try {
      const response = await axios.post(`${API}/recipes/upload`);
      toast.success(response.data.message);
      setRecipesLoaded(true);
    } catch (error) {
      console.error("Error initializing recipes:", error);
      toast.error("Failed to initialize recipes");
    } finally {
      setIsInitializing(false);
    }
  };

  /**
   * Handle recipe search
   */
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
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
        toast.info("No recipes found. Try a different search!");
      }
    } catch (error) {
      console.error("Error searching recipes:", error);
      toast.error("Search failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle quick search click
   */
  const handleQuickSearch = (query) => {
    setSearchQuery(query);
    setTimeout(() => handleSearch(), 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50">
      <Toaster position="top-right" richColors />
      
      {/* Header */}
      <header className="border-b bg-white/70 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900" style={{fontFamily: 'Space Grotesk, sans-serif'}}>
                  NIMA
                </h1>
                <p className="text-xs text-gray-600">Nutritional Intelligence Menu Assistant</p>
              </div>
            </div>
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300" data-testid="location-badge">
              Singapore
            </Badge>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12">
        
        {/* Hero Section */}
        <div className="text-center mb-12 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" />
            AI-Powered Meal Discovery
          </div>
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6" style={{fontFamily: 'Space Grotesk, sans-serif'}}>
            Find Your Perfect <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600">Meal</span>
          </h2>
          <p className="text-lg text-gray-600 mb-8" style={{fontFamily: 'Inter, sans-serif'}}>
            Tell us what you're craving, your dietary goals, or just how you're feeling. 
            We'll find the perfect dish aligned with your nutrition needs.
          </p>

          {/* Search Bar */}
          <SearchBar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            onSearch={handleSearch}
            isLoading={isLoading}
            recipesLoaded={recipesLoaded}
          />

          {/* Initialize Button */}
          {!recipesLoaded && (
            <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-amber-800 mb-4 font-medium">Recipe database not initialized yet</p>
              <Button
                data-testid="initialize-button"
                onClick={initializeRecipes}
                disabled={isInitializing}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isInitializing ? "Initializing..." : "Initialize Recipe Database"}
              </Button>
            </div>
          )}

          {/* Quick Searches */}
          <div className="mt-6 flex flex-wrap gap-3 justify-center">
            <span className="text-sm text-gray-500 font-medium">Quick searches:</span>
            {quickSearches.map((query, index) => (
              <button
                key={index}
                data-testid={`quick-search-${index}`}
                onClick={() => handleQuickSearch(query)}
                className="text-sm px-4 py-2 bg-gray-100 hover:bg-emerald-100 text-gray-700 hover:text-emerald-700 rounded-full border border-gray-200 hover:border-emerald-300"
              >
                {query}
              </button>
            ))}
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="max-w-5xl mx-auto">
            <div className="mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{fontFamily: 'Space Grotesk, sans-serif'}}>
                Your Perfect Matches
              </h3>
              <p className="text-gray-600">Found {searchResults.length} recipes tailored to your preferences</p>
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
          <div className="max-w-5xl mx-auto mt-16">
            <h3 className="text-2xl font-bold text-center mb-8 text-gray-900" style={{fontFamily: 'Space Grotesk, sans-serif'}}>
              How NIMA Works
            </h3>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center p-6">
                <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Search className="w-7 h-7 text-emerald-600" />
                </div>
                <h4 className="font-bold text-lg mb-2 text-gray-900">Natural Language Search</h4>
                <p className="text-gray-600 text-sm">Just type what you want in plain English - we understand your cravings and dietary needs</p>
              </div>
              <div className="text-center p-6">
                <div className="w-14 h-14 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Apple className="w-7 h-7 text-blue-600" />
                </div>
                <h4 className="font-bold text-lg mb-2 text-gray-900">Smart Nutrition Matching</h4>
                <p className="text-gray-600 text-sm">AI calculates and matches meals to your calorie, macro, and dietary requirements</p>
              </div>
              <div className="text-center p-6">
                <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="w-7 h-7 text-purple-600" />
                </div>
                <h4 className="font-bold text-lg mb-2 text-gray-900">Personalized Explanations</h4>
                <p className="text-gray-600 text-sm">Each match comes with a detailed explanation of why it fits your search</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-20">
        <div className="container mx-auto px-6 text-center">
          <p className="text-gray-400 text-sm">
            © 2025 NIMA - Nutritional Intelligence Menu Assistant. Powered by AI.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
