import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Money } from '../ui/Money';
import { formatDate } from '../../lib/format';
import type { VendorQuoteRow } from '../../data/vendors/types';

interface QuoteCompareSheetProps {
  open: boolean;
  onClose: () => void;
  vendorName: string;
  quotes: VendorQuoteRow[];
}

const ROWS: { key: keyof VendorQuoteRow; label: string }[] = [
  { key: 'amount', label: 'Amount' },
  { key: 'includes', label: 'Includes' },
  { key: 'valid_until', label: 'Valid until' },
  { key: 'received_at', label: 'Received' },
  { key: 'notes', label: 'Notes' },
];

/** Side-by-side comparison of one vendor's quotes — opened from `VendorSheet` once there are two
 *  or more. A raised layer, since it opens from inside `VendorSheet` itself. */
export function QuoteCompareSheet({ open, onClose, vendorName, quotes }: QuoteCompareSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Compare quotes"
      description={vendorName}
      anchor="drawer"
      size="lg"
      layer="raised"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: `${Math.max(quotes.length, 2) * 160}px` }}>
          <thead>
            <tr>
              <th scope="col" className="sticky top-0 z-10 border-b border-separator bg-canvas px-2.5 py-2 text-left text-2xs font-semibold uppercase tracking-[.05em] text-text-muted">
                &nbsp;
              </th>
              {quotes.map((quote, i) => (
                <th
                  key={quote.id}
                  scope="col"
                  className="sticky top-0 z-10 border-b border-separator bg-canvas px-2.5 py-2 text-left text-2xs font-semibold uppercase tracking-[.05em] text-text-muted"
                >
                  {quote.label || `Quote ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.key} className="border-t border-separator-soft">
                <th scope="row" className="px-2.5 py-2.5 text-left align-top text-xs font-medium text-text-secondary">
                  {row.label}
                </th>
                {quotes.map((quote) => (
                  <td key={quote.id} className="px-2.5 py-2.5 align-top text-text-primary">
                    {row.key === 'amount' ? (
                      quote.amount != null ? (
                        <Money value={quote.amount} />
                      ) : (
                        '—'
                      )
                    ) : row.key === 'valid_until' || row.key === 'received_at' ? (
                      formatDate(quote[row.key] as string | null)
                    ) : (
                      (quote[row.key] as string | null) || '—'
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}
