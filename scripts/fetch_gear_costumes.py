"""装備ごとに、抽出（分解）で得られる外形と入手先の大分類を公式サイトの API から集める。

1. 台湾版のアイテム辞書（グローバル版には一覧がない）で、武器・防具・アクセサリーの ID と英語名を集める
2. グローバル版のアイテム API（lang=en）で各装備の costumes（外形）と sources（入手先の大分類）を取る

取得した JSON は cache/gear/ に 1 件ずつ保存し、再実行時は取り直さない。
出力: cache/gear_costumes.json（build_skins.py が使う）
"""

import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache" / "gear"
OUT = ROOT / "cache" / "gear_costumes.json"
UA = "aion2-pet-tracker data builder (personal, non-commercial)"
DICT = "https://tw.ncsoft.com/aion2_tw/v2.0/dict/search/item"
ITEM = "https://aion2.plaync.com/api/gameconst/item"
CATEGORIES = ["Equip_Weapon", "Equip_Armor", "Equip_Accessory"]
INTERVAL = 0.7

_last = 0.0


def get_json(url: str, cache: Path):
    global _last
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    wait = INTERVAL - (time.time() - _last)
    if wait > 0:
        time.sleep(wait)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as res:
                body = res.read().decode("utf-8")
            break
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f"  retry {url}: {e}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))
    _last = time.time()
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(body, encoding="utf-8")
    return json.loads(body)


def list_gear():
    items = {}
    for cat in CATEGORIES:
        page = 1
        while True:
            d = get_json(f"{DICT}?page={page}&size=200&locale=en-US&category1={cat}", CACHE / "list" / f"{cat}-{page}.json")
            for c in d["contents"]:
                items[c["id"]] = {"id": c["id"], "category": cat, "categoryName": c.get("categoryName"), "nameEn": c["name"], "grade": c.get("grade")}
            print(f"list {cat} page {page}/{d['pagination']['lastPage']}", flush=True)
            if page >= d["pagination"]["lastPage"]:
                break
            page += 1
    return list(items.values())


def main():
    gear = list_gear()
    print(f"gear: {len(gear)}")
    out = []
    for i, g in enumerate(gear, 1):
        d = get_json(f"{ITEM}?id={g['id']}&enchantLevel=0&lang=en&region=as", CACHE / "item" / f"{g['id']}.json")
        if i % 100 == 0:
            print(f"[{i}/{len(gear)}]", flush=True)
        if d.get("id") != g["id"]:
            continue  # グローバル版にない
        out.append({
            **g,
            "nameEn": d.get("name") or g["nameEn"],
            "level": d.get("level"),
            "equipLevel": d.get("equipLevel"),
            "race": d.get("raceName"),
            "costumes": d.get("costumes") or [],
            "sources": d.get("sources") or [],
        })
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {OUT}: {len(out)} items in global, {sum(1 for x in out if x['costumes'])} with costumes")


if __name__ == "__main__":
    main()
