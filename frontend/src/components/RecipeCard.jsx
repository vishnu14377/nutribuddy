import { Check, Copy, ExternalLink, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/formatPrice";
import { buildOrderLink } from "@/lib/orderLink";

export const RecipeCard = ({ result, index }) => {
  const { recipe, match_score, match_explanation, meets_constraints, constrained, distance_km } = result;
  const isFallback = meets_constraints === false;

  const displayPrice = formatPrice(recipe);
  const { url, searchTerm, platformLabel, badgeClass, copyable } = buildOrderLink(recipe);

  const copySearchTerm = async () => {
    try {
      await navigator.clipboard.writeText(searchTerm);
      toast.success(`Copied — paste into ${platformLabel}`);
    } catch {
      // Clipboard API unavailable (non-secure context / in-app browser):
      // show the term itself so the user can still act on it.
      toast.info(`Search for: ${searchTerm}`);
    }
  };

  return (
    <Card className="overflow-hidden hover:shadow-md border border-gray-100 hover:border-green-400 transition-all bg-white">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              {/* Raw cosine similarity was never a probability — a green check
                  ("this fits") is honest; a "43% Match" on a perfect result
                  reads as a coin flip. */}
              {isFallback && match_explanation?.startsWith("Different dish") ? (
                <Badge className="font-bold text-xs bg-blue-50 text-blue-600">
                  Different dish
                </Badge>
              ) : isFallback ? (
                <Badge className="font-bold text-xs bg-amber-100 text-amber-700">
                  Closest match
                </Badge>
              ) : constrained ? (
                <Badge className="font-bold text-xs bg-green-600 text-white">
                  <Check className="w-3 h-3 mr-1" />
                  Fits your search
                </Badge>
              ) : (
                <Badge className="font-bold text-xs bg-gray-100 text-gray-600">Match</Badge>
              )}
              <Badge className={`text-xs border-0 ${badgeClass}`}>{platformLabel}</Badge>
              {recipe.restaurant_name && (
                <Badge variant="outline" className="text-xs truncate max-w-[160px]">
                  {recipe.restaurant_name}
                </Badge>
              )}
              {distance_km != null && (
                <Badge variant="outline" className="text-xs text-gray-500">
                  {distance_km} km
                </Badge>
              )}
              {index === 0 && !isFallback && (
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
              <div className="text-base font-bold text-green-600">{displayPrice}</div>
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
        <div>
          <div className="grid grid-cols-3 gap-2">
            <MacroTile value={recipe.estimated_protein} unit="g" label="Protein" color="blue" />
            <MacroTile value={recipe.estimated_carbs}   unit="g" label="Carbs"   color="amber" />
            <MacroTile value={recipe.estimated_fat}     unit="g" label="Fat"     color="pink" />
          </div>
          <p className="text-[10px] text-gray-400 text-right mt-1">AI-estimated nutrition</p>
        </div>

        {/* Order CTA: deep link > copy fallback > honest "coming soon" for
            platforms with no reachable destination */}
        {url ? (
          <>
            <Button asChild className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4 mr-2" />
                Order on {platformLabel}
              </a>
            </Button>
            <button
              onClick={copySearchTerm}
              className="w-full text-center text-xs text-gray-400 hover:text-green-600 transition-colors -mt-2"
            >
              or copy search term
            </button>
          </>
        ) : copyable ? (
          <Button
            onClick={copySearchTerm}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy search for {platformLabel}
          </Button>
        ) : (
          <div className="w-full text-center text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg py-2.5">
            Partner item — ordering coming soon
          </div>
        )}
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
