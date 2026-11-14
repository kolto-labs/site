/** Generated from content/screenshots.json by tools/gen_screenshots_ts.py. */
export interface Screenshot {
  slug: string;
  shows: string;
  credit: string;
  sourcePage: string;
  width: number;
  height: number;
}

export const screenshots: Screenshot[] = [
  { slug: "kolto-tank-body-01", shows: "Two occupied kolto tanks, in-engine (K1)", credit: "DarthParametric — K1 Kolto Tank With Body placeable (mod screenshot)", sourcePage: "https://deadlystream.com/topic/5891-revan-clones-in-star-forge-and-taris/", width: 1920, height: 1080 },
  { slug: "kolto-ward-01", shows: "Ward lined with glowing kolto tanks (K1)", credit: "DarthParametric — K1 Kolto Tank With Body placeable (mod screenshot)", sourcePage: "https://deadlystream.com/topic/5891-revan-clones-in-star-forge-and-taris/", width: 1920, height: 1080 },
  { slug: "kolto-ward-02", shows: "Kolto tank corridor, occupied tanks (K1)", credit: "DarthParametric — K1 Kolto Tank With Body placeable (mod screenshot)", sourcePage: "https://deadlystream.com/topic/5891-revan-clones-in-star-forge-and-taris/", width: 1920, height: 1080 },
  { slug: "kolto-ward-taris", shows: "Taris medical ward with kolto tanks (K1)", credit: "DarthParametric — Diversified Wounded Republic Soldiers on Taris (mod screenshot)", sourcePage: "https://deadlystream.com/topic/5919-moddiversified-wounded-republic-soldiers-on-taris/", width: 1920, height: 1080 },
  { slug: "hrakert-kolto-tanks", shows: "Kolto tanks and control panel on the Hrakert Rift sea floor, Manaan (K1)", credit: "DarthParametric — K1 Community Patch issue #672 (screenshot)", sourcePage: "https://github.com/KOTORCommunityPatches/K1_Community_Patch/issues/672", width: 1920, height: 1080 },
  { slug: "hrakert-rift", shows: "Hrakert Rift observation window with firaxan shark (K1)", credit: "gerblul — Hrakert Rift (Deadly Stream gallery)", sourcePage: "https://deadlystream.com/gallery/image/1044-hrakert-rift/", width: 1366, height: 768 },
];

export const screenshotBySlug = (slug: string) => screenshots.find((s) => s.slug === slug);
