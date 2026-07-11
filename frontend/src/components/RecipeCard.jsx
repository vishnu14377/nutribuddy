import { Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const RecipeCard = ({ result, index }) => {
  const { recipe, match_score, match_explanation } = result;

  const displayPrice =
    recipe.price > 0
      ? (recipe.price / 100).toFixed(2)  // prices stored in cents from ingestion
      : null;

  const matchPct = Math.round(match_score * 100);

  return (
    <Card className="overflow-hidden hover:shadow-md border border-gray-100 hover:border-green-400 transition-all bg-white">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge
                className={`font-bold text-xs ${
                  matchPct >= 85
                    ? "bg-green-600 text-white"
                    : matchPct >= 70
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                {matchPct}% Match
              </Badge>
              {recipe.restaurant_name && (
                <Badge variant="outline" className="text-xs truncate max-w-[160px]">
                  {recipe.restaurant_name}
                </Badge>
              )}
              {index === 0 && (
                <Badge className="bg-amber-100 text-amber-700 text-xs">Top Pick</Badge>
              )}
            </div>

            <CardTitle className="text-lg leading-snug mb-2">{recipe.name}</CardTitle>

            {/* Dietary tags */}
            {recipe.dietary_tags?.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {recipe.dietary_tags.map((tag) => (
                  <Badge key={tag} className="bg-emerald-50 text-emerald-700 text-xs border-0">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Calorie + price block */}
          <div className="text-right shrink-0">
            <div className="text-3xl font-extrabold text-gray-800 leading-none">
              {recipe.estimated_calories ?? "—"}
            </div>
            <div className="text-xs text-gray-400 mb-2">cal</div>
            {displayPrice && (
              <div className="text-base font-bold text-green-600">${displayPrice}</div>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0 space-y-4">
        {/* AI explanation */}
        <div className="p-3 bg-green-50 rounded-lg flex gap-2">
          <Sparkles className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-800">{match_explanation}</p>
        </div>

        {/* Macro tiles */}
        <div className="grid grid-cols-3 gap-2">
          <MacroTile value={recipe.estimated_protein} unit="g" label="Protein" color="blue" />
          <MacroTile value={recipe.estimated_carbs}   unit="g" label="Carbs"   color="amber" />
          <MacroTile value={recipe.estimated_fat}     unit="g" label="Fat"     color="pink" />
        </div>

        <Button className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg">
          Order Now
        </Button>
      </CardContent>
    </Card>
  );
};

function MacroTile({ value, unit, label, color }) {
  const colors = {
    blue:  { bg: "bg-blue-50",  text: "text-blue-600",  sub: "text-blue-400"  },
    amber: { bg: "bg-amber-50", text: "text-amber-600", sub: "text-amber-400" },
    pink:  { bg: "bg-pink-50",  text: "text-pink-600",  sub: "text-pink-400"  },
  };
  const { bg, text, sub } = colors[color];
  return (
    <div className={`text-center p-3 ${bg} rounded-lg`}>
      <div className={`text-lg font-bold ${text}`}>
        {value ?? "—"}{value != null ? unit : ""}
      </div>
      <div className={`text-xs ${sub}`}>{label}</div>
    </div>
  );
}
