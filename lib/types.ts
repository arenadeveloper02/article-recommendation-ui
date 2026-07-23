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

export type StreamEventType = 'content' | 'status' | 'error' | 'done';

export interface StreamEvent {
  type: StreamEventType;
  text?: string;
}

export interface RecommendResult {
  content: string;
  keyword: string;
  client: string;
}
