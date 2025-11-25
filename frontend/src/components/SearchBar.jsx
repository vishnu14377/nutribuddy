/**
 * Search bar component for recipe queries
 */

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * SearchBar Component
 * @param {Object} props
 * @param {string} props.searchQuery - Current search query
 * @param {Function} props.setSearchQuery - Function to update search query
 * @param {Function} props.onSearch - Function to execute search
 * @param {boolean} props.isLoading - Loading state
 * @param {boolean} props.recipesLoaded - Whether recipes are loaded
 */
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
            onKeyPress={handleKeyPress}
            className="pl-12 h-14 text-base border-0 focus-visible:ring-0 shadow-none"
          />
        </div>
        <Button
          data-testid="search-button"
          onClick={onSearch}
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
  );
};
