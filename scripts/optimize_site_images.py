"""Build lightweight WebP derivatives for images used by the storefront.

Original source images are intentionally kept as master copies. Run this script
after replacing one of them to refresh the web-ready derivative.
"""

from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]


MEDIA = {
    "assets/media/hero-fluide-product-studio-blue-desktop-v1.png": (2048, 88),
    "assets/media/hero-woman-product-family-blue-mobile-v1.png": (1600, 88),
    "assets/media/offer-value-sets-v1.png": (1800, 87),
    "assets/media/offer-2plus1-matsukita-v1.png": (1800, 87),
    "assets/media/finder-selection-blue-4k-v1.png": (2200, 87),
    "assets/media/catalog-banner-blue-stripes-v1.png": (1800, 87),
    "assets/media/perfume-3-plus-1-banner-v1.png": (1400, 88),
    "assets/media/category-all-assortment-v2.png": (1400, 88),
    "assets/media/category-perfume-studio-v1.png": (1600, 87),
    "assets/media/category-care-studio-v1.png": (1600, 87),
    "assets/media/category-home-studio-v1.png": (1600, 87),
    "assets/media/fluide-editorial-stilllife-v1.jpg": (1600, 87),
    "assets/media/hero-shop-v2-4k.jpg": (2200, 87),
    "assets/media/account-selection-star-sticker-indigo-v2.png": (900, 88),
    "assets/media/account-mood-orbit-sticker-indigo-v2.png": (900, 88),
    "assets/media/account-atelier-forms-sticker-indigo-v2.png": (900, 88),
    "IMG_7434.PNG": (1600, 88),
    "IMG_7435.PNG": (1600, 88),
    "IMG_7436.PNG": (1600, 88),
}


PRODUCT_LINE = (
    "candle-ballerina.png",
    "car-fragrance.png",
    "diffuser-cashmere.png",
    "fragrance-black-pepper.png",
    "fragrance-cherry.png",
    "fragrance-hayati.png",
    "fragrance-matsukita-card.png",
    "fragrance-matsukita.png",
    "fragrance-musk-kashmir.png",
    "fragrance-white.png",
    "hair-spray-devils-intrigue.png",
    "home-perfume-sea-salt.png",
    "solid-perfume-matsukita.png",
)

EDITORIAL = (
    "expert-perfume.jpg",
    "perfume-kiosk.jpg",
    "perfume-making.jpg",
    "perfume-workshop.jpg",
)


def destination_for(source: Path) -> Path:
    return source.with_suffix(".webp")


def convert(relative_source: str, max_side: int, quality: int) -> tuple[int, int]:
    source = ROOT / relative_source
    destination = destination_for(source)
    original_bytes = source.stat().st_size

    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened)
        image.thumbnail((max_side, max_side), Image.Resampling.LANCZOS)
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        image.save(
            destination,
            "WEBP",
            quality=quality,
            method=6,
            exact=image.mode == "RGBA",
        )

    return original_bytes, destination.stat().st_size


def main() -> None:
    manifest = dict(MEDIA)
    manifest.update({f"assets/product-line/{name}": (1400, 90) for name in PRODUCT_LINE})
    manifest.update({f"assets/editorial/{name}": (1800, 87) for name in EDITORIAL})

    original_total = 0
    optimized_total = 0
    for relative_source, (max_side, quality) in sorted(manifest.items()):
        source = ROOT / relative_source
        if not source.exists():
            continue
        original_bytes, optimized_bytes = convert(relative_source, max_side, quality)
        original_total += original_bytes
        optimized_total += optimized_bytes
        print(
            f"{relative_source}: "
            f"{original_bytes / 1024:.0f} KB -> {optimized_bytes / 1024:.0f} KB"
        )

    reduction = 100 * (1 - optimized_total / original_total)
    print(
        f"Total: {original_total / 1024 / 1024:.2f} MB -> "
        f"{optimized_total / 1024 / 1024:.2f} MB ({reduction:.1f}% smaller)"
    )


if __name__ == "__main__":
    main()
