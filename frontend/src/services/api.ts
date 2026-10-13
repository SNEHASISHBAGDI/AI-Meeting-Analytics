const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function createMeeting(sourceUrl?: string, file?: File, language: string = "english") {
  const formData = new FormData();
  if (sourceUrl) formData.append("source_url", sourceUrl);
  if (file) formData.append("file", file);
  formData.append("language", language);

  const res = await fetch(`${API_BASE}/api/meetings`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to start processing meeting.");
  }
  return res.json();
}

export async function getMeetingStatus(meetingId: string) {
  const res = await fetch(`${API_BASE}/api/meetings/${meetingId}`);
  if (!res.ok) throw new Error("Failed to fetch meeting status.");
  return res.json();
}

export async function askMeetingChat(meetingId: string, question: string) {
  const res = await fetch(`${API_BASE}/api/meetings/${meetingId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok) throw new Error("Failed to get answer from meeting RAG.");
  return res.json();
}

export function getExportUrl(meetingId: string, type: "txt" | "pdf") {
  return `${API_BASE}/api/meetings/${meetingId}/export/${type}`;
}