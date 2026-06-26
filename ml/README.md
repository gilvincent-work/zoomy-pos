# Zoomy POS — ML Training Pipeline

Trains a 24-class MobileNetV3Small product image classifier for the scan-to-cart feature.
Run `train.ipynb` in Google Colab (free T4 GPU tier, ~30 min total).

## Prerequisites

1. Clone the repo and upload the `ml/` folder to your Google Drive, **or** open the notebook via Colab's GitHub integration.
2. Upload the `Complete Product Images - Transparent/` folder to your Drive alongside `train.ipynb`. The notebook expects it at `ASSETS_DIR` (set in Cell 2).
3. After training, download `tfjs_model/` from Colab and copy its contents into `public/ml-model/` in the repo root.

## Output files

After a successful run, `public/ml-model/` should contain:
- `model.json` — model topology + weight manifest
- `group1-shard1of1.bin` (or multiple shards) — quantized float16 weights
- `labels.json` — class index → {productName, variantName, displayName}

## Re-training

Add new product images to the `Complete Product Images - Transparent/` folder, update the `CLASSES` list in Cell 2, and re-run the notebook. Also update `utils/scan-to-cart/labels.ts` in the app to match the new class ordering.
