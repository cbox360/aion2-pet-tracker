"""ヒドゥンキューブの位置データを作る。

元データ: aion2-interactive-map (https://github.com/aion2-interactive-map/aion2-interactive-map)
の public/data/markers/<World>.yaml の hiddenCube マーカー（CC BY-NC 4.0）。
座標は Leaflet の CRS.Simple（元画像 タイル数 x 1024px、y は下端が 0 で上向き）なので、
y を反転して、2 の累乗の正方形を 0..1 とする座標（y は下向き）に直す。
ゾーン名は同リポジトリの地域の境界で判定し、MetaBot.GG の日本語名に置き換える。

出力: site/data/cubes.json
使い方: python scripts/build_cubes.py（PyYAML が必要: pip install pyyaml）
"""

import json
import re
import time
import urllib.request
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache" / "cubes"
OUT = ROOT / "site" / "data" / "cubes.json"
REPO = "https://raw.githubusercontent.com/aion2-interactive-map/aion2-interactive-map/master/public/data"
METABOT = "https://metabot.gg"
WORLDS = {"world_l_a": "World_L_A", "world_d_a": "World_D_A"}
SIDE_PX = 8192  # 8x8 タイル


def get(url: str, cache: Path, delay: float = 0) -> str:
    if cache.exists():
        return cache.read_text(encoding="utf-8")
    time.sleep(delay)
    req = urllib.request.Request(url, headers={"User-Agent": "aion2-pet-tracker data builder"})
    with urllib.request.urlopen(req, timeout=60) as res:
        body = res.read().decode("utf-8")
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(body, encoding="utf-8")
    return body


def inside(x: float, y: float, poly) -> bool:
    hit = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def flat(slug: str) -> str:
    return slug.replace("-", "").lower()


def zone_names():
    """MetaBot のゾーンの slug（ハイフンなし）→ 日本語名。pets.json にあるものはそれを使い、ないものは都度ページから取る"""
    names = {}
    pets = json.loads((ROOT / "site" / "data" / "pets.json").read_text(encoding="utf-8"))
    for m in pets["monsters"].values():
        for z in m["zones"]:
            names[flat(z["zone"])] = z["name"]
    sitemap = get(f"{METABOT}/sitemaps/aion-2-en.xml", ROOT / "cache" / "sitemap-aion-2-en.xml")
    slugs = {flat(s): s for s in re.findall(r"/en/aion-2/zones/([^<]+)</loc>", sitemap)}
    return names, slugs


def japanese_zone(region: str, names, slugs):
    key = region.lower()
    if key in names:
        return names[key]
    if key in slugs:
        page = get(f"{METABOT}/ja_JP/aion-2/zones/{slugs[key]}", CACHE / "zones" / f"{slugs[key]}.html", delay=1.2)
        m = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S)
        if m:
            name = re.sub(r"<span[^>]*subtitle.*?</span>|<[^>]+>|<!-- -->", "", m.group(1), flags=re.S).strip()
            names[key] = name
            return name
    print(f"  no Japanese name for {region}")
    return region


def main():
    names, slugs = zone_names()
    out = {"source": "aion2-interactive-map", "sourceUrl": "https://github.com/aion2-interactive-map/aion2-interactive-map", "worlds": {}}
    for world, repo_name in WORLDS.items():
        markers = yaml.safe_load(get(f"{REPO}/markers/{repo_name}.yaml", CACHE / f"{repo_name}.yaml"))["markers"]
        regions = yaml.safe_load(get(f"{REPO}/regions/{repo_name}.yaml", CACHE / f"regions_{repo_name}.yaml"))["regions"]
        cubes = []
        for m in markers:
            if m.get("subtype") != "hiddenCube":
                continue
            region = next((r["name"] for r in regions if any(inside(m["x"], m["y"], b) for b in r["borders"])), None)
            cubes.append({
                "x": round(m["x"] / SIDE_PX, 5),
                "y": round((SIDE_PX - m["y"]) / SIDE_PX, 5),
                "zone": japanese_zone(region, names, slugs) if region else "",
            })
        out["worlds"][world] = cubes
        print(f"{world}: {len(cubes)} cubes")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
