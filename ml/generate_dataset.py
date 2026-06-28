#!/usr/bin/env python3
"""
Synthetic YOLO dataset generator for Zoomy POS product detection.

Composites transparent product PNGs onto generated backgrounds to produce
labeled 640×640 training scenes for YOLOv8-nano 24-class detection.

Usage (local test):
    python3 ml/generate_dataset.py \\
        --assets "Complete Product Images - Transparent" \\
        --output dataset \\
        --train 4000 \\
        --val 800

Usage (Colab):
    !python3 /content/zoomy-pos/ml/generate_dataset.py \\
        --assets "/content/drive/MyDrive/zoomy-pos/Complete Product Images - Transparent" \\
        --output "/content/dataset" \\
        --train 4000 \\
        --val 800
"""

import argparse
import colorsys
import json
import os
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

IMG_SIZE = 640
MIN_PRODUCTS = 1
MAX_PRODUCTS = 5
MIN_SCALE = 0.12   # product width as fraction of IMG_SIZE
MAX_SCALE = 0.40
MAX_PLACE_ATTEMPTS = 30
MAX_IOU = 0.05

# Class index → PNG filename stem.
# Order must match utils/scan-to-cart/labels.ts and ml/labels_template.json.
CLASS_FILES = [
    "FreezeDriedMunchies_Beef_Liver",          # 0
    "FreezeDriedMunchies_Capelin",              # 1
    "FreezeDriedMunchies_Chicken_Breast",       # 2
    "FreezeDriedMunchies_Chicken_Egg",          # 3
    "FreezeDriedMunchies_Chicken_Liver",        # 4
    "FreezeDriedMunchies_Duck_Breast",          # 5
    "FreezeDriedMunchies_Salmon",               # 6
    "FreezeDriedMunchies_TrioPack",             # 7
    "MeatyTreats_Beef_Slices",                  # 8
    "MeatyTreats_Chicken_Slices",               # 9
    "MeatyTreats_Duck_Strips",                  # 10
    "MeatyTreats_Salmon_Cubes",                 # 11
    "MultivitaminTreats_Beef",                  # 12
    "MultivitaminTreats_Chicken",               # 13
    "MultivitaminTreats_Duck",                  # 14
    "MunchiesSuperfood_Beef_Blueberry",         # 15
    "MunchiesSuperfood_Cat_Grass",              # 16
    "MunchiesSuperfood_Cat_Grass_MakapalPackaging", # 17
    "MunchiesSuperfood_Chicken_Cranberry",      # 18
    "MunchiesSuperfood_Chicken_Pumpkin",        # 19
    "MunchiesSuperfood_Duck_Apple",             # 20
    "MunchiesSuperfood_Duck_Pear",              # 21
    "TastyTreats_Chicken_Jerky",                # 22
    "TastyTreats_Duck_Jerky",                   # 23
]


def load_products(assets_dir: Path) -> list[tuple[int, Image.Image]]:
    """Return [(class_id, RGBA Image), ...] in CLASS_FILES order."""
    products = []
    for class_id, stem in enumerate(CLASS_FILES):
        # Walk all subdirectories, skip *_Back folders
        matches = [
            p for p in assets_dir.rglob(f"{stem}.png")
            if "Back" not in str(p)
        ]
        if not matches:
            print(f"WARNING: class {class_id} ({stem}) not found", file=sys.stderr)
            continue
        img = Image.open(matches[0]).convert("RGBA")
        products.append((class_id, img))
    print(f"Loaded {len(products)}/{len(CLASS_FILES)} product images")
    return products


def make_background() -> Image.Image:
    """Generate a random 640×640 background: solid, gradient, or noise."""
    mode = random.choices(
        ["solid", "gradient", "noise"],
        weights=[0.5, 0.3, 0.2],
    )[0]

    if mode == "solid":
        h = random.random()
        s = random.uniform(0.0, 0.35)
        v = random.uniform(0.35, 0.92)
        r, g, b = colorsys.hsv_to_rgb(h, s, v)
        return Image.new("RGB", (IMG_SIZE, IMG_SIZE), (int(r * 255), int(g * 255), int(b * 255)))

    if mode == "gradient":
        h1, h2 = random.random(), random.random()
        c1 = colorsys.hsv_to_rgb(h1, random.uniform(0, 0.3), random.uniform(0.4, 0.9))
        c2 = colorsys.hsv_to_rgb(h2, random.uniform(0, 0.3), random.uniform(0.4, 0.9))
        arr = np.zeros((IMG_SIZE, IMG_SIZE, 3), dtype=np.uint8)
        for x in range(IMG_SIZE):
            t = x / (IMG_SIZE - 1)
            arr[:, x] = [int((c1[i] * (1 - t) + c2[i] * t) * 255) for i in range(3)]
        return Image.fromarray(arr, "RGB")

    # noise: upscaled random pixels for a soft mottled look
    small = np.random.randint(60, 210, (10, 10, 3), dtype=np.uint8)
    return Image.fromarray(small, "RGB").resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)


def augment_product(img: Image.Image) -> Image.Image:
    """Random rotation, flip, color jitter, and blur on an RGBA PNG."""
    img = img.rotate(random.uniform(-30, 30), expand=True, resample=Image.BICUBIC)

    if random.random() < 0.5:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)

    r, g, b, a = img.split()
    rgb = Image.merge("RGB", (r, g, b))
    rgb = ImageEnhance.Brightness(rgb).enhance(random.uniform(0.55, 1.45))
    rgb = ImageEnhance.Contrast(rgb).enhance(random.uniform(0.65, 1.35))
    rgb = ImageEnhance.Color(rgb).enhance(random.uniform(0.60, 1.40))

    if random.random() < 0.25:
        rgb = rgb.filter(ImageFilter.GaussianBlur(radius=random.uniform(0.5, 2.0)))

    r2, g2, b2 = rgb.split()
    return Image.merge("RGBA", (r2, g2, b2, a))


def box_iou(b1: list[int], b2: list[int]) -> float:
    """IoU between two [x1, y1, x2, y2] pixel boxes."""
    ix1, iy1 = max(b1[0], b2[0]), max(b1[1], b2[1])
    ix2, iy2 = min(b1[2], b2[2]), min(b1[3], b2[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
    a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0 else 0.0


def generate_scene(
    products: list[tuple[int, Image.Image]],
) -> tuple[Image.Image, list[tuple[int, float, float, float, float]]]:
    """
    Returns (640×640 RGB scene, annotations).
    annotations: list of (class_id, x_center, y_center, width, height)
    with all values normalized to [0, 1].
    """
    bg = make_background()
    placed_boxes: list[list[int]] = []
    annotations: list[tuple[int, float, float, float, float]] = []

    n = random.randint(MIN_PRODUCTS, MAX_PRODUCTS)
    # Allow repeated classes (a customer might buy 3 of the same product)
    indices = [random.randint(0, len(products) - 1) for _ in range(n)]

    for idx in indices:
        class_id, src = products[idx]
        aug = augment_product(src.copy())

        scale = random.uniform(MIN_SCALE, MAX_SCALE)
        target_w = max(1, int(IMG_SIZE * scale))
        aspect = aug.width / max(aug.height, 1)
        target_h = max(1, int(target_w / aspect))
        aug = aug.resize((target_w, target_h), Image.LANCZOS)

        for _ in range(MAX_PLACE_ATTEMPTS):
            x = random.randint(0, max(0, IMG_SIZE - target_w))
            y = random.randint(0, max(0, IMG_SIZE - target_h))
            box = [x, y, x + target_w, y + target_h]
            if all(box_iou(box, pb) < MAX_IOU for pb in placed_boxes):
                bg.paste(aug, (x, y), aug)
                placed_boxes.append(box)
                xc = (x + target_w / 2) / IMG_SIZE
                yc = (y + target_h / 2) / IMG_SIZE
                w = target_w / IMG_SIZE
                h = target_h / IMG_SIZE
                annotations.append((class_id, xc, yc, w, h))
                break
        # Products that couldn't be placed without overlap are skipped

    return bg.convert("RGB"), annotations


def write_data_yaml(output_dir: Path) -> None:
    names = [f.replace("_", " ") for f in CLASS_FILES]
    yaml = (
        f"path: {output_dir.resolve()}\n"
        f"train: train/images\n"
        f"val: val/images\n\n"
        f"nc: {len(CLASS_FILES)}\n"
        f"names: {json.dumps(names)}\n"
    )
    (output_dir / "data.yaml").write_text(yaml)


def generate_split(
    products: list[tuple[int, Image.Image]],
    output_dir: Path,
    n_scenes: int,
    split: str,
) -> None:
    img_dir = output_dir / split / "images"
    lbl_dir = output_dir / split / "labels"
    img_dir.mkdir(parents=True, exist_ok=True)
    lbl_dir.mkdir(parents=True, exist_ok=True)

    for i in range(n_scenes):
        scene, annotations = generate_scene(products)
        name = f"scene_{i:06d}"
        scene.save(img_dir / f"{name}.jpg", quality=92)
        with open(lbl_dir / f"{name}.txt", "w") as f:
            for cid, xc, yc, w, h in annotations:
                f.write(f"{cid} {xc:.6f} {yc:.6f} {w:.6f} {h:.6f}\n")
        if (i + 1) % 500 == 0:
            print(f"  [{split}] {i + 1}/{n_scenes}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--assets", required=True)
    parser.add_argument("--output", default="dataset")
    parser.add_argument("--train", type=int, default=4000)
    parser.add_argument("--val", type=int, default=800)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    assets_dir = Path(args.assets)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    products = load_products(assets_dir)
    if not products:
        print("ERROR: no product images found", file=sys.stderr)
        sys.exit(1)

    print(f"Generating {args.train} training scenes…")
    generate_split(products, output_dir, args.train, "train")

    print(f"Generating {args.val} validation scenes…")
    generate_split(products, output_dir, args.val, "val")

    write_data_yaml(output_dir)

    print(f"\nDone. Dataset at {output_dir}/")
    print(f"  train: {args.train} scenes")
    print(f"  val:   {args.val} scenes")
    print(f"  classes: {len(CLASS_FILES)}")


if __name__ == "__main__":
    main()
