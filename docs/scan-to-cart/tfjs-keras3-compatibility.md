# TF.js + Keras 3 LayersModel Compatibility Fixes

## Background

The scan-to-cart feature loads a MobileNetV3Small classifier trained in Keras 3 (Python) and exported to TF.js LayersModel format. When the Vercel deployment was first tested, the scan modal hung indefinitely on "Loading model…". This document records every bug found, why it happened, and what was fixed, so any future retraining does not silently re-introduce the same problems.

---

## Architecture of the Exported Model

```
model_2 (Functional, outer)
├── input_layer_5  (InputLayer, shape [224,224,3])
├── rescaling_2    (Rescaling, scale=2.0, offset=-1.0)
├── MobileNetV3Small (Functional, inner — 174 layers)
├── global_average_pooling2d_2
├── dense_4        (Dense 256, relu)
├── dropout_2
└── dense_5        (Dense 24, softmax)
```

The outer model wraps the inner `MobileNetV3Small` Functional model as a single layer. This nested-Functional structure is the root cause of three of the four bugs below.

---

## Bug 1 — `input_layers` / `output_layers` flat array (AssertionError, empty message)

### Symptom
The model appeared to hang forever. Actual error when checked in Node.js: `AssertionError` with an **empty** `.message` string.

### Root cause
Keras 3 serializes `input_layers` and `output_layers` as flat arrays:
```json
"input_layers": ["input_layer_5", 0, 0]
```

TF.js `Container.fromConfig` expects **nested** arrays:
```json
"input_layers": [["input_layer_5", 0, 0]]
```

In `Container.fromConfig` (tf-layers.node.js ~line 22612), TF.js iterates `inputLayersFromConfig` and reads `layerData[0]` as the layer name. With the flat format, `layerData` is the string `"input_layer_5"` and `layerData[0]` is `"i"` (first character). The subsequent `assert("i" in createdLayers)` throws `new AssertionError(undefined)` whose `.message` is `""`.

### Why the UI appeared to hang (not show "Model Unavailable")
`scan.tsx` caught the error with:
```tsx
.catch((err) => { setLoadError(err.message); ... });
```
and then rendered the error UI only if:
```tsx
if (loadError) { ... }
```
An empty string is **falsy** in JavaScript, so the error screen never rendered — it stayed on the "Loading model…" spinner indefinitely.

### Fix applied
**`public/ml-model/model.json`** — wrapped `input_layers` and `output_layers` in an extra array layer for both the outer model and the inner `MobileNetV3Small` config:
```json
"input_layers": [["input_layer_5", 0, 0]],
"output_layers": [["dense_5", 0, 0]]
```

**`app/modals/scan.tsx`** — fixed the falsy guard and added a fallback message:
```tsx
.catch((err) => { setLoadError(err.message || 'Model failed to load'); ... });
// ...
if (loadError != null) { /* show "Model Unavailable" */ }
```

---

## Bug 2 — Inner Functional model `input_layers` / `output_layers` (same as Bug 1)

The `MobileNetV3Small` inner Functional model has its own `input_layers` / `output_layers` inside its `config` block. These had the same flat-array problem and needed the same nested-array fix.

```json
// inside MobileNetV3Small.config:
"input_layers": [["input_layer_4", 0, 0]],
"output_layers": [["activation_53", 0, 0]]
```

---

## Bug 3 — Nested Functional sub-model `nodeIndex` off-by-one ("Graph disconnected")

### Symptom
After fixing Bugs 1 and 2, the error became: `Graph disconnected: cannot obtain value for tensor [object Object] at layer "input_layer_4"`.

### Root cause
TF.js's `Container` constructor (tf-layers.node.js ~line 21614) **always** creates a synthetic self-referential inbound node at `inboundNodes[0]`:

```javascript
new Node({
  outboundLayer: _this,       // the Functional model itself
  inboundLayers: [],
  inputTensors: _this.inputs, // e.g. [input_layer_4_tensor]
  outputTensors: _this.outputs,
  ...
});
```

**Python Keras 3 does not create this node.** So when Python exports the model, all layers that use `MobileNetV3Small` as an inbound layer record `nodeIndex: 0` — the first real application node. But in TF.js, application node 0 is the synthetic constructor node (pointing at `input_layer_4`), and the real outer application becomes node 1.

In the exported `model.json`, `global_average_pooling2d_2.inbound_nodes` was:
```json
[[["MobileNetV3Small", 0, 0, {}]]]
```
TF.js resolved `MobileNetV3Small.inboundNodes[0]` — the synthetic node — and fed `input_layer_4`'s tensor into `global_average_pooling2d_2` instead of the rescaling output. The outer Container then found `input_layer_4_tensor` in its graph but not in `computableTensors` (which starts from `input_layer_5`), causing the "Graph disconnected" error.

### Fix applied
**`public/ml-model/model.json`** — incremented the `nodeIndex` by 1 for every `inbound_nodes` reference whose inbound layer is a Functional sub-model:
```json
// before
[[["MobileNetV3Small", 0, 0, {}]]]
// after
[[["MobileNetV3Small", 1, 0, {}]]]
```

**General rule for future models:** For any layer in an outer Functional model whose `inbound_nodes` points to a nested Functional sub-model, increment the `nodeIndex` by 1 when targeting TF.js. This applies to every `Functional`-class sub-model anywhere in the hierarchy.

---

## Bug 4 — `DepthwiseConv2D` kernel weight name mismatch ("Provided weight data has no target variable")

### Symptom
After fixing Bugs 1–3 the topology built successfully (7 layers), but weight assignment failed: `Provided weight data has no target variable: expanded_conv_depthwise/kernel`.

### Root cause
Keras 3 exports `DepthwiseConv2D` weight tensors under the name `<layerName>/kernel`. TF.js names the same tensor `<layerName>/depthwise_kernel`. All 11 depthwise convolution layers in MobileNetV3Small (`expanded_conv_depthwise` through `expanded_conv_10_depthwise`) had this mismatch.

| Source | Weight name |
|--------|-------------|
| `weightsManifest` (Keras 3 export) | `expanded_conv_depthwise/kernel` |
| TF.js model variable | `expanded_conv_depthwise/depthwise_kernel` |

### Fix applied
**`public/ml-model/model.json`** — renamed all 11 affected entries in `weightsManifest`:
```json
// before
{ "name": "expanded_conv_depthwise/kernel", ... }
// after
{ "name": "expanded_conv_depthwise/depthwise_kernel", ... }
```

**General rule for future models:** After retraining and re-exporting, rename any `<layer>/kernel` entry in `weightsManifest` where the layer name ends in `_depthwise` to `<layer>/depthwise_kernel`.

---

## Summary table

| Bug | Where | Symptom | Fix location |
|-----|-------|---------|--------------|
| 1 | Outer model `input_layers`/`output_layers` flat array | AssertionError, infinite spinner | `model.json` topology + `scan.tsx` guard |
| 2 | Inner `MobileNetV3Small` same flat array | Same as above | `model.json` inner model config |
| 3 | `global_average_pooling2d_2` nodeIndex off-by-one | "Graph disconnected" at `input_layer_4` | `model.json` outer layer `inbound_nodes` |
| 4 | DepthwiseConv2D kernel name mismatch | "No target variable: expanded_conv_depthwise/kernel" | `model.json` `weightsManifest` |

---

## Re-export checklist (after every retraining)

Run this Python script against the freshly exported `model.json` before committing it:

```python
import json, re

with open('public/ml-model/model.json') as f:
    m = json.load(f)

outer = m['modelTopology']['model_config']['config']

# Fix 1 & 2: nested input_layers / output_layers
def fix_nested(cfg):
    for key in ('input_layers', 'output_layers'):
        if key in cfg and isinstance(cfg[key][0], str):
            cfg[key] = [cfg[key]]

fix_nested(outer)
for layer in outer['layers']:
    if layer['class_name'] == 'Functional':
        fix_nested(layer['config'])

# Fix 3: increment nodeIndex for Functional sub-model references
functional_names = {l['name'] for l in outer['layers'] if l['class_name'] == 'Functional'}
for layer in outer['layers']:
    for node_group in layer.get('inbound_nodes', []):
        for ref in node_group:
            if ref[0] in functional_names:
                ref[1] += 1  # nodeIndex: Python 0 → TF.js 1

# Fix 4: DepthwiseConv2D kernel name
for group in m['weightsManifest']:
    for w in group['weights']:
        if re.search(r'_depthwise/kernel$', w['name']):
            w['name'] = re.sub(r'/kernel$', '/depthwise_kernel', w['name'])

with open('public/ml-model/model.json', 'w') as f:
    json.dump(m, f, separators=(',', ':'))

print('model.json patched.')
```

Save this as `ml/patch_model_json.py` and run it as the final step before copying `tfjs_model/` into `public/ml-model/`.
