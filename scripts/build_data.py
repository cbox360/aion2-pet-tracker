"""MetaBot.GG の AION 2 ページからペット（マウント）収集用データを作る。

出力: site/data/pets.json

データ出典: MetaBot.GG (https://metabot.gg/en/aion-2) — 利用規約により出典リンク必須。
取得した HTML は cache/ に保存し、再実行時は再取得しない（--refresh で再取得）。
"""

import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache"
OUT = ROOT / "site" / "data" / "pets.json"

BASE = "https://metabot.gg"
LOCALE = "ja_JP"
UA = "aion2-pet-tracker data builder (personal, non-commercial; contact via github)"
REQUEST_INTERVAL = 1.2  # 秒。MetaBot へのアクセス間隔
REFRESH = "--refresh" in sys.argv

_last_request = 0.0


def fetch(url: str, cache_name: str) -> str:
    global _last_request
    path = CACHE / cache_name
    if path.exists() and not REFRESH:
        return path.read_text(encoding="utf-8")
    wait = REQUEST_INTERVAL - (time.time() - _last_request)
    if wait > 0:
        time.sleep(wait)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                body = res.read().decode("utf-8")
            break
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f"  retry {url}: {e}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    _last_request = time.time()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return body


def h1_name(page: str) -> str:
    h1 = re.search(r"<h1[^>]*>(.*?)</h1>", page, re.S).group(1)
    return text(re.sub(r"<span[^>]*subtitle.*?</span>", "", h1, flags=re.S))


def text(fragment: str) -> str:
    s = re.sub(r"<[^>]+>", " ", fragment)
    return re.sub(r"\s+", " ", html.unescape(s)).strip()


def main_html(page: str) -> str:
    m = re.search(r"<main.*?</main>", page, re.S)
    return m.group(0) if m else page


def tables(page: str):
    """<table> ごとに (直前の見出しテキスト, 行リスト) を返す。各行は (セル html のリスト)。"""
    out = []
    for m in re.finditer(r"<table.*?</table>", page, re.S):
        before = page[max(0, m.start() - 3000) : m.start()]
        heads = re.findall(r"<h[23][^>]*>(.*?)</h[23]>", before, re.S)
        caption = re.search(r"<caption[^>]*>(.*?)</caption>", m.group(0), re.S)
        title = text(caption.group(1)) if caption else (text(heads[-1]) if heads else "")
        rows = []
        for tr in re.findall(r"<tbody.*?</tbody>", m.group(0), re.S):
            for row in re.findall(r"<tr.*?</tr>", tr, re.S):
                rows.append(re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S))
        out.append((title, rows))
    return out


def slug_of(cell: str, kind: str):
    m = re.search(rf'href="/{LOCALE}/aion-2/{kind}/([^"?#]+)"', cell)
    return m.group(1) if m else None


def pct(s: str):
    m = re.search(r"([\d.]+)\s*%", s)
    return float(m.group(1)) if m else None


def num(s: str):
    m = re.search(r"[\d,]+", s)
    return int(m.group(0).replace(",", "")) if m else None


# ---------------------------------------------------------------- mounts


def mount_slugs():
    xml = fetch(f"{BASE}/sitemaps/aion-2-en.xml", "sitemap-aion-2-en.xml")
    slugs = re.findall(r"<loc>https://metabot\.gg/en/aion-2/mounts/([^<]+)</loc>", xml)
    return sorted(set(slugs))


TYPE_NAMES = {"野性": "fera", "自然": "natura", "変形": "varian", "知性": "cogni", "特殊": "special"}


def parse_mount(slug: str):
    page = main_html(fetch(f"{BASE}/{LOCALE}/aion-2/mounts/{slug}", f"mounts/{slug}.html"))
    name = h1_name(page)
    type_ja = None
    m = re.search(r"クリーチャータイプ</dt>\s*<dd[^>]*>(.*?)</dd>", page, re.S)
    if m:
        type_ja = text(m.group(1))
    souls = None
    m = re.search(r"必要ソウル</dt>\s*<dd[^>]*>(.*?)</dd>", page, re.S)
    if m:
        souls = num(text(m.group(1)))
    image = None
    m = re.search(r'(/web/aion2/creatures/[^"&?]+\.webp)', page)
    if m:
        image = m.group(1)

    drops = []
    for title, rows in tables(page):
        if not title.startswith("魂のドロップ"):
            continue
        for cells in rows:
            mslug = slug_of(cells[0], "monsters")
            if not mslug:
                continue
            drops.append(
                {
                    "monster": mslug,
                    "chance": pct(text(cells[2])) if len(cells) > 2 else None,
                }
            )
        break

    # 入手方法の概要（クエスト / ボックス 等の件数）
    other = {}
    for key, n in re.findall(r'id="where-tab-([a-z]+)".*?tabCount">(\d+)<', page):
        other[key] = int(n)

    return {
        "slug": slug,
        "name": name,
        "typeJa": type_ja,
        "type": TYPE_NAMES.get(type_ja, type_ja),
        "souls": souls or 5,
        "image": image,
        "drops": drops,
        "sources": other,
    }


# -------------------------------------------------------------- monsters


STYLE_NUM = r"(-?[\d.]+)%"


def parse_spawn_figures(page: str):
    """湧き地点の図から (world, nx, ny) を求める。nx, ny は MetaBot のタイル z0 全体を 0..1 とした座標。"""
    maps = []
    for fig in re.findall(r'<figure[^>]*spawnMap.*?</figure>', page, re.S):
        tiles = []
        for st in re.findall(r'class="[^"]*spawnTile[^"]*" style="([^"]+)"', fig):
            st = html.unescape(st)
            l = re.search(r"left:" + STYLE_NUM, st)
            t = re.search(r"top:" + STYLE_NUM, st)
            w = re.search(r"width:calc\(" + STYLE_NUM, st)
            h = re.search(r"height:calc\(" + STYLE_NUM, st)
            u = re.search(r"worldmap/([a-z0-9_]+)/(\d+)/(\d+)/(\d+)\.webp", st)
            if not (l and t and w and h and u):
                continue
            tiles.append(
                {
                    "l": float(l.group(1)),
                    "t": float(t.group(1)),
                    "w": float(w.group(1)),
                    "h": float(h.group(1)),
                    "world": u.group(1),
                    "z": int(u.group(2)),
                    "x": int(u.group(3)),
                    "y": int(u.group(4)),
                }
            )
        if not tiles:
            continue
        t0 = tiles[0]
        scale = 2 ** t0["z"]
        points = []
        for st in re.findall(r'class="[^"]*spawnDot[^"]*"[^>]*style="([^"]+)"', fig):
            l = re.search(r"left:" + STYLE_NUM, st)
            t = re.search(r"top:" + STYLE_NUM, st)
            if not (l and t):
                continue
            tx = t0["x"] + (float(l.group(1)) - t0["l"]) / t0["w"]
            ty = t0["y"] + (float(t.group(1)) - t0["t"]) / t0["h"]
            points.append([round(tx / scale, 5), round(ty / scale, 5)])
        label = re.search(r'aria-label="([^"]*)"', fig)
        maps.append({"world": t0["world"], "label": html.unescape(label.group(1)) if label else "", "points": points})
    return maps


def parse_monster(slug: str):
    page = main_html(fetch(f"{BASE}/{LOCALE}/aion-2/monsters/{slug}", f"monsters/{slug}.html"))
    name = h1_name(page)

    def dd(label):
        m = re.search(rf">{label}</dt>\s*<dd[^>]*>(.*?)</dd>", page, re.S)
        return text(m.group(1)) if m else None

    zones = []
    mounts = []
    for title, rows in tables(page):
        if not rows:
            continue
        if title.startswith("マウントソウル"):
            for cells in rows:
                ms = slug_of(cells[0], "mounts")
                if ms and all(x["mount"] != ms for x in mounts):
                    mounts.append({"mount": ms, "chance": pct(text(cells[1])) if len(cells) > 1 else None})
        elif any(slug_of(c[0], "zones") for c in rows if c) and not zones:
            for cells in rows:
                zs = slug_of(cells[0], "zones")
                if zs and len(cells) >= 3:
                    zones.append({"zone": zs, "name": text(cells[0]), "map": text(cells[1]), "spawns": num(text(cells[2]))})

    return {
        "slug": slug,
        "name": name,
        "level": num(dd("レベル") or ""),
        "rank": dd("順位"),
        "behavior": dd("行動"),
        "spawnCount": num(dd("スポーン地点") or ""),
        "zones": zones,
        "spawnMaps": parse_spawn_figures(page),
        "mountSouls": mounts,
    }


# ------------------------------------------------------------------ main


def main():
    slugs = mount_slugs()
    print(f"mounts: {len(slugs)}")
    pets = []
    for i, s in enumerate(slugs, 1):
        print(f"[{i}/{len(slugs)}] mount {s}", flush=True)
        pets.append(parse_mount(s))

    monster_slugs = sorted({d["monster"] for p in pets for d in p["drops"]})
    print(f"monsters: {len(monster_slugs)}")
    monsters = {}
    for i, s in enumerate(monster_slugs, 1):
        print(f"[{i}/{len(monster_slugs)}] monster {s}", flush=True)
        try:
            monsters[s] = parse_monster(s)
        except Exception as e:  # noqa: BLE001
            print(f"  FAILED {s}: {e}", file=sys.stderr)

    data = {
        "source": "MetaBot.GG",
        "sourceUrl": "https://metabot.gg/en/aion-2",
        "builtAt": time.strftime("%Y-%m-%d"),
        "pets": pets,
        "monsters": monsters,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test":
        print(json.dumps(parse_mount(sys.argv[2]), ensure_ascii=False, indent=1))
        for d in parse_mount(sys.argv[2])["drops"]:
            m = parse_monster(d["monster"])
            m["spawnMaps"] = [{**f, "points": f["points"][:3], "n": len(f["points"])} for f in m["spawnMaps"]]
            print(json.dumps(m, ensure_ascii=False, indent=1))
    else:
        main()
