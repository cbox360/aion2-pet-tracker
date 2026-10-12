# AION2 ペット収集トラッカー

AION2 のペット（マウント）の魂収集状況を記録し、まだ集め終わっていないペットの魂を落とすモンスターの湧き位置と、効率のいい狩場を表示する静的サイト。

- 天族 / 魔族を切り替えられる（深淵は両方に表示）
- 記録はブラウザの localStorage にだけ保存（サーバー不要・アカウント不要）。データ管理タブから文字列で書き出し / 読み込みできる

## 構成

```
site/            公開するファイル一式（このフォルダをそのまま静的ホスティングに置く）
  index.html / style.css / app.js
  data/pets.json ペット・モンスター・湧き座標（scripts/build_data.py が生成）
  tiles/         背景地図タイル（scripts/build_tiles.py が生成）
scripts/
  build_data.py  MetaBot.GG のページからデータを作る
  build_tiles.py 背景地図タイルを作る
cache/           取得済み HTML・元画像（公開しない）
```

## データの更新

ゲームのアップデートでペットやモンスターが増えたとき:

```sh
python scripts/build_data.py --refresh   # 全ページを取り直す（1.2 秒間隔、20 分ほど）
python scripts/build_tiles.py world_l_a world_d_a abyss_reshanta_a            # interactive-map の地図から
python scripts/build_tiles.py --metabot world_l_b world_d_b abyss_reshanta_c abyss_reshanta_d  # MetaBot の全体図から
```

新しいワールドに湧き点が出たら `site/app.js` の `WORLDS` / `WORLD_PX` に追加する。

`build_tiles.py` は Pillow が必要（`pip install pillow`）。

## ローカルで確認

```sh
cd site
python -m http.server 8000
# http://localhost:8000
```

## 公開（GitHub Pages）

`.github/workflows/pages.yml` が `site/` を GitHub Pages に公開する。リポジトリの Settings → Pages → Source を「GitHub Actions」にする。

## データの出典とライセンス

- ペット・モンスター・湧き位置: [MetaBot.GG](https://metabot.gg/en/aion-2)（AION 2 グローバル版クライアントのデータ）。利用規約により、元ページへのリンク（nofollow なし）を付けて利用している。
- 地図画像: [aion2-interactive-map](https://github.com/aion2-interactive-map/aion2-interactive-map)（CC BY-NC 4.0）。そのため本サイトは非営利で運営すること。
- AION 2 は NCSOFT の商標。本サイトは非公式。
