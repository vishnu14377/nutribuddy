import { useState, useEffect } from "react";
import axios from "axios";
import { Search, Sparkles, ChefHat, Flame, Apple, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toaster, toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const HomePage = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [recipesLoaded, setRecipesLoaded] = useState(false);

  // Check if recipes are loaded
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
      toast.error("Failed to initialize recipes");
    } finally {
      setIsInitializing(false);
    }
  };

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

  const quickSearches = [
    "High protein low carb",
    "Spicy vegetarian dinner",
    "Quick healthy lunch under 400 calories",
    "Comfort food for cold evening"
  ];

  const getSpiceColor = (level) => {
    if (!level) return "bg-gray-100 text-gray-700";
    if (level.toLowerCase().includes("spicy")) return "bg-red-100 text-red-700";
    if (level.toLowerCase().includes("medium")) return "bg-orange-100 text-orange-700";
    return "bg-green-100 text-green-700";
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
                <h1 className="text-2xl font-bold text-gray-900" style={{fontFamily: 'Space Grotesk, sans-serif'}}>NIMA</h1>
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
          <div className="bg-white rounded-2xl shadow-xl p-3 border border-gray-200">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                  data-testid="search-input"
                  type="text"
                  placeholder="E.g., 'high protein breakfast under 500 calories' or 'spicy vegetarian dinner'"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  className="pl-12 h-14 text-base border-0 focus-visible:ring-0 shadow-none"
                />
              </div>
              <Button
                data-testid="search-button"
                onClick={handleSearch}
                disabled={isLoading || !recipesLoaded}
                className="h-14 px-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl shadow-lg"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">⚡</span> Searching
                  </span>
                ) : (
                  "Search"
                )}
              </Button>
            </div>
          </div>

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
                onClick={() => {
                  setSearchQuery(query);
                  setTimeout(() => handleSearch(), 100);
                }}
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
                <Card key={index} data-testid={`recipe-card-${index}`} className="overflow-hidden hover:shadow-2xl border-2 border-transparent hover:border-emerald-200">
                  <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <CardTitle className="text-2xl mb-2" style={{fontFamily: 'Space Grotesk, sans-serif'}}>
                          {result.recipe.name}
                        </CardTitle>
                        <CardDescription className="text-base mb-3">
                          {result.recipe.description}
                        </CardDescription>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="bg-white">
                            {result.recipe.cuisine_type}
                          </Badge>
                          <Badge className={getSpiceColor(result.recipe.spice_level)}>
                            <Flame className="w-3 h-3 mr-1" />
                            {result.recipe.spice_level}
                          </Badge>
                          <Badge variant="outline" className="bg-white">
                            <Clock className="w-3 h-3 mr-1" />
                            {result.recipe.cooking_time}
                          </Badge>
                          {result.recipe.dietary_tags.map((tag, i) => (
                            <Badge key={i} className="bg-purple-100 text-purple-700 border-purple-300">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-3xl font-bold text-emerald-600">
                          {result.recipe.estimated_calories}
                        </div>
                        <div className="text-xs text-gray-600">calories</div>
                        <div className="mt-2 text-sm">
                          <div className="text-gray-600">Match: <span className="font-bold text-emerald-600">{(result.match_score * 100).toFixed(0)}%</span></div>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {/* Match Explanation */}
                    <div className="mb-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                      <div className="flex gap-2 mb-2">
                        <Sparkles className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-emerald-900 mb-1">Why this matches:</p>
                          <p className="text-emerald-800 leading-relaxed">{result.match_explanation}</p>
                        </div>
                      </div>
                    </div>

                    {/* Nutrition Info */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="text-center p-4 bg-blue-50 rounded-xl">
                        <div className="text-2xl font-bold text-blue-600">{result.recipe.estimated_protein}g</div>
                        <div className="text-xs text-blue-700 font-medium mt-1">Protein</div>
                      </div>
                      <div className="text-center p-4 bg-amber-50 rounded-xl">
                        <div className="text-2xl font-bold text-amber-600">{result.recipe.estimated_carbs}g</div>
                        <div className="text-xs text-amber-700 font-medium mt-1">Carbs</div>
                      </div>
                      <div className="text-center p-4 bg-pink-50 rounded-xl">
                        <div className="text-2xl font-bold text-pink-600">{result.recipe.estimated_fat}g</div>
                        <div className="text-xs text-pink-700 font-medium mt-1">Fat</div>
                      </div>
                    </div>

                    {/* Ingredients Preview */}
                    <div className="mb-4">
                      <p className="font-semibold text-gray-900 mb-2">Key Ingredients:</p>
                      <div className="flex flex-wrap gap-2">
                        {result.recipe.ingredients.slice(0, 8).map((ingredient, i) => (
                          <span key={i} className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
                            {ingredient}
                          </span>
                        ))}
                        {result.recipe.ingredients.length > 8 && (
                          <span className="text-sm px-3 py-1 bg-gray-200 text-gray-600 rounded-full">
                            +{result.recipe.ingredients.length - 8} more
                          </span>
                        )}
                      </div>
                    </div>

                    <Button 
                      data-testid={`order-button-${index}`}
                      className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold h-12 rounded-xl"
                    >
                      Order Now
                    </Button>
                  </CardContent>
                </Card>
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