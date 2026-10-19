"""ヒドゥンキューブの出現候補地点のデータを作る。

元データ: MetaBot.GG の Hidden Cube ページ（https://metabot.gg/ja_JP/aion-2/hidden-cubes）。
ページ内の各マップの図に候補地点が点で埋め込まれている（AION 2 グローバル版クライアントのデータ）。
表の「候補地点」はキューブごとの候補を重複込みで数えた延べ数（合計 3,722）で、重複のない地点は図の点（約 1,160）。
ゾーン名は、各ゾーンのページの図で同じ位置にある点から決める。

出力: site/data/cubes.json
使い方: python scripts/build_cubes.py（取得したページは cache/ に保存し、再実行時は再取得しない。--refresh で取り直す）
"""

import html
import json
import math
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as b  # noqa: E402  fetch・表の読み取りなどを共用する

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "cubes.json"
PAGE = f"{b.BASE}/{b.LOCALE}/aion-2/hidden-cubes"
SAME_POINT = 5 / 8192  # ゾーンのページの点と同じ地点とみなす距離（8192px 換算で 5px）
STYLE = r"(-?[\d.]+)%"


def figure_points(page: str, kind: str | None = None):
    """ページ内の地図の図から (world, x, y) を取り出す。x, y は MetaBot のタイル z0 全体を 0..1 とする座標"""
    out = []
    for fig in re.findall(r"<figure[^>]*spawnMap.*?</figure>", page, re.S):
        tile = None
        for st in re.findall(r'class="[^"]*spawnTile[^"]*" style="([^"]+)"', fig):
            st = html.unescape(st)
            m = [re.search(p, st) for p in (r"left:" + STYLE, r"top:" + STYLE, r"width:calc\(" + STYLE, r"height:calc\(" + STYLE)]
            u = re.search(r"worldmap/([a-z0-9_]+)/(\d+)/(\d+)/(\d+)\.webp", st)
            if all(m) and u:
                tile = [float(x[1]) for x in m] + [u[1], int(u[2]), int(u[3]), int(u[4])]
                break
        if not tile:
            continue
        L, T, W, H, world, z, tx, ty = tile
        for k, st in re.findall(r'class="[^"]*spawnDot[^"]*" data-kind="([^"]+)" style="([^"]+)"', fig):
            if kind and k != kind:
                continue
            left, top = re.search(r"left:" + STYLE, st), re.search(r"top:" + STYLE, st)
            out.append((world, (tx + (float(left[1]) - L) / W) / 2**z, (ty + (float(top[1]) - T) / H) / 2**z))
    return out


def main():
    page = b.main_html(b.fetch(PAGE, "hidden-cubes.html"))
    cubes = figure_points(page)
    print(f"cube points: {len(cubes)}")

    # マップごとの表: ゾーン, レベル, キューブ数, 候補地点
    zones = []
    for _, rows in b.tables(page):
        for r in rows:
            slug = b.slug_of(r[0], "zones")
            if slug and len(r) >= 4:
                zones.append({"slug": slug, "name": b.text(r[0]), "candidates": b.num(b.text(r[3]))})
    print(f"zones: {len(zones)}, candidates (with duplicates): {sum(z['candidates'] or 0 for z in zones)}")

    zone_points = []
    for i, z in enumerate(zones, 1):
        zp = b.main_html(b.fetch(f"{b.BASE}/{b.LOCALE}/aion-2/zones/{z['slug']}", f"zones/{z['slug']}.html"))
        zone_points += [(w, x, y, z["name"]) for w, x, y in figure_points(zp, "poi")]
        print(f"[{i}/{len(zones)}] {z['name']}", flush=True)

    out = {"source": "MetaBot.GG", "sourceUrl": PAGE, "builtAt": time.strftime("%Y-%m-%d"), "worlds": {}}
    unknown = 0
    for w, x, y in cubes:
        zone = next((n for zw, zx, zy, n in zone_points if zw == w and math.hypot(zx - x, zy - y) <= SAME_POINT), "")
        unknown += not zone
        out["worlds"].setdefault(w, []).append({"x": round(x, 5), "y": round(y, 5), "zone": zone})
    for w, pts in out["worlds"].items():
        print(f"{w}: {len(pts)}")
    print(f"points without zone: {unknown}")
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
