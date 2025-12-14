/**
 * Search bar component - Uber Eats themed
 */

import { Search, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const SearchBar = ({
  searchQuery,
  setSearchQuery,
  onSearch,
  isLoading,
  recipesLoaded
}) => {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      onSearch();
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-2xl p-2 border border-gray-200 max-w-3xl mx-auto">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <Input
            data-testid="search-input"
            type="text"
            placeholder='Try "high protein meal" or "spicy vegetarian under 400 cal"'
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            className="pl-12 h-14 text-base border-0 focus-visible:ring-0 shadow-none bg-gray-50 rounded-xl text-black placeholder:text-gray-400"
          />
        </div>
        <Button
          data-testid="search-button"
          onClick={onSearch}
          disabled={isLoading || !recipesLoaded}
          className="h-14 px-8 bg-black hover:bg-gray-800 text-white font-bold rounded-xl shadow-lg transition-all duration-200 disabled:bg-gray-300"
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⚡</span> Finding...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#06C167]" />
              Search
            </span>
          )}
        </Button>
      </div>
    </div>
  );
};
