# Zoomy POS — ML Training Pipeline

Trains a 24-class YOLOv8-nano product detector for the scan-to-cart feature.
Run `train_detector.ipynb` in Google Colab (free T4 GPU tier, ~45–60 min).

## Prerequisites

1. Upload the `Complete Product Images - Transparent/` folder to your Google Drive.
2. Open `train_detector.ipynb` in Colab (File → Open → GitHub, or upload directly).
3. Edit the `ASSETS_DIR` variable in Cell 2 to point to your Drive path.

## Output files

After a successful run, `public/ml-model/` should contain:

- `model.json` — YOLOv8 TF.js GraphModel topology + weight manifest
- `*.bin` — weight shards (~6–8 MB, unquantized)
- `labels.json` — class index → display names (unchanged from classifier)

## Re-training

To add new products: add new transparent PNGs, update `CLASS_FILES` in
`generate_dataset.py`, and update `SCAN_LABELS` in
`utils/scan-to-cart/labels.ts`. Class indices must stay in sync.

## No post-export patching needed

Unlike the previous LayersModel, the YOLO TF.js GraphModel export requires
no `patch_model_json.py` modifications. See
`docs/scan-to-cart/tfjs-keras3-compatibility.md` for background on why
patching was required for the old format.

## Quality gate

The training notebook gates on mAP@0.5 ≥ 0.60. For a synthetic-only dataset
this is a reasonable floor. Real-world accuracy will improve if you supplement
with actual product photos — add them to the training dataset as standard YOLO
annotations and re-run.
