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

export const AREA_TYPES = ["都道府県", "市町村", "温泉地", "海外"] as const;
export type AreaType = (typeof AREA_TYPES)[number];
