/**
 * Recipe card component for Nutribuddy
 */

import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const RecipeCard = ({ result, index }) => {
  const { recipe, match_score, match_explanation } = result;

  return (
    <Card className="overflow-hidden hover:shadow-lg border border-gray-200 hover:border-green-400 transition-all bg-white">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge className="bg-green-100 text-green-700 font-bold text-xs">
                {(match_score * 100).toFixed(0)}% Match
              </Badge>
              {recipe.restaurant_name && (
                <Badge variant="outline" className="text-xs">{recipe.restaurant_name}</Badge>
              )}
            </div>
            <CardTitle className="text-xl mb-2">{recipe.name}</CardTitle>
            <div className="flex flex-wrap gap-1">
              {recipe.dietary_tags?.map((tag, i) => (
                <Badge key={i} className="bg-emerald-50 text-emerald-700 text-xs">{tag}</Badge>
              ))}
            </div>
          </div>
          <div className="text-right ml-4">
            <div className="text-3xl font-bold text-gray-800">{recipe.estimated_calories}</div>
            <div className="text-xs text-gray-500">cal</div>
            {recipe.price > 0 && (
              <div className="mt-2 text-lg font-bold text-green-600">
                ${(recipe.price > 100 ? recipe.price / 100 : recipe.price).toFixed(2)}
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {/* AI Explanation */}
        <div className="mb-4 p-3 bg-green-50 rounded-lg">
          <div className="flex gap-2">
            <Sparkles className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-800">{match_explanation}</p>
          </div>
        </div>

        {/* Nutrition */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-lg font-bold text-blue-600">{recipe.estimated_protein}g</div>
            <div className="text-xs text-blue-500">Protein</div>
          </div>
          <div className="text-center p-3 bg-amber-50 rounded-lg">
            <div className="text-lg font-bold text-amber-600">{recipe.estimated_carbs}g</div>
            <div className="text-xs text-amber-500">Carbs</div>
          </div>
          <div className="text-center p-3 bg-pink-50 rounded-lg">
            <div className="text-lg font-bold text-pink-600">{recipe.estimated_fat}g</div>
            <div className="text-xs text-pink-500">Fat</div>
          </div>
        </div>

        <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg">
          Add to Cart
        </Button>
      </CardContent>
    </Card>
  );
};
