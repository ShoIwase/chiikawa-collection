# chiikawa-collection — 運用・設計ドキュメント

家族で「ご当地ちいかわ ダイカットキーホルダー」の所持状況を管理するコレクションアプリ。
このファイルは毎セッションで再調査しがちな前提知識をまとめたもの。

## 構成
- **frontend/** — Next.js 15 (App Router) + React 19 + Tailwind + AWS Amplify(Cognito認証)。Playwright e2e。
- **lambda/api/** — Java 21 Lambda（SnapStart）。API Gateway HTTP API + Cognito JWT。
- **lambda/scraper/** — Python 3.12 Lambda。元サイトを巡回し画像解析して DynamoDB に投入。EventBridge で毎日 9:00 JST 実行。
- **terraform/** — DynamoDB・S3・CloudFront・Cognito 等の基盤。
- **template.yaml** — SAM（Lambda / API Gateway / スケジュール）。

## AWS（重要）
- アカウント: `522814726651`。IAMユーザー `shokun` は **Lambda実行・Bedrock・DynamoDB書込等の直接権限を持たない**。
- 権限が要る操作は **`bar504-admin` ロールにスイッチ**してから実行する:
  ```
  aws sts assume-role --role-arn arn:aws:iam::522814726651:role/bar504-admin \
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

## データモデル: DynamoDB `ChiikawaMaster`
- PK=`Category`("KeyChain")、SK=`ItemName`。
- 属性: `Motif`(キャラ), `AreaType`, `AreaName`, `ImageUrl`(/images/xxx), `IsVerified`, `CreatedAt`,
  `Tags`(String Set・自動付与＋手動編集), `SourceImageId`(元画像の数値ID・増分スキップ用)。
- `UserCollection`: PK=`FamilyID`("shoiwase"), SK=`ItemName`, `Status`(所持), `UpdatedAt`。

### 命名規約（ItemName）
`{キャラ}　{地域 モチーフ}　ダイカットキーホルダー`（全角スペース区切り、キャラ先頭）
- 例: `ちいかわ　北海道　ダイカットキーホルダー` / `うさぎ　静岡 みかん　ダイカットキーホルダー`
- 地域がモチーフと重複する場合は重複させない（北海道など）。

### AreaType 3分類
`都道府県` / `市区町村`（鎌倉・箱根など） / `その他`（海外・関西/東海などの広域・リゾート・不明）。
画像から取れた地域は `area_mapping.classify_area()`、取れない時は `predict_area()` で分類。

## スクレイパーの挙動（lambda/scraper）
- 対象: `https://www.jp-api.com/contents/NOD62/`（ご当地ちいかわ）。Shift-JIS。6ページ巡回。
- **「ダイカットキーホルダー」のみ対象**（ぬいぐるみキーチェーン・ソックス等は除外）。
- 各商品画像には **3キャラ（ちいかわ/ハチワレ/うさぎ）が並んで写る** → 1商品=最大3エントリ。
- 同名・地域違いの別商品（みかん 静岡/和歌山/愛媛 等）は **地域名で一意化**。
- `analyze_image()` が `{characters, region, areaType}` を1回のBedrock呼び出しで返す。
  応答は ```json```フェンスで包まれることがあるためJSON抽出してパース。
- `Tags` は新規作成時のみ `{キャラ, 地名}` を自動付与。再実行は `SourceImageId` で商品単位スキップするため
  手動編集タグは保全される。

## デプロイ
- `main` への push で GitHub Actions が自動デプロイ:
  - `lambda/**` `template.yaml` 変更 → `deploy-sam.yml`（Java/Pythonテスト → SAM deploy）
  - `frontend/**` 変更 → `deploy-frontend.yml`
  - `terraform/**` → `deploy-infra.yml`
- ローカルテスト: `cd lambda/scraper && python3 -m pytest tests/ -q` / `cd frontend && npx playwright test`

## 手動再取得・洗い替え手順
1. （必要なら）`bar504-admin` にスイッチロール
2. 全削除: `ChiikawaMaster` の `Category=KeyChain` を scan→batch delete
3. スクレイパー実行: `aws lambda invoke --function-name chiikawa-scraper --invocation-type Event /tmp/out.json`
4. 検証: DynamoDB を scan して件数・命名・AreaType・Tags を確認。代表画像を目視確認。
   - 進行はCLIタイムアウトしがちなので、件数の増加を監視して安定したら検証する。
