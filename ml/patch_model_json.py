"""
Run after every Colab export, before copying tfjs_model/ into public/ml-model/.

Usage:
    python3 ml/patch_model_json.py

See docs/scan-to-cart/tfjs-keras3-compatibility.md for full explanation
of why each fix is needed.
"""
import json
import re
import sys
from pathlib import Path

MODEL_JSON = Path(__file__).parent.parent / 'public' / 'ml-model' / 'model.json'


def fix_nested_io(cfg: dict) -> int:
    """Wrap flat input_layers / output_layers in an extra list (Fix 1 & 2)."""
    fixed = 0
    for key in ('input_layers', 'output_layers'):
        if key in cfg and isinstance(cfg[key][0], str):
            cfg[key] = [cfg[key]]
            fixed += 1
    return fixed


def patch(model_json_path: Path) -> None:
    with open(model_json_path) as f:
        m = json.load(f)

    outer = m['modelTopology']['model_config']['config']
    total = 0

    # Fix 1: outer model input_layers / output_layers
    total += fix_nested_io(outer)

    # Fix 2: inner Functional sub-model(s) input_layers / output_layers
    functional_names = set()
    for layer in outer['layers']:
        if layer['class_name'] == 'Functional':
            functional_names.add(layer['name'])
            total += fix_nested_io(layer['config'])

    # Fix 3: nodeIndex off-by-one for nested Functional references
    for layer in outer['layers']:
        for node_group in layer.get('inbound_nodes', []):
            for ref in node_group:
                if ref[0] in functional_names:
                    ref[1] += 1
                    total += 1
                    print(f'  Fix 3: {layer["name"]}.inbound_nodes → {ref[0]} nodeIndex now {ref[1]}')

    # Fix 4: DepthwiseConv2D kernel → depthwise_kernel in weightsManifest
    for group in m['weightsManifest']:
        for w in group['weights']:
            if re.search(r'_depthwise/kernel$', w['name']):
                old = w['name']
                w['name'] = re.sub(r'/kernel$', '/depthwise_kernel', w['name'])
                print(f'  Fix 4: {old} → {w["name"]}')
                total += 1

    with open(model_json_path, 'w') as f:
        json.dump(m, f, separators=(',', ':'))

    print(f'Done — {total} fix(es) applied to {model_json_path}')


if __name__ == '__main__':
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else MODEL_JSON
    if not path.exists():
        print(f'Error: {path} not found', file=sys.stderr)
        sys.exit(1)
    patch(path)
