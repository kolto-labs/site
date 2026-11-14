/**
 * Page switches. The Join page is off for now.
 * To turn it back on, set `join: true` here and rebuild. That one line brings back
 * the route, nav item, [J] hotkey, footer link, sitemap and llms.txt entries, page
 * meta, the original FAQ and About links, and drops the /join redirect.
 */
export const PAGES: { join: boolean } = { join: false };

/** DEV-ONLY: user-music entry points. Hidden in production builds. */
export const USER_MEDIA_UI: boolean = import.meta.env.DEV;
