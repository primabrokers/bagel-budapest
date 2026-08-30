import type { ParsedContact } from './vcard';

/**
 * The browser's native contact picker, where it exists.
 *
 * It mostly does not. `navigator.contacts` ships by default only in Chrome on Android; on iOS it
 * sits behind Settings → Safari → Advanced → Feature Flags, and there is no desktop Safari or
 * Firefox support at all. Since this app is installed as a PWA on an iPhone, the picker is the
 * lucky path rather than the main one — which is why `contactPickerAvailable()` exists and why the
 * caller must keep the .vcf file import alongside it rather than treating this as the way in.
 *
 * Never render the picker button without checking first. A button that does nothing on the one
 * device the family actually uses is worse than no button.
 */

/** The slice of the Contact Picker API this uses. Not in TypeScript's DOM lib. */
interface ContactsManagerLike {
  select(
    properties: string[],
    options?: { multiple?: boolean },
  ): Promise<{ name?: string[]; tel?: string[]; email?: string[]; address?: unknown[] }[]>;
  getProperties?(): Promise<string[]>;
}

function manager(): ContactsManagerLike | null {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return null;
  const candidate = (navigator as Navigator & { contacts?: ContactsManagerLike }).contacts;
  // Both checks matter: some browsers expose a `navigator.contacts` belonging to an older, unrelated
  // proposal, and `ContactsManager` on the window is what distinguishes the real thing.
  if (!candidate || typeof candidate.select !== 'function') return null;
  if (!('ContactsManager' in window)) return null;
  return candidate;
}

export function contactPickerAvailable(): boolean {
  return manager() !== null;
}

function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Opens the picker and returns whatever was chosen, in the same shape the .vcf parser produces so
 * both import paths feed one review list.
 *
 * Must be called straight from a user gesture — the browser refuses otherwise. A cancelled picker
 * resolves to an empty array rather than throwing, because backing out of a picker is a normal
 * thing to do and is not an error worth showing anybody.
 */
export async function pickContacts(): Promise<ParsedContact[]> {
  const contacts = manager();
  if (!contacts) return [];

  // Ask only for what is supported: requesting a property the browser does not know throws and
  // loses the whole selection, and `address` in particular is not universally implemented.
  let properties = ['name', 'tel', 'email', 'address'];
  try {
    if (typeof contacts.getProperties === 'function') {
      const supported = await contacts.getProperties();
      properties = properties.filter((p) => supported.includes(p));
    }
  } catch {
    properties = ['name', 'tel', 'email'];
  }
  if (properties.length === 0) return [];

  let selected;
  try {
    selected = await contacts.select(properties, { multiple: true });
  } catch {
    return [];
  }

  return (selected ?? []).map((entry) => {
    const fullName = entry.name?.[0]?.trim() ?? '';
    const { firstName, lastName } = splitName(fullName);
    const address = entry.address?.[0];
    return {
      firstName,
      lastName,
      fullName,
      phone: entry.tel?.[0] || undefined,
      email: entry.email?.[0] || undefined,
      // The address comes back as a ContactAddress object rather than a string, and its shape
      // varies; only take it when it is genuinely readable.
      address: typeof address === 'string' ? address : undefined,
    };
  });
}
