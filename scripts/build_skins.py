"""外形（スキン）をシリーズごとにまとめる。

材料:
- cache/gear/item/*.json … fetch_gear_costumes.py が公式 API から取った装備ごとの costumes（抽出で得られる外形）と sources
- MetaBot.GG の外形シリーズのページ（防具セット・武器外形）… シリーズの日本語名、パーツ、解放アイテム、セットの入手先
- MetaBot.GG の装備ページ … 装備の日本語名と入手場所（ダンジョン名・ドロップ率など）
- MetaBot.GG の外形アイテムのページ … シリーズページがない外形（アクセサリーなど）の日本語名

公式 API の外形名は英語の「シリーズ名 (部位)」。MetaBot の解放アイテムのページ名が
「<シリーズ名>-skin-<部位>-bound」なので、これで両者を結び付ける。

出力: site/data/skins.json
使い方: python scripts/build_skins.py（MetaBot のページは cache/ に保存し、再実行時は取り直さない）
"""

import glob
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_data as b  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "site" / "data" / "skins.json"
SITEMAP = ROOT / "cache" / "sitemap-aion-2-en.xml"

SOURCE_JA = {
    "Crafting": "製作",
    "Trade Shop": "交換商店",
    "Reward Chest": "報酬箱",
    "Sanctuary": "聖域",
    "Looted from monsters": "モンスタードロップ",
    "Quest": "クエスト",
    "Expedition": "遠征",
    "Shugo Festival": "シュゴフェスタ",
}
# 公式 API の部位名（英語）→ MetaBot の解放アイテム名の部位
PART_SLUG = {"Fist": "gauntlet", "Guard": "guarder", "Staff": "staff"}
PART_ORDER = [
    "helm", "pauldrons", "breastplate", "gloves", "greaves", "boots", "cloak",
    "longsword", "greatsword", "dagger", "bow", "mace", "staff", "orb", "spellbook", "gauntlet", "guarder",
    "earrings", "necklace",
]
KIND_OF_PART = {p: "armor" for p in PART_ORDER[:7]} | {p: "weapon" for p in PART_ORDER[7:17]} | {"earrings": "accessory", "necklace": "accessory"}
# MetaBot にない（新しい）外形の部位名
PART_JA = {
    "helm": "ヘルム", "pauldrons": "ショルダー", "breastplate": "トップス", "gloves": "グローブ", "greaves": "ボトムス",
    "boots": "シューズ", "cloak": "マント", "longsword": "ロングソード", "greatsword": "グレートソード", "dagger": "ダガー",
    "bow": "ボウ", "mace": "メイス", "staff": "ワンド", "orb": "オーブ", "spellbook": "スペルブック", "gauntlet": "ガントレット",
    "guarder": "ガード", "earrings": "イヤリング", "necklace": "ネックレス",
}


def slug(s: str) -> str:
    s = s.lower().replace("'", "").replace("’", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def clean(name: str) -> str:
    return name.replace("◆", "").strip()


def first_paragraph(section_html: str) -> str:
    p = re.search(r"<p[^>]*>(.*?)</p>", section_html, re.S)
    return b.text(p.group(1)) if p else ""


def series_pages():
    """MetaBot の外形シリーズのページから、シリーズとパーツ（解放アイテムのページ名つき）を読む"""
    series = {}
    for f in sorted(glob.glob(str(ROOT / "cache" / "skins" / "*" / "*.html"))):
        kind = os.path.basename(os.path.dirname(f))
        key = os.path.basename(f)[:-5]
        page = b.main_html(Path(f).read_text(encoding="utf-8"))
        grade = re.search(r">等級</dt>\s*<dd[^>]*>(.*?)</dd>", page, re.S)
        parts = []
        for _, rows in b.tables(page):
            for r in rows:
                item = re.search(r'href="/ja_JP/aion-2/items/([^"]+)"', "".join(r))
                if item and len(r) >= 3:
                    cells = [clean(b.text(c)) for c in r]
                    parts.append({"slot": cells[0], "name": next(c for c in cells[1:] if c), "item": item.group(1)})
            if parts:
                break
        name = b.h1_name(page)
        if kind == "weapons" and parts:  # 武器外形のページは見出しが英語なので、パーツ名から日本語名を取る
            name = re.sub(r"[(（].*$", "", parts[0]["name"]).strip()
        where = re.search(r'<section id="where".*?</section>', page, re.S)
        how = re.search(r'<section id="how-to-get".*?</section>', page, re.S)
        other = ""
        if how:
            m = re.search(r"その他の入手方法:(.*)", b.text(how.group(0)))
            other = m.group(1).strip() if m else ""
        series[f"{kind}/{key}"] = {
            "key": f"{kind}/{key}",
            "kind": "armor" if kind == "sets" else "weapon",
            "name": name,
            "grade": b.text(grade.group(1)) if grade else "",
            "url": f"{b.BASE}/{b.LOCALE}/aion-2/skins/{kind}/{key}",
            "where": first_paragraph(where.group(0)) if where else "",
            "otherSources": other,
            "parts": parts,
        }
    return series


def gear_page(slug_: str):
    """装備の日本語名と入手場所の要約（MetaBot）"""
    page = b.main_html(b.fetch(f"{b.BASE}/{b.LOCALE}/aion-2/items/{slug_}", f"items/{slug_}.html"))
    where = re.search(r'<section id="where".*?</section>', page, re.S)
    return {"name": b.h1_name(page), "where": first_paragraph(where.group(0)) if where else ""}


def skin_item_name(slug_: str) -> str:
    """外形アイテム「X(外形：Y)(刻印)」から X を取る"""
    page = b.main_html(b.fetch(f"{b.BASE}/{b.LOCALE}/aion-2/items/{slug_}", f"items/{slug_}.html"))
    return re.sub(r"[(（]外形.*$", "", b.h1_name(page)).strip()


def main():
    items_on_metabot = set(re.findall(r"/en/aion-2/items/([^<]+)</loc>", SITEMAP.read_text(encoding="utf-8")))
    series = series_pages()
    part_by_item = {p["item"]: (s, p) for s in series.values() for p in s["parts"]}

    gear = []
    for f in glob.glob(str(ROOT / "cache" / "gear" / "item" / "*.json")):
        d = json.loads(Path(f).read_text(encoding="utf-8"))
        if d.get("id") and d.get("costumes"):
            gear.append(d)
    print(f"gear with costumes: {len(gear)}")

    unresolved = set()
    gear_slugs = {}
    for g in gear:
        gs = slug(g["name"])
        gear_slugs[g["id"]] = gs if gs in items_on_metabot else None
        for c in g["costumes"]:
            m = re.match(r"(.+?) \((.+)\)$", c)
            if not m:
                unresolved.add(c)
                continue
            series_en, part_en = m.groups()
            part = PART_SLUG.get(part_en, slug(part_en))
            item = f"{slug(series_en)}-skin-{part}-bound"
            existing = series.get(f"weapons/{slug(series_en)}") or series.get(f"sets/{slug(series_en)}")
            if item not in part_by_item and existing:
                # 日本語のシリーズはあるが、その部位（ガントレットなど）だけ MetaBot に載っていない: 既存のシリーズに足す
                p = {"slot": PART_JA.get(part, part_en), "name": f"{existing['name']}({PART_JA.get(part, part_en)})", "item": item}
                existing["parts"].append(p)
                part_by_item[item] = (existing, p)
            if item not in part_by_item:
                on_metabot = item in items_on_metabot
                if not on_metabot:
                    unresolved.add(c)
                # シリーズページのない外形（アクセサリーや、MetaBot にない新しい外形）: シリーズを作って足す
                key = f"other/{slug(series_en)}"
                s = series.setdefault(key, {
                    "key": key, "kind": KIND_OF_PART.get(part, "other"), "name": None if on_metabot else series_en,
                    "nameEn": series_en, "grade": "", "url": f"{b.BASE}/{b.LOCALE}/aion-2/items/{item}" if on_metabot else None,
                    "where": "", "otherSources": "", "parts": [], "english": not on_metabot,
                })
                if not any(p["item"] == item for p in s["parts"]):
                    s["parts"].append({"slot": part, "name": None if on_metabot else f"{series_en}（{PART_JA.get(part, part_en)}）", "item": item})
                part_by_item[item] = (s, next(p for p in s["parts"] if p["item"] == item))
            s, p = part_by_item[item]
            p.setdefault("gear", []).append(g["id"])

    # 日本語名などを MetaBot から補う（必要なページだけ取る）
    gear_info = {}
    needed = sorted({gs for gs in gear_slugs.values() if gs})
    print(f"gear pages: {len(needed)}")
    for i, gs in enumerate(needed, 1):
        gear_info[gs] = gear_page(gs)
        if i % 100 == 0:
            print(f"  gear pages {i}/{len(needed)}", flush=True)
    for s in series.values():
        for p in s["parts"]:
            if p["name"] is None:
                p["name"] = skin_item_name(p["item"])
                s.setdefault("parts_named", True)
        if s.get("name") is None:
            s["name"] = re.sub(r"[(（].*$", "", s["parts"][0]["name"]).strip()
    print(f"unresolved costumes: {len(unresolved)} {sorted(unresolved)[:10]}")

    by_id = {g["id"]: g for g in gear}
    out_series = []
    for s in series.values():
        parts = []
        for p in sorted(s["parts"], key=lambda p: PART_ORDER.index(p["item"].split("-skin-")[1].rsplit("-bound", 1)[0]) if p["item"].split("-skin-")[1].rsplit("-bound", 1)[0] in PART_ORDER else 99):
            sources = {}
            for gid in p.get("gear", []):
                g = by_id[gid]
                gs = gear_slugs.get(gid)
                info = gear_info.get(gs) if gs else None
                name = info["name"] if info else g["name"]
                e = sources.setdefault(name, {
                    "name": name,
                    "nameEn": g["name"] if not info else None,
                    "grade": g.get("grade"),
                    "level": g.get("equipLevel"),
                    "via": sorted({SOURCE_JA.get(x, x) for x in (g.get("sources") or [])}),
                    "where": info["where"] if info else "",
                    "url": f"{b.BASE}/{b.LOCALE}/aion-2/items/{gs}" if gs else None,
                    "icon": g.get("icon"),
                })
                e["via"] = sorted(set(e["via"]) | {SOURCE_JA.get(x, x) for x in (g.get("sources") or [])})
            parts.append({"slot": p["slot"], "name": p["name"], "item": p["item"], "gear": sorted(sources.values(), key=lambda x: (x["level"] or 0, x["name"]))})
        out_series.append({k: s[k] for k in ("key", "kind", "name", "grade", "url", "where", "otherSources")} | {"english": s.get("english", False), "parts": parts})
    out_series.sort(key=lambda s: (["armor", "weapon", "accessory", "other"].index(s["kind"]), s["name"]))
    OUT.write_text(json.dumps({"source": "MetaBot.GG / AION 2 公式サイト", "builtAt": __import__("time").strftime("%Y-%m-%d"), "series": out_series}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    with_gear = sum(1 for s in out_series for p in s["parts"] if p["gear"])
    total = sum(len(s["parts"]) for s in out_series)
    gear_total = sum(len(p["gear"]) for s in out_series for p in s["parts"])
    gear_en = sum(1 for s in out_series for p in s["parts"] for g in p["gear"] if g["nameEn"])
    print(f"wrote {OUT}: series {len(out_series)} (english {sum(s['english'] for s in out_series)}), parts {total}, parts with gear {with_gear}")
    print(f"gear entries {gear_total}, without Japanese name {gear_en}")


if __name__ == "__main__":
    main()
