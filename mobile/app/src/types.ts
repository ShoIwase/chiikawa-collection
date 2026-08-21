export type MasterItem = {
  Category: string;
  ItemName: string;
  Motif: string;
  AreaType: string;
  AreaName: string;
  Prefecture?: string;
  ImageUrl: string;
  IsVerified: boolean;
  CreatedAt: string;
  Tags?: string[];
};

export type CollectionItem = MasterItem & {
  Owned: boolean;
  UpdatedAt?: string;
};

// 都道府県（正式名・地理順）。frontend/src/lib/types.ts と同じ並び。
export const PREFECTURES = [
  "北海道",
  "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

export const OTHER_AREA_LABEL = "その他";

export function bucketOf(item: Pick<MasterItem, "Prefecture">): string {
  return item.Prefecture || OTHER_AREA_LABEL;
}

export const AREA_TYPES = ["都道府県", "市区町村", "その他"] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const CHARACTERS = ["ちいかわ", "ハチワレ", "うさぎ"] as const;
export type Character = (typeof CHARACTERS)[number];

export const WANT_TAG = "欲しい";
export const FAV_TAG = "お気に入り";
