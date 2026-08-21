# chiikawa-collection — 運用・設計ドキュメント

家族で「ご当地ちいかわ ダイカットキーホルダー」の所持状況を管理するコレクションアプリ。
このファイルは毎セッションで再調査しがちな前提知識をまとめたもの。

## 構成
- **frontend/** — Next.js 15 (App Router) + React 19 + Tailwind + AWS Amplify(Cognito認証)。Playwright e2e。
- **lambda/api/** — Java 21 Lambda（SnapStart）。API Gateway HTTP API + Cognito JWT。
- **lambda/scraper/** — Python 3.12 Lambda。元サイトを巡回し画像解析して DynamoDB に投入。EventBridge で毎日 9:00 JST 実行。
- **lambda/scanner/** — Python 3.12 Lambda。ユーザーが撮影/選択した写真からキャラ・地域・商品を認識し、
  該当する `ChiikawaMaster` アイテムを返す（`POST /scan`）。詳細は後述の「写真スキャン機能」を参照。
- **terraform/** — DynamoDB・S3・CloudFront・Cognito 等の基盤。
- **template.yaml** — SAM（Lambda / API Gateway / スケジュール）。

## AWS（重要）
- アカウント: `<AWS_ACCOUNT_ID>`。IAMユーザー `shokun` は **Lambda実行・Bedrock・DynamoDB書込等の直接権限を持たない**。
- 権限が要る操作は **`bar504-admin` ロールにスイッチ**してから実行する:
  ```
  aws sts assume-role --role-arn arn:aws:iam::<AWS_ACCOUNT_ID>:role/bar504-admin \
    --role-session-name work --query Credentials
  # AccessKeyId / SecretAccessKey / SessionToken を環境変数にセットして実行
  ```
- リージョンは **ap-northeast-1**。

## Bedrock（画像からキャラ・地域を判定）
- モデル: `jp.anthropic.claude-haiku-4-5-20251001-v1:0`（**クロスリージョン推論プロファイル**。`converse` API を使う。`invoke_model` は不可）。
- Anthropicモデルは **First Time Use(FTU)フォーム提出済み**。旧「Model access」ページは廃止され、
  申請は Bedrock コンソールの **Playground / Model catalog** から行う（提出後15〜30分で有効）。
- IAM権限は `template.yaml` の scraper ポリシーに `bedrock:InvokeModel`（inference-profile ARN）を付与済み。
- 失敗の典型: `ResourceNotFoundException: Model use case details have not been submitted` → FTU未提出。
- `lambda/scanner`（ユーザー写真スキャン）は別モデル `jp.anthropic.claude-sonnet-4-5-20250929-v1:0` を使用。
  詳細は後述の「写真スキャン機能」を参照。

## データモデル: DynamoDB `ChiikawaMaster`
- PK=`Category`("KeyChain")、SK=`ItemName`。
- 属性: `Motif`(キャラ), `AreaType`, `AreaName`, `Prefecture`(所属都道府県の正式名・正規化済み),
  `ImageUrl`(/images/xxx), `IsVerified`, `CreatedAt`,
  `Tags`(String Set・自動付与＋手動編集), `SourceImageId`(元画像の数値ID・増分スキップ用)。
- `UserCollection`: PK=`FamilyID`("shoiwase"), SK=`ItemName`, `Status`(所持), `UpdatedAt`。

### 命名規約（ItemName）
`{キャラ}　{地域 モチーフ}　ダイカットキーホルダー`（全角スペース区切り、キャラ先頭）
- 例: `ちいかわ　北海道　ダイカットキーホルダー` / `うさぎ　静岡 みかん　ダイカットキーホルダー`
- 地域がモチーフと重複する場合は重複させない（北海道など）。

### AreaType 3分類 と 都道府県集約
`都道府県` / `市区町村`（鎌倉・箱根など） / `その他`（海外・関西/東海などの広域・リゾート・不明）。
画像から取れた地域は `area_mapping.classify_area()`、取れない時は `predict_area()` で分類。
- 各商品は所属 `Prefecture`（正式名・例「千葉県」）を持つ。市区町村は親県に集約され、
  フィルタで「千葉県」を選ぶと市川市の商品も出る。海外・広域は Prefecture 空＝「その他」。
- 解決ロジックは `area_mapping.resolve_prefecture()`（モデルのprefecture → AreaNameが県 →
  `CITY_TO_PREF` ルックアップ の順）。フロントのエリアフィルタは 都道府県→市区町村 の2段。

## スクレイパーの挙動（lambda/scraper）
- 対象: `https://www.jp-api.com/contents/NOD62/`（ご当地ちいかわ）。Shift-JIS。6ページ巡回。
- **「ダイカットキーホルダー」のみ対象**（ぬいぐるみキーチェーン・ソックス等は除外）。
- 各商品画像には **3キャラ（ちいかわ/ハチワレ/うさぎ）が並んで写る** → 1商品=最大3エントリ。
  一覧で判別できるよう、各キャラの柄だけを正方形で切り出して保存（`scraper.crop_character`、Pillow 使用）。
  - 元画像は 700x600 固定。実測の占有範囲は名前ラベル込みで
    ちいかわ x=64..245 / ハチワレ x=267..447 / うさぎ x=469..648（右上隅に装飾リボン x=658..）。
  - 切り出し窓は `_CHAR_CELLS`（隣との中間で区切ったセル）に**必ずクランプする**。
    単純に幅0.40で中心から取ると、柄より横幅の広い**隣のキャラの名前ラベルが左右の端に写り込む**
    （2026-08-21 に 0.28 幅＋セル制限へ修正）。縦は 0.55 中心で、鎖の上・名前ラベル・キャプション帯を外す。
  - **切り出しルールを変えたら既存画像も貼り替えが必要**（スクレイパーは `SourceImageId` で
    商品ごとスキップするので再取得されない）→ `scripts/recrop_images.py`
    （DynamoDB の登録から元画像URLを復元 → 取り直して同じS3キーへ上書き → CloudFront無効化。
    `--apply` 無しは dry-run。`bar504-admin` にスイッチしてから実行）。
- 同名・地域違いの別商品（みかん 静岡/和歌山/愛媛 等）は **地域名で一意化**。
- `analyze_image()` が `{characters, region, areaType}` を1回のBedrock呼び出しで返す。
  応答は ```json```フェンスで包まれることがあるためJSON抽出してパース。
- `Tags` は新規作成時のみ `{キャラ, 地名}` を自動付与。再実行は `SourceImageId` で商品単位スキップするため
  手動編集タグは保全される。

## 写真スキャン機能（lambda/scanner）
コレクション画面の「📷 スキャン」から、手持ちのキーホルダーを撮影 or 保存済み写真から選択して
一括で所持登録できる。フロントは `ScanModal.tsx`、バックエンドは `POST /scan`（`chiikawa-scanner` Lambda）。

### 抽出（Bedrock）
- `handler.py` が画像を Bedrock に渡し、`{character, area, motif}` の**構造化JSON配列**で
  キャラ・地域・ご当地要素を抽出させる。
  - `area`/`motif` は地名を除いたモチーフを分離して返す想定だが、「大阪城」「大阪のおばちゃん」
    「ニデック京都タワー」のように**地名とモチーフが不可分な商品が実在する**ため、その場合は
    `area` を空にして `motif` に名称全体を入れるようプロンプトで指示している。
  - 旧形式（`["大阪 たこ焼"]` のような文字列配列）が返っても後方互換でパースする。
  - `maxTokens` は 2000（500だと10件強で打ち切られ、JSON配列が閉じずに**全件ロスト＝0件**になる
    致命的な経路があった。過去にこれが本番の「スキャンしても何も出ない」の原因になったことがある）。
  - `temperature=0`（OCRなので決定的にする）。
- 画像は `MAX_PX=1600` にリサイズしてから送信（frontend `ScanModal.tsx`）。**これは意図的に据え置き**：
  `claude-sonnet-4-5` は高解像度ビジョン非対応で、長辺 1568px 超はモデル側でダウンサンプルされるため
  1600 以上に上げても情報量は増えない。タグの小さな文字の認識精度を上げたい場合は、まずモデルを
  高解像度対応（Opus 4.7+ / Sonnet 5 系、2576px 対応）に変更することを検討する。

### 照合（lambda/scanner/matcher.py）
AWS 非依存の純粋関数群。DynamoDB や Bedrock を一切呼ばないので `pytest` だけで検証できる。
- `item_core()` — `ItemName` から商品名コアを取り出す（`{キャラ}　{商品名}　ダイカットキーホルダー`
  の逆変換）。キャラ名は DB の `Motif` 属性を優先し、無ければ既知キャラ名（ちいかわ/ハチワレ/うさぎ）
  で剥がす。フロントの `format.ts` の `splitItemDisplay()` と対のロジックなので、**命名規約を変える
  ときは両方直す**こと。
- `extract_areas()` — 認識テキストに含まれる `AreaName`（DB の実在集合）を**左から最長一致**で
  抽出する。「東京都」から「東京」を先に取ることで、残りの「都」から「京都」が誤マッチしないように
  している（`"京都" in "東京都"` は素朴な部分一致だと真になる）。47都道府県のハードコードリストは
  持たず、DB の実在地名から動的に集合を作る（`lambda/scraper/area_mapping.py` は参照しない —
  SAM のパッケージ境界が別なのと、DB に無い地名を持ち込むと偽陽性が増えるため）。
- スコアリング：モチーフが商品名コアに完全包含 → `exact`。文字bigramのDice係数で近い → `partial`。
  地域しか特定できない → `area`（この場合はその地域の全商品を候補として返す）。
  スコア2以上のコアが1つでもあれば、そのコアだけに絞り込んでから最後にキャラで1件まで絞る。
- レスポンスの `ScanMatchedItem` は `itemDetail`（商品名コア）と `confidence`
  （`exact`/`partial`/`area`）を持つ。フロントは `confidence === "area"` のグループを折りたたみ・
  初期チェック外にして、地域だけの推測が誤って所持登録されないようにしている。

### フロント（ScanModal.tsx）
- 写真選択用の `<input>` は **カメラ用とライブラリ用の2本**に分けてある。`capture="environment"`
  を1本だけに付けるとカメラが強制起動し、保存済み写真から選べなくなる端末があるため。

### テスト
- `lambda/scanner/tests/test_matcher.py` — マッチングの回帰テスト（東京都/京都の誤マッチ防止、
  地域一体型商品、旧バグ「地名+モチーフ完全一致でしか照合できず0件になる」の再現テストを含む）。
- `lambda/scanner/tests/test_handler.py` — Bedrock 応答パース（JSON フェンス・切り詰め時の
  サルベージ・旧形式の後方互換）。
- CI は `deploy-sam.yml` の `test-python` が `strategy.matrix.dir: [lambda/scraper, lambda/scanner]`
  で両方実行する。

## デプロイ
- `main` への push で GitHub Actions が自動デプロイ:
  - `lambda/**` `template.yaml` 変更 → `deploy-sam.yml`（Java/Pythonテスト → SAM deploy）
  - `frontend/**` 変更 → `deploy-frontend.yml`
  - `terraform/**` → `deploy-infra.yml`
- ローカルテスト:
  `cd lambda/scraper && python3 -m pytest tests/ -q` /
  `cd lambda/scanner && python3 -m pytest tests/ -q` /
  `cd frontend && npx playwright test`
- Java（`lambda/api`）のテストは `Db` の定数が `static final` でクラス初期化時に一度だけ解決される
  ため、テストクラスの実行順に依存しないよう `pom.xml` の surefire に `systemPropertyVariables`
  （`MASTER_TABLE`/`COLLECTION_TABLE`/`FAMILY_ID`）と `runOrder=alphabetical` を固定している。
  ここを外すと、1ヶ月 `lambda/**` に変更が無いだけで実行順が変わって突然テストが落ちることがある。

## 手動再取得・洗い替え手順
1. （必要なら）`bar504-admin` にスイッチロール
2. 全削除: `ChiikawaMaster` の `Category=KeyChain` を scan→batch delete
3. スクレイパー実行: `aws lambda invoke --function-name chiikawa-scraper --invocation-type Event /tmp/out.json`
4. 検証: DynamoDB を scan して件数・命名・AreaType・Tags を確認。代表画像を目視確認。
   - 進行はCLIタイムアウトしがちなので、件数の増加を監視して安定したら検証する。
