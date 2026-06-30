export type MasterItem = {
  Category: string;
  ItemName: string;
  Motif: string;
  AreaType: string;
  AreaName: string;
  ImageUrl: string;
  IsVerified: boolean;
  CreatedAt: string;
  Tags?: string[];
};

export type CollectionItem = MasterItem & {
  Owned: boolean;
  UpdatedAt?: string;
};

export const AREA_TYPES = ["都道府県", "市区町村", "その他"] as const;
export type AreaType = (typeof AREA_TYPES)[number];

export const CHARACTERS = ["ちいかわ", "ハチワレ", "うさぎ"] as const;
export type Character = (typeof CHARACTERS)[number];
