#!/usr/bin/env bash
# Draco-compresses the GLBs exported by the Blender build scripts (about 5x smaller).
# Usage: blender/compress.sh public/assets/models/echo.glb [more.glb ...]
# Needs Node.js; uses the glTF-Transform CLI (MIT) via npx.
set -euo pipefail
for f in "$@"; do
  tmp="${f%.glb}.draco.glb"
  npx -y @gltf-transform/cli@4 draco "$f" "$tmp" --method edgebreaker \
    --quantize-position 14 --quantize-normal 10 --quantize-color 8 --quantize-texcoord 12 --quantize-generic 12
  mv "$tmp" "$f"
done
