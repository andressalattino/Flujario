"""Conversión mecánica a WebP; la eliminación del fondo se realiza con Imagegen."""
from pathlib import Path
import sys
from PIL import Image

source, target = map(Path, sys.argv[1:3])
avatar = Image.open(source).convert("RGBA")
assert avatar.getchannel("A").getextrema() == (0, 255), "El avatar debe tener transparencia real."
avatar.thumbnail((384, 384), Image.Resampling.LANCZOS)
target.parent.mkdir(parents=True, exist_ok=True)
avatar.save(target, format="WEBP", lossless=True, method=6)
print(f"Avatar WebP: {avatar.size}, {target.stat().st_size} bytes, alpha preservado.")
