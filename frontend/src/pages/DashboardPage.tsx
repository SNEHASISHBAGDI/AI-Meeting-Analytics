import React, { useState, useEffect } from "react";
import { createMeeting, getMeetingStatus, askMeetingChat, getExportUrl } from "../services/api";
import type { MeetingStatusResponse } from "../types/meeting";
import { FileText, CheckSquare, HelpCircle, MessageSquare, Download, Play, Loader2 } from "lucide-react";

type TabType = "summary" | "actions" | "decisions" | "questions" | "transcript" | "chat";

export const DashboardPage: React.FC = () => {
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("english");
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<MeetingStatusResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    let interval: number;
    if (polling && meetingId) {
      interval = window.setInterval(async () => {
        try {
          const data: MeetingStatusResponse = await getMeetingStatus(meetingId);
          setStatusData(data);
          if (data.status === "completed" || data.status === "failed") {
            setPolling(false);
          }
        } catch (err: unknown) {
          console.error(err);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [polling, meetingId]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await createMeeting(sourceUrl || undefined, file || undefined, language);
      setMeetingId(res.meeting_id);
      setPolling(true);
      setStatusData({ status: "processing", progress: "Initializing..." });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process meeting.";
      alert(errorMessage);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputQuery.trim() || !meetingId) return;
    const q = inputQuery;
    setInputQuery("");
    setChatMessages((prev) => [...prev, { role: "user", content: q }]);
    setChatLoading(true);
    try {
      const res = await askMeetingChat(meetingId, q);
      setChatMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Error retrieving answer." }]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-[#e8e8f0] font-mono p-6">
      <header className="flex justify-between items-center border-b border-[#2a2a3a] pb-4 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold bg-gradient-to-r from-white via-[#9f67ff] to-[#06b6d4] bg-clip-text text-transparent">
            AI Meeting Intelligence
          </h1>
          <p className="text-xs text-[#7070a0] uppercase tracking-widest mt-1">Enterprise Transcript Analysis</p>
        </div>
        {statusData?.status === "completed" && meetingId && (
          <div className="flex gap-3">
            <a href={getExportUrl(meetingId, "txt")} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1a1a25] border border-[#2a2a3a] rounded-lg text-xs hover:border-[#7c3aed] flex items-center gap-2">
              <Download size={14} /> TXT Report
            </a>
            <a href={getExportUrl(meetingId, "pdf")} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-[#1a1a25] border border-[#2a2a3a] rounded-lg text-xs hover:border-[#06b6d4] flex items-center gap-2">
              <Download size={14} /> PDF Report
            </a>
          </div>
        )}
      </header>

      {!statusData || statusData.status !== "completed" ? (
        <div className="max-w-xl mx-auto bg-[#111118] border border-[#2a2a3a] rounded-xl p-8 mt-12 shadow-2xl">
          <h2 className="text-lg font-bold mb-4">Analyze a New Meeting</h2>
          <form onSubmit={handleAnalyze} className="space-y-4">
            <div>
              <label className="block text-xs text-[#7070a0] mb-2 uppercase">YouTube URL</label>
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="w-full bg-[#1a1a25] border border-[#2a2a3a] rounded-lg p-3 text-sm focus:border-[#7c3aed] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-[#7070a0] mb-2 uppercase">Or Upload Audio / Video File</label>
              <input
                type="file"
                accept="audio/*,video/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-[#7070a0] file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#7c3aed] file:text-white hover:file:bg-[#6d28d9]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#7070a0] mb-2 uppercase">Language Engine</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-[#1a1a25] border border-[#2a2a3a] rounded-lg p-3 text-sm focus:border-[#7c3aed] outline-none"
              >
                <option value="english">English (Whisper)</option>
                <option value="hinglish">Hinglish / Multi (Sarvam AI)</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={polling}
              className="w-full py-3 bg-gradient-to-r from-[#7c3aed] to-[#5b21b6] rounded-lg font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2 hover:shadow-lg transition-all"
            >
              {polling ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
              {polling ? "Processing Meeting..." : "Analyze Meeting"}
            </button>
          </form>
          {polling && (
            <div className="mt-6 text-center text-sm text-[#7070a0] animate-pulse">
              {statusData?.progress || "Processing..."}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-6">
            <h2 className="text-xl font-bold text-white mb-2">{statusData.title}</h2>
            <div className="flex gap-2 border-b border-[#2a2a3a] pb-2 mt-4 overflow-x-auto">
              {[
                { id: "summary" as TabType, label: "Summary", icon: FileText },
                { id: "actions" as TabType, label: "Action Items", icon: CheckSquare },
                { id: "decisions" as TabType, label: "Key Decisions", icon: FileText },
                { id: "questions" as TabType, label: "Open Questions", icon: HelpCircle },
                { id: "transcript" as TabType, label: "Transcript", icon: FileText },
                { id: "chat" as TabType, label: "Ask RAG", icon: MessageSquare },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-all ${
                      activeTab === tab.id ? "bg-[#7c3aed] text-white shadow-md" : "bg-[#1a1a25] text-[#7070a0] hover:text-white"
                    }`}
                  >
                    <Icon size={14} /> {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-[#111118] border border-[#2a2a3a] rounded-xl p-6 min-h-[400px]">
            {activeTab === "summary" && <div className="whitespace-pre-wrap leading-relaxed">{statusData.summary}</div>}
            {activeTab === "actions" && <div className="whitespace-pre-wrap leading-relaxed">{statusData.action_items}</div>}
            {activeTab === "decisions" && <div className="whitespace-pre-wrap leading-relaxed">{statusData.decisions}</div>}
            {activeTab === "questions" && <div className="whitespace-pre-wrap leading-relaxed">{statusData.questions}</div>}
            {activeTab === "transcript" && <div className="whitespace-pre-wrap leading-relaxed text-xs text-[#7070a0]">{statusData.transcript}</div>}
            {activeTab === "chat" && (
              <div className="flex flex-col h-[400px]">
                <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                      <span className="text-[10px] text-[#7070a0] uppercase mb-1">{msg.role}</span>
                      <div className={`p-3 rounded-lg text-sm max-w-[80%] ${msg.role === "user" ? "bg-[#1a1a25] border border-[#2a2a3a]" : "bg-[#7c3aed]/10 border border-[#7c3aed]/30"}`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && <div className="text-xs text-[#7070a0] animate-pulse">Thinking...</div>}
                </div>
                <form onSubmit={handleSendChat} className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Ask a question about this meeting..."
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    className="flex-1 bg-[#1a1a25] border border-[#2a2a3a] rounded-lg p-3 text-sm focus:border-[#7c3aed] outline-none"
                  />
                  <button type="submit" className="px-6 py-3 bg-[#7c3aed] rounded-lg font-bold text-xs uppercase hover:bg-[#6d28d9]">
                    Send
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};