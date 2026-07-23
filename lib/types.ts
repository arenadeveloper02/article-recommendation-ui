export interface GenerateRequestInput {
  keyword: string;
  client: string;
}

export interface GenerateSuccessResponse {
  brief: string;
  raw: unknown;
}

export interface GenerateErrorResponse {
  error: string;
}

export interface BriefResult {
  brief: string;
  keyword: string;
  client: string;
}
