import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FREE_SEARCHES_PER_DAY } from "@/lib/searchQuota";

export function UpgradeModal({ open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>You've hit today's free limit</DialogTitle>
          <DialogDescription>
            The free plan includes {FREE_SEARCHES_PER_DAY} AI meal searches per
            day. Your quota resets at midnight.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-green-600" />
            <span className="font-bold text-green-800">Nutribuddy Plus</span>
            <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-amber-600 bg-amber-100 rounded-full px-2 py-0.5">
              Coming soon
            </span>
          </div>
          <div className="text-2xl font-extrabold text-green-900 mb-1">
            $4.99<span className="text-sm font-medium text-green-700">/mo</span>
          </div>
          <ul className="text-sm text-green-800 space-y-1">
            <li>· Unlimited AI meal searches</li>
            <li>· Direct order links to Uber Eats &amp; DoorDash</li>
          </ul>
        </div>

        <DialogFooter className="sm:justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => {
              toast.success("You're on the list — we'll be in touch!");
              onOpenChange(false);
            }}
          >
            Notify me when Plus launches
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
