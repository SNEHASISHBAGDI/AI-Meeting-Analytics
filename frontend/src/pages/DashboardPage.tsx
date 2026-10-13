import React, { useState, useEffect } from "react";
import { createMeeting, getMeetingStatus, askMeetingChat, getExportUrl, checkBackendHealth } from "../services/api";
import type { MeetingStatusResponse, ChatMessage } from "../types/meeting";
import { 
  Sparkles, Upload, FileText, CheckSquare, 
  HelpCircle, MessageSquare, Download, Play, Loader2, 
  ShieldCheck, ArrowLeft, Send, FileCode,
  ListOrdered
} from "lucide-react";

type TabType = "summary" | "actions" | "decisions" | "questions" | "transcript" | "chat";

export const DashboardPage: React.FC = () => {
  const [inputMode, setInputMode] = useState<"url" | "file">("url");
  const [sourceUrl, setSourceUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("english");
  
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [statusData, setStatusData] = useState<MeetingStatusResponse | null>(null);
  const [polling, setPolling] = useState(false);
  const [isBackendOnline, setIsBackendOnline] = useState<boolean>(true);
  
  const [activeTab, setActiveTab] = useState<TabType>("summary");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    void checkBackendHealth()
      .then(setIsBackendOnline)
      .catch(() => setIsBackendOnline(false));

    const healthInterval = window.setInterval(() => {
      void checkBackendHealth()
        .then(setIsBackendOnline)
        .catch(() => setIsBackendOnline(false));
    }, 10000);

    return () => window.clearInterval(healthInterval);
  }, []);

  useEffect(() => {
    let interval: number | undefined;

    if (polling && meetingId) {
      interval = window.setInterval(async () => {
        try {
          const data: MeetingStatusResponse = await getMeetingStatus(meetingId);
          setStatusData(data);
          if (data.status === "completed" || data.status === "failed") {
            setPolling(false);
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 3000);
    }

    return () => {
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [polling, meetingId]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputMode === "url" && !sourceUrl.trim()) {
      alert("Please enter a valid YouTube URL.");
      return;
    }
    if (inputMode === "file" && !file) {
      alert("Please select an audio or video file.");
      return;
    }

    try {
      const res = await createMeeting(
        inputMode === "url" ? sourceUrl : undefined,
        inputMode === "file" && file ? file : undefined,
        language
      );
      setMeetingId(res.meeting_id);
      setPolling(true);
      setStatusData({ status: "processing", progress: "Initializing transcription engine..." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to start processing.";
      alert(msg);
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
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Error retrieving response from meeting context." }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleReset = () => {
    setMeetingId(null);
    setStatusData(null);
    setPolling(false);
    setSourceUrl("");
    setFile(null);
    setChatMessages([]);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="app-container">
      {/* Header / Navbar */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="brand-icon">
            <Sparkles size={20} />
          </div>
          <span className="brand-title">MeetingIntel</span>
          <span className="ai-badge">
            <Sparkles size={10} /> AI Powered
          </span>
        </div>

        <div className="backend-status">
          <span 
            className="status-dot" 
            style={{ backgroundColor: isBackendOnline ? "var(--accent-emerald)" : "var(--accent-rose)" }} 
          />
          {isBackendOnline ? "FastAPI Connected" : "Backend Disconnected"}
        </div>
      </nav>

      {/* Main Container */}
      <main className="main-content">
        {!statusData ? (
          <>
            <div className="hero-section">
              <h1 className="hero-headline">Turn Meetings into Actionable Intelligence</h1>
              <p className="hero-subheadline">
                Extract summaries, action items, key decisions, and open questions automatically with local Whisper and Mistral AI RAG.
              </p>
            </div>

            <div className="workspace-grid">
              {/* Setup Input Form */}
              <div className="setup-card">
                <div className="card-header">
                  <h2 className="card-title">Analyze Meeting</h2>
                  <p className="card-subtitle">Choose an input source to process</p>
                </div>

                <div className="input-mode-tabs">
                  <button 
                    type="button"
                    className={`mode-tab ${inputMode === "url" ? "active" : ""}`}
                    onClick={() => setInputMode("url")}
                  >
                    <Play size={16} /> YouTube URL
                  </button>
                  <button 
                    type="button"
                    className={`mode-tab ${inputMode === "file" ? "active" : ""}`}
                    onClick={() => setInputMode("file")}
                  >
                    <Upload size={16} /> Upload Audio/Video
                  </button>
                </div>

                <form onSubmit={handleAnalyze}>
                  {inputMode === "url" ? (
                    <div className="form-group">
                      <label className="form-label">YouTube URL</label>
                      <input 
                        type="url"
                        className="text-input"
                        placeholder="https://www.youtube.com/watch?v=..."
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="form-group">
                      <label className="form-label">Audio / Video File</label>
                      {!file ? (
                        <div className="file-dropzone">
                          <input 
                            type="file" 
                            accept="audio/*,video/*"
                            className="file-input-hidden"
                            onChange={(e) => setFile(e.target.files?.[0] || null)}
                          />
                          <Upload className="dropzone-icon" size={28} />
                          <div className="dropzone-text">Click to choose file or drag here</div>
                          <div className="dropzone-subtext">MP3, WAV, MP4, M4A up to 500MB</div>
                        </div>
                      ) : (
                        <div className="selected-file-badge">
                          <div className="file-info">
                            <FileCode size={18} color="var(--accent-brand)" />
                            <span>{file.name}</span>
                            <span className="file-size">({formatFileSize(file.size)})</span>
                          </div>
                          <button 
                            type="button" 
                            className="remove-file-btn"
                            onClick={() => setFile(null)}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Language Engine</label>
                    <select 
                      className="select-input"
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                    >
                      <option value="english">English (Whisper local STT)</option>
                      <option value="hinglish">Hinglish / Hindi-English (Sarvam AI)</option>
                    </select>
                  </div>

                  <button 
                    type="submit" 
                    className="submit-btn"
                    disabled={!isBackendOnline}
                  >
                    <Play size={16} /> Analyze Meeting
                  </button>
                </form>
              </div>

              {/* Feature Preview Side Panel */}
              <div className="preview-panel">
                <div className="feature-item">
                  <div className="feature-icon-wrapper">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="feature-title">Automatic Intelligence</h3>
                    <p className="feature-desc">Generate bulleted executive summaries and titles with Mistral AI.</p>
                  </div>
                </div>

                <div className="feature-item">
                  <div className="feature-icon-wrapper">
                    <CheckSquare size={20} />
                  </div>
                  <div>
                    <h3 className="feature-title">Action & Owner Extraction</h3>
                    <p className="feature-desc">Identify actionable items, assignees, and deadlines clearly.</p>
                  </div>
                </div>

                <div className="feature-item">
                  <div className="feature-icon-wrapper">
                    <MessageSquare size={20} />
                  </div>
                  <div>
                    <h3 className="feature-title">Conversational RAG Chat</h3>
                    <p className="feature-desc">Ask specific follow-up questions tied to ChromaDB vector store context.</p>
                  </div>
                </div>

                <div className="feature-item">
                  <div className="feature-icon-wrapper">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <h3 className="feature-title">Private & Session Isolated</h3>
                    <p className="feature-desc">Transcripts are embedded into meeting-specific collections with clean cleanup.</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : statusData.status === "failed" ? (
          <div className="processing-container">
            <h2 className="processing-title">Meeting analysis failed</h2>
            <p className="processing-status-text">
              {statusData.progress || "The backend could not process this meeting. Check the backend logs for details."}
            </p>
            <button type="button" className="reset-session-btn" onClick={handleReset}>
              <ArrowLeft size={16} /> Try Another Meeting
            </button>
          </div>
        ) : polling || statusData.status === "processing" ? (
          /* Real Processing Screen */
          <div className="processing-container">
            <Loader2 className="spinner-large" size={44} />
            <h2 className="processing-title">Analyzing Meeting...</h2>
            <p className="processing-status-text">{statusData.progress || "Processing audio..."}</p>
            <div className="processing-bar-bg">
              <div className="processing-bar-active" />
            </div>
          </div>
        ) : (
          /* Results Dashboard */
          <div>
            <div className="results-header">
              <div>
                <h1 className="meeting-title">{statusData.title || "Meeting Analysis"}</h1>
              </div>

              {meetingId && statusData.status === "completed" && (
                <div className="export-group">
                  <a href={getExportUrl(meetingId, "txt")} target="_blank" rel="noreferrer" className="export-btn">
                    <Download size={14} /> TXT
                  </a>
                  <a href={getExportUrl(meetingId, "pdf")} target="_blank" rel="noreferrer" className="export-btn">
                    <Download size={14} /> PDF
                  </a>
                </div>
              )}
            </div>

            {/* Navigation Tabs */}
            <div className="tabs-navigation">
              {[
                { id: "summary" as TabType, label: "Summary", icon: FileText },
                { id: "actions" as TabType, label: "Action Items", icon: CheckSquare },
                { id: "decisions" as TabType, label: "Key Decisions", icon: ListOrdered },
                { id: "questions" as TabType, label: "Open Questions", icon: HelpCircle },
                { id: "transcript" as TabType, label: "Transcript", icon: FileText },
                { id: "chat" as TabType, label: "Ask AI (RAG)", icon: MessageSquare },
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    className={`tab-btn ${activeTab === tab.id ? "active" : ""}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <Icon size={16} /> {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Content Display Card */}
            <div className="results-card">
              {activeTab === "summary" && <div className="formatted-text">{statusData.summary}</div>}
              {activeTab === "actions" && <div className="formatted-text">{statusData.action_items}</div>}
              {activeTab === "decisions" && <div className="formatted-text">{statusData.decisions}</div>}
              {activeTab === "questions" && <div className="formatted-text">{statusData.questions}</div>}
              {activeTab === "transcript" && <div className="transcript-box">{statusData.transcript}</div>}

              {activeTab === "chat" && (
                <div className="chat-container">
                  <div className="chat-history">
                    {chatMessages.length === 0 && (
                      <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", textAlign: "center", marginTop: "2rem" }}>
                        Ask any question about this meeting transcript. Answers are retrieved via ChromaDB vector embeddings.
                      </p>
                    )}
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} className={`chat-message ${msg.role}`}>
                        <span className="message-role">{msg.role}</span>
                        <div className="message-bubble">{msg.content}</div>
                      </div>
                    ))}
                    {chatLoading && (
                      <div className="chat-message assistant">
                        <span className="message-role">assistant</span>
                        <div className="message-bubble" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <Loader2 className="animate-spin" size={14} /> Thinking...
                        </div>
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleSendChat} className="chat-input-form">
                    <input 
                      type="text"
                      className="chat-input"
                      placeholder="Ask a question about this meeting..."
                      value={inputQuery}
                      onChange={(e) => setInputQuery(e.target.value)}
                    />
                    <button type="submit" className="chat-send-btn">
                      <Send size={14} /> Send
                    </button>
                  </form>
                </div>
              )}
            </div>

            <button type="button" className="reset-session-btn" onClick={handleReset}>
              <ArrowLeft size={16} /> Analyze Another Meeting
            </button>
          </div>
        )}
      </main>
    </div>
  );
};