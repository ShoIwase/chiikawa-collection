export type MasterItem = {
  Category: string;
  ItemName: string;
  Motif: string;
  AreaType: string;
  AreaName: string;
  ImageUrl: string;
  IsVerified: boolean;
  CreatedAt: string;
};

export type CollectionStatus = {
  FamilyID: string;
  ItemName: string;
  Status: boolean;
  UpdatedAt: string;
};

export type CollectionItem = MasterItem & {
  Owned: boolean;
  UpdatedAt?: string;
};

export type ApiResponse<T = unknown> = {
  statusCode: number;
  headers?: Record<string, string>;
  body: string;
};

export function ok<T>(data: T): ApiResponse<T> {
  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  };
}

export function err(statusCode: number, message: string): ApiResponse {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  };
}
