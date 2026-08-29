import { supabasePublic } from '../supabasePublic';

/**
 * Resolves a generated-artwork storage path to a URL the browser can load.
 *
 * `bm-invitation-assets` is a PUBLIC bucket, so this is pure string building — no network call and
 * no session needed, which is what lets the same helper serve the authenticated designer and the
 * anonymous RSVP portal.
 *
 * Built on `supabasePublic` rather than `lib/supabase` deliberately: importing the authenticated
 * client would construct it as a side effect, and `RsvpPortalPage` goes out of its way to avoid
 * that (see `lib/supabasePublic.ts`'s header). A guest opening an invitation link should not cause
 * an auth client to spin up in their browser.
 *
 * Returns `null` for a missing path so callers can pass the result straight through to
 * `InvitationRenderer`'s optional `backgroundUrl` prop.
 */
export function invitationAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabasePublic.storage.from('bm-invitation-assets').getPublicUrl(path).data.publicUrl;
}
