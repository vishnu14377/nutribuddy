/**
 * Recipe card component displaying recipe details and match information
 */

import { Flame, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

/**
 * Get color class for spice level badge
 * @param {string} level - Spice level
 * @returns {string} Tailwind CSS classes
 */
const getSpiceColor = (level) => {
  if (!level) return "bg-gray-100 text-gray-700";
  if (level.toLowerCase().includes("spicy")) return "bg-red-100 text-red-700";
  if (level.toLowerCase().includes("medium")) return "bg-orange-100 text-orange-700";
  return "bg-green-100 text-green-700";
};

/**
 * RecipeCard Component
 * @param {Object} props
 * @param {Object} props.result - Search result containing recipe and match data
 * @param {number} props.index - Card index for testing
 */
export const RecipeCard = ({ result, index }) => {
  const { recipe, match_score, match_explanation } = result;

  return (
    <Card
      data-testid={`recipe-card-${index}`}
      className="overflow-hidden hover:shadow-2xl border-2 border-transparent hover:border-emerald-200"
    >
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-2xl mb-2" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {recipe.name}
            </CardTitle>
            <CardDescription className="text-base mb-3">
              {recipe.description}
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-white">
                {recipe.cuisine_type}
              </Badge>
              <Badge className={getSpiceColor(recipe.spice_level)}>
                <Flame className="w-3 h-3 mr-1" />
                {recipe.spice_level}
              </Badge>
              <Badge variant="outline" className="bg-white">
                <Clock className="w-3 h-3 mr-1" />
                {recipe.cooking_time}
              </Badge>
              {recipe.dietary_tags.map((tag, i) => (
                <Badge key={i} className="bg-purple-100 text-purple-700 border-purple-300">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-right ml-4">
            <div className="text-3xl font-bold text-emerald-600">
              {recipe.estimated_calories}
            </div>
            <div className="text-xs text-gray-600">calories</div>
            <div className="mt-2 text-sm">
              <div className="text-gray-600">
                Match: <span className="font-bold text-emerald-600">{(match_score * 100).toFixed(0)}%</span>
              </div>
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
              <p className="text-emerald-800 leading-relaxed">{match_explanation}</p>
            </div>
          </div>
        </div>

        {/* Nutrition Info */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded-xl">
            <div className="text-2xl font-bold text-blue-600">{recipe.estimated_protein}g</div>
            <div className="text-xs text-blue-700 font-medium mt-1">Protein</div>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-xl">
            <div className="text-2xl font-bold text-amber-600">{recipe.estimated_carbs}g</div>
            <div className="text-xs text-amber-700 font-medium mt-1">Carbs</div>
          </div>
          <div className="text-center p-4 bg-pink-50 rounded-xl">
            <div className="text-2xl font-bold text-pink-600">{recipe.estimated_fat}g</div>
            <div className="text-xs text-pink-700 font-medium mt-1">Fat</div>
          </div>
        </div>

        {/* Ingredients Preview */}
        <div className="mb-4">
          <p className="font-semibold text-gray-900 mb-2">Key Ingredients:</p>
          <div className="flex flex-wrap gap-2">
            {recipe.ingredients.slice(0, 8).map((ingredient, i) => (
              <span key={i} className="text-sm px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
                {ingredient}
              </span>
            ))}
            {recipe.ingredients.length > 8 && (
              <span className="text-sm px-3 py-1 bg-gray-200 text-gray-600 rounded-full">
                +{recipe.ingredients.length - 8} more
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
  );
};
