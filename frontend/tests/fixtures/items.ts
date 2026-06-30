import type { CollectionItem, MasterItem } from "../../src/lib/types";

export const MOCK_ITEMS: CollectionItem[] = [
  {
    Category: "KeyChain",
    ItemName: "北海道 ダイカットキーホルダー",
    Motif: "ちいかわ",
    AreaType: "都道府県",
    AreaName: "北海道",
    Prefecture: "北海道",
    ImageUrl: "/images/hokkaido.png",
    IsVerified: true,
    CreatedAt: "2026-01-01T00:00:00Z",
    Owned: true,
    UpdatedAt: "2026-06-01T00:00:00Z",
  },
  {
    Category: "KeyChain",
    ItemName: "箱根 ダイカットキーホルダー",
    Motif: "ハチワレ",
    AreaType: "市区町村",
    AreaName: "箱根",
    Prefecture: "神奈川県",
    ImageUrl: "/images/hakone.png",
    IsVerified: true,
    CreatedAt: "2026-01-02T00:00:00Z",
    Owned: false,
  },
  {
    Category: "KeyChain",
    ItemName: "沖縄 ダイカットキーホルダー",
    Motif: "うさぎ",
    AreaType: "都道府県",
    AreaName: "沖縄",
    Prefecture: "沖縄県",
    ImageUrl: "/images/okinawa.png",
    IsVerified: true,
    CreatedAt: "2026-01-03T00:00:00Z",
    Owned: false,
  },
];

export const MOCK_PENDING: MasterItem[] = [
  {
    Category: "KeyChain",
    ItemName: "行徳みこし ダイカットキーホルダー",
    Motif: "ちいかわ",
    AreaType: "市区町村",
    AreaName: "行徳",
    Prefecture: "千葉県",
    ImageUrl: "/images/gyotoku.png",
    IsVerified: false,
    CreatedAt: "2026-06-26T00:00:00Z",
  },
];
