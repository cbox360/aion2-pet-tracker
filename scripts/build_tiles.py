"""背景地図タイルを作る。

元画像: aion2-interactive-map (https://github.com/aion2-interactive-map/aion2-interactive-map)
の public/UI/Map/WorldMap/<World>/Res/<World>_<col>_<row>.webp（1024px, CC BY-NC 4.0）。

MetaBot の座標 (0..1) は「タイル数を 2 の累乗に切り上げた正方形」を全体とするので、
同じ正方形キャンバスに左上詰めで貼り、Leaflet 用の 256px タイル (z0..MAX_ZOOM) に切る。

出力: site/tiles/<world>/<z>/<x>/<y>.webp
使い方: python scripts/build_tiles.py world_d_a world_l_a ...
"""

import io
import re
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache" / "maptiles"
OUT = ROOT / "site" / "tiles"
REPO = "https://raw.githubusercontent.com/aion2-interactive-map/aion2-interactive-map/master/public"
MAX_ZOOM = 4  # 256 * 2^4 = 4096px 相当まで
TILE = 256

Image.MAX_IMAGE_PIXELS = None


def get(url: str, cache: Path) -> bytes:
    if cache.exists():
        return cache.read_bytes()
    with urllib.request.urlopen(url, timeout=60) as res:
        body = res.read()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_bytes(body)
    return body


def tile_counts():
    yaml = get(f"{REPO}/data/maps.yaml", CACHE / "maps.yaml").decode("utf-8")
    counts = {}
    for block in yaml.split("\n- ")[0:]:
        name = re.search(r"name: (\S+)", block)
        cx = re.search(r"tilesCountX: (\d+)", block)
        cy = re.search(r"tilesCountY: (\d+)", block)
        if name and cx and cy:
            counts[name.group(1)] = (int(cx.group(1)), int(cy.group(1)))
    return counts


def repo_name(world: str) -> str:
    return "_".join(p.capitalize() if len(p) > 1 else p.upper() for p in world.split("_"))


def build(world: str, counts):
    name = repo_name(world)
    if name not in counts:
        print(f"skip {world}: not in maps.yaml")
        return False
    nx, ny = counts[name]
    side = 1
    while side < max(nx, ny):
        side *= 2
    full = TILE * 2**MAX_ZOOM
    src_px = full // side  # 1 元タイルあたりの出力 px
    canvas = Image.new("RGB", (full, full), (12, 14, 20))
    for c in range(nx):
        for r in range(ny):
            fn = f"{name}_{c:02d}_{r:02d}.webp"
            try:
                data = get(f"{REPO}/UI/Map/WorldMap/{name}/Res/{fn}", CACHE / name / fn)
            except Exception as e:  # noqa: BLE001
                print(f"  missing {fn}: {e}")
                continue
            im = Image.open(io.BytesIO(data)).convert("RGB").resize((src_px, src_px), Image.LANCZOS)
            canvas.paste(im, (c * src_px, r * src_px))
    used = (nx * src_px, ny * src_px)
    for z in range(MAX_ZOOM + 1):
        size = TILE * 2**z
        level = canvas if size == full else canvas.resize((size, size), Image.LANCZOS)
        n = 2**z
        for x in range(n):
            for y in range(n):
                # 余白だけのタイルは出力しない
                if x * TILE * (full // size) >= used[0] or y * TILE * (full // size) >= used[1]:
                    continue
                path = OUT / world / str(z) / str(x) / f"{y}.webp"
                path.parent.mkdir(parents=True, exist_ok=True)
                level.crop((x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE)).save(path, "WEBP", quality=78)
    print(f"built {world} ({nx}x{ny} -> {side}x{side})")
    return True


def build_from_metabot(world: str):
    """aion2-interactive-map に地図がないワールドは MetaBot の全体図 (overview.webp) から作る。
    全体図は座標 0..1 の正方形全体を覆うので、そのまま切る。"""
    req = urllib.request.Request(
        f"https://metabot.gg/web/aion2/worldmap/{world}/overview.webp", headers={"User-Agent": "Mozilla/5.0"}
    )
    cache = CACHE / "metabot" / f"{world}.webp"
    if not cache.exists():
        cache.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(req, timeout=60) as res:
            cache.write_bytes(res.read())
    im = Image.open(cache).convert("RGB")
    max_z = max(0, (im.size[0] // TILE).bit_length() - 1)
    for z in range(max_z + 1):
        size = TILE * 2**z
        level = im.resize((size, size), Image.LANCZOS)
        for x in range(2**z):
            for y in range(2**z):
                path = OUT / world / str(z) / str(x) / f"{y}.webp"
                path.parent.mkdir(parents=True, exist_ok=True)
                level.crop((x * TILE, y * TILE, (x + 1) * TILE, (y + 1) * TILE)).save(path, "WEBP", quality=78)
    print(f"built {world} from MetaBot overview (max zoom {max_z})")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args and args[0] == "--metabot":
        for w in args[1:]:
            build_from_metabot(w)
    else:
        counts = tile_counts()
        for w in args:
            build(w, counts)
