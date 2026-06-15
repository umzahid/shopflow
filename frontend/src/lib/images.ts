// Curated Unsplash photo IDs used when a product/category has no real image yet.
// Pinned IDs (not random) so dev shots stay deterministic between reloads.

const FALLBACK_PRODUCT_IMAGES = [
  "1523275335684-37898b6baf30", // watch
  "1542291026-7eec264c27ff", // sneakers
  "1505740420928-5e560c06d30e", // headphones
  "1572635196237-14b3f281503f", // sunglasses
  "1526170375885-4d8ecf77b99f", // camera
  "1556909114-f6e7ad7d3136", // candle / home
  "1514228742587-6b1558fcca3d", // ceramic mug
  "1503602642458-232111445657", // leather bag
  "1593642632559-0c6d3fc62b89", // laptop
  "1517336714731-489689fd1ca8", // backpack
  "1567721913486-6585f069b332", // skin care
  "1542038784456-1ea8e935640e", // plant pot
] as const;

const CATEGORY_IMAGES: Record<string, string> = {
  Apparel: "1483985988355-763728e1935b",
  Electronics: "1518770660439-4636190af475",
  Home: "1493663284031-b7e3aefcae8e",
  Beauty: "1556228720-195a672e8a03",
  Outdoors: "1504280390367-361c6d9f38f4",
  Stationery: "1497032628192-86f99bcd76bc",
};

const HERO_IMAGE = "1441986300917-64674bd600d8"; // modern boutique storefront, shopping bags

// q=85 instead of 80 → noticeably sharper for the hero at the cost of ~10% size.
const UNSPLASH = (id: string, w = 800, h = 800, q = 80) =>
  `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=${q}`;

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function productCoverUrl(
  product: { id: string; images: string[] },
  size: { w?: number; h?: number } = {},
): string {
  const real = product.images[0];
  if (real && /^https?:\/\//.test(real)) return real;
  const idx = hashId(product.id) % FALLBACK_PRODUCT_IMAGES.length;
  return UNSPLASH(FALLBACK_PRODUCT_IMAGES[idx], size.w ?? 800, size.h ?? 800);
}

export function productGalleryUrls(
  product: { id: string; images: string[] },
  size: { w?: number; h?: number } = {},
): string[] {
  const real = product.images.filter((u) => /^https?:\/\//.test(u));
  if (real.length > 0) return real;
  const start = hashId(product.id) % FALLBACK_PRODUCT_IMAGES.length;
  return Array.from({ length: 4 }, (_, i) =>
    UNSPLASH(
      FALLBACK_PRODUCT_IMAGES[(start + i) % FALLBACK_PRODUCT_IMAGES.length],
      size.w ?? 1200,
      size.h ?? 1200,
    ),
  );
}

export function categoryImageUrl(name: string): string {
  const id = CATEGORY_IMAGES[name] ?? CATEGORY_IMAGES.Apparel;
  return UNSPLASH(id, 800, 600);
}

export function categoryList(): { name: string; href: string; query: string }[] {
  return [
    { name: "Apparel", href: "/products?q=apparel", query: "apparel" },
    { name: "Electronics", href: "/products?q=electronics", query: "electronics" },
    { name: "Home", href: "/products?q=home", query: "home" },
    { name: "Beauty", href: "/products?q=beauty", query: "beauty" },
    { name: "Outdoors", href: "/products?q=outdoors", query: "outdoors" },
    { name: "Stationery", href: "/products?q=stationery", query: "stationery" },
  ];
}

// Hero gets a higher quality + larger source for retina/wide displays.
export const heroImageUrl = (w = 2400, h = 1500) =>
  UNSPLASH(HERO_IMAGE, w, h, 85);
