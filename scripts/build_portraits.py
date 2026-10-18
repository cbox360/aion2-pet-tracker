"""ショップ確認タブの画像照合に使うペットのポートレートを作る。

元画像: MetaBot.GG の各ペットページの画像（pets.json の image）。cache/portraits に保存し、
64px の webp にして site/portraits/<slug>.webp に出力する。
"""

import json
import time
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / "cache" / "portraits"
OUT = ROOT / "site" / "portraits"
SIZE = 64


def main():
    data = json.loads((ROOT / "site" / "data" / "pets.json").read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    for p in data["pets"]:
        src = CACHE / f"{p['slug']}.webp"
        if not src.exists():
            if not p.get("image"):
                print(f"no image: {p['slug']}")
                continue
            req = urllib.request.Request("https://metabot.gg" + p["image"], headers={"User-Agent": "aion2-pet-tracker data builder"})
            with urllib.request.urlopen(req, timeout=30) as res:
                src.write_bytes(res.read())
            time.sleep(1.2)
        Image.open(src).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS).save(OUT / f"{p['slug']}.webp", "WEBP", quality=85)
    print(f"wrote {len(list(OUT.glob('*.webp')))} portraits")


if __name__ == "__main__":
    main()
