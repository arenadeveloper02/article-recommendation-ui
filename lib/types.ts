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

export interface ModelOutputBadge {
  label: string;
  value: string;
}

export interface SourceLink {
  url: string;
  label: string;
}

export interface QAItem {
  id: string;
  question: string;
  answer: string;
}

export interface ModelOutputSection {
  id: string;
  title: string;
  body: string;
  raw: string;
  badges: ModelOutputBadge[];
  qaItems: QAItem[];
}

export interface ParsedModelOutput {
  intro: string;
  sections: ModelOutputSection[];
  qaItems: QAItem[];
  sources: SourceLink[];
  hasContent: boolean;
}
