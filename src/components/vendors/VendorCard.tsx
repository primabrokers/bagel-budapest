import { Star } from 'lucide-react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Money } from '../ui/Money';
import { IconButton } from '../ui/IconButton';
import { cn } from '../../lib/cn';
import { activateOnKey } from '../../lib/activate';
import type { VendorWithQuotes } from '../../data/vendors/types';
import { VENDOR_STATUS_BADGE, VENDOR_STATUS_LABELS } from './statusMeta';

interface VendorCardProps {
  vendor: VendorWithQuotes;
  onOpen: () => void;
  onToggleFavourite: () => void;
  favouriteBusy?: boolean;
  className?: string;
}

/** A 1–5 star rating, read-only — filled stars for the rating, outline for the rest. Renders
 *  nothing when unrated (a row of five empty stars would read as "rated zero", not "not rated
 *  yet"). */
function RatingStars({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Rated ${rating} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={12}
          aria-hidden="true"
          className={i < rating ? 'fill-gold-500 text-gold-500' : 'text-separator-strong'}
        />
      ))}
    </span>
  );
}

/** One vendor's card — used both in `VendorsPage`'s status-board columns and its plain list.
 *  The whole card opens `VendorSheet`; the favourite star is its own nested button, guarded by
 *  `activateOnKey`'s target===currentTarget check so Enter/Space on the star doesn't also open
 *  the sheet. */
export function VendorCard({ vendor, onOpen, onToggleFavourite, favouriteBusy, className }: VendorCardProps) {
  const contactLine = [vendor.contact_name, vendor.phone, vendor.email].filter(Boolean).join(' · ');

  return (
    <Card
      padding="sm"
      shadow="none"
      className={cn(
        'flex flex-col gap-2 transition-colors hover:border-plum-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-plum-400',
        className,
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={activateOnKey(onOpen)}
        className="flex cursor-pointer flex-col gap-2 focus-visible:outline-none"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-text-primary">{vendor.name}</p>
            <p className="truncate text-xs text-text-muted">{vendor.category}</p>
          </div>
          <IconButton
            label={vendor.favourite ? `Remove ${vendor.name} from favourites` : `Favourite ${vendor.name}`}
            size="sm"
            disabled={favouriteBusy}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavourite();
            }}
            className="-mr-1 -mt-1 shrink-0"
          >
            <Star
              size={16}
              aria-hidden="true"
              className={vendor.favourite ? 'fill-gold-500 text-gold-500' : 'text-text-faint'}
            />
          </IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={VENDOR_STATUS_BADGE[vendor.status]}>{VENDOR_STATUS_LABELS[vendor.status]}</Badge>
          <RatingStars rating={vendor.rating} />
        </div>

        {contactLine && <p className="truncate text-xs text-text-muted">{contactLine}</p>}

        {(vendor.agreed_price != null || vendor.quoted_price != null) && (
          <p className="text-sm">
            {vendor.agreed_price != null ? (
              <>
                <span className="text-text-muted">Agreed </span>
                <Money value={vendor.agreed_price} className="font-medium" />
              </>
            ) : (
              <>
                <span className="text-text-muted">Quoted </span>
                <Money value={vendor.quoted_price ?? 0} className="font-medium" />
              </>
            )}
          </p>
        )}
      </div>
    </Card>
  );
}
