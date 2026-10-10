export interface MeetingStatusResponse {
  status: "processing" | "completed" | "failed";
  progress?: string;
  title?: string;
  summary?: string;
  action_items?: string;
  decisions?: string;
  questions?: string;
  transcript?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}