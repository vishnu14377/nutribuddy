/**
 * Recipe card component - Uber Eats themed
 */

import { Flame, Clock, Star, Bike, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const getSpiceColor = (level) => {
  if (!level) return "bg-gray-100 text-gray-700";
  if (level.toLowerCase().includes("spicy")) return "bg-red-100 text-red-700 border-red-200";
  if (level.toLowerCase().includes("medium")) return "bg-orange-100 text-orange-700 border-orange-200";
  return "bg-green-100 text-green-700 border-green-200";
};

export const RecipeCard = ({ result, index }) => {
  const { recipe, match_score, match_explanation } = result;
  
  // Generate mock delivery time and rating for Uber Eats feel
  const deliveryTime = `${15 + Math.floor(Math.random() * 20)}-${30 + Math.floor(Math.random() * 15)} min`;
  const rating = (4 + Math.random() * 0.9).toFixed(1);
  const price = (8 + Math.random() * 15).toFixed(2);

  return (
    <Card
      data-testid={`recipe-card-${index}`}
      className="overflow-hidden hover:shadow-2xl border border-gray-200 hover:border-[#06C167] transition-all duration-300 bg-white"
    >
      <CardHeader className="bg-gradient-to-r from-gray-50 to-white pb-4">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-[#06C167] text-black font-bold text-xs">
                {(match_score * 100).toFixed(0)}% Match
              </Badge>
              <Badge variant="outline" className="text-xs border-gray-300">
                <Star className="w-3 h-3 mr-1 fill-yellow-400 text-yellow-400" />
                {rating}
              </Badge>
            </div>
            <CardTitle className="text-2xl mb-2 text-black" style={{ fontFamily: 'UberMove, system-ui, sans-serif' }}>
              {recipe.name}
            </CardTitle>
            <CardDescription className="text-base mb-3 text-gray-600">
              {recipe.description}
            </CardDescription>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="bg-gray-100 text-gray-800 font-medium">
                {recipe.cuisine_type}
              </Badge>
              <Badge className={getSpiceColor(recipe.spice_level)}>
                <Flame className="w-3 h-3 mr-1" />
                {recipe.spice_level}
              </Badge>
              <Badge variant="outline" className="bg-white border-gray-200">
                <Clock className="w-3 h-3 mr-1" />
                {recipe.cooking_time}
              </Badge>
              <Badge variant="outline" className="bg-white border-gray-200">
                <Bike className="w-3 h-3 mr-1 text-[#06C167]" />
                {deliveryTime}
              </Badge>
              {recipe.dietary_tags.map((tag, i) => (
                <Badge key={i} className="bg-emerald-100 text-emerald-700 border-emerald-200">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
          <div className="text-right ml-6 min-w-[100px]">
            <div className="text-4xl font-bold text-black">
              {recipe.estimated_calories}
            </div>
            <div className="text-xs text-gray-500 font-medium">calories</div>
            <div className="mt-3 text-2xl font-bold text-[#06C167]">
              ${price}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {/* AI Match Explanation */}
        <div className="mb-6 p-4 bg-black rounded-xl">
          <div className="flex gap-3">
            <div className="w-8 h-8 bg-[#06C167] rounded-lg flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-black" />
            </div>
            <div>
              <p className="font-bold text-[#06C167] mb-1 text-sm">Why this matches your search</p>
              <p className="text-gray-300 text-sm leading-relaxed">{match_explanation}</p>
            </div>
          </div>
        </div>

        {/* Nutrition Info */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="text-2xl font-bold text-blue-600">{recipe.estimated_protein}g</div>
            <div className="text-xs text-blue-600 font-medium mt-1">Protein</div>
          </div>
          <div className="text-center p-4 bg-amber-50 rounded-xl border border-amber-100">
            <div className="text-2xl font-bold text-amber-600">{recipe.estimated_carbs}g</div>
            <div className="text-xs text-amber-600 font-medium mt-1">Carbs</div>
          </div>
          <div className="text-center p-4 bg-pink-50 rounded-xl border border-pink-100">
            <div className="text-2xl font-bold text-pink-600">{recipe.estimated_fat}g</div>
            <div className="text-xs text-pink-600 font-medium mt-1">Fat</div>
          </div>
        </div>

        {/* Ingredients */}
        <div className="mb-6">
          <p className="font-bold text-black mb-3">Key Ingredients</p>
          <div className="flex flex-wrap gap-2">
            {recipe.ingredients.slice(0, 8).map((ingredient, i) => (
              <span key={i} className="text-sm px-3 py-1.5 bg-gray-100 text-gray-700 rounded-full font-medium">
                {ingredient}
              </span>
            ))}
            {recipe.ingredients.length > 8 && (
              <span className="text-sm px-3 py-1.5 bg-gray-200 text-gray-600 rounded-full font-medium">
                +{recipe.ingredients.length - 8} more
              </span>
            )}
          </div>
        </div>

        {/* Order Button */}
        <Button
          data-testid={`order-button-${index}`}
          className="w-full bg-[#06C167] hover:bg-[#05a055] text-black font-bold h-14 rounded-xl text-lg transition-all duration-200"
        >
          Add to Cart — ${price}
        </Button>
      </CardContent>
    </Card>
  );
};
