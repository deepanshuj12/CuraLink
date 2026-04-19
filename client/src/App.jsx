import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import "./App.css";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

function App() {
  const [token, setToken] = useState(localStorage.getItem("token") || "");
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  });
  const [conversationId, setConversationId] = useState(localStorage.getItem("conversationId") || "");
  const [form, setForm] = useState({ patientName: "", disease: "", location: "", query: "" });
  const [inputStyle, setInputStyle] = useState("full");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState([]);
  const [sidebarAction, setSidebarAction] = useState("");
  const [showMoreHistory, setShowMoreHistory] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const showAuthPanel = sidebarAction === "login" || sidebarAction === "register";
  const sortedHistory = useMemo(() => [...history].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)), [history]);

  async function handleAuth(event) {
    event.preventDefault();
    setError("");
    try {
      const endpoint = authMode === "register" ? "register" : "login";
      const payload = authMode === "register" ? authForm : { email: authForm.email, password: authForm.password };
      const { data } = await axios.post(`${API_BASE}/auth/${endpoint}`, payload);
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      await loadHistory(data.token);
      setSidebarAction("");
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Authentication failed");
    }
  }

  async function loadHistory(currentToken = token) {
    if (!currentToken) return;
    try {
      const { data } = await axios.get(`${API_BASE}/research/history`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      setHistory(data.history || []);
    } catch (_error) {
      setHistory([]);
    }
  }

  function goHome() {
    setIsHistoryOpen(false);
    setSidebarAction("");
    if (window.location.pathname !== "/") {
      window.location.assign("/");
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function truncateText(text, max = 44) {
    const trimmed = String(text || "").trim();
    if (trimmed.length <= max) return trimmed;
    return `${trimmed.slice(0, max).trim()}...`;
  }

  async function loadConversation(id) {
    if (!id) return;
    setError("");
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE}/research/conversation/${id}`, {
        headers: authHeaders,
      });
      setConversationId(id);
      localStorage.setItem("conversationId", id);
      setIsHistoryOpen(false);
      setForm({ patientName: "", disease: "", location: "", query: "" });
      setChat((data.messages || []).map((message) => ({
        role: message.role,
        text: message.content,
        meta: {
          ...message.meta,
          topPublicationQuotes: message.meta?.topPublicationQuotes || [],
          rankedLinks: message.meta?.rankedLinks || [],
        },
      })));
      if (token) await loadHistory();
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Unable to restore conversation");
    } finally {
      setLoading(false);
    }
  }

  function newChat() {
    setConversationId("");
    setChat([]);
    setForm({ patientName: "", disease: "", location: "", query: "" });
    localStorage.removeItem("conversationId");
    setIsHistoryOpen(false);
  }

  function logout() {
    setToken("");
    setUser(null);
    setHistory([]);
    setChat([]);
    setConversationId("");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("conversationId");
    setSidebarAction("");
    setIsHistoryOpen(false);
  }

  useEffect(() => {
    if (token) {
      loadHistory(token);
    }
  }, [token]);

  useEffect(() => {
    if (conversationId && chat.length === 0) {
      loadConversation(conversationId);
    }
  }, [conversationId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await axios.post(`${API_BASE}/research/chat`, {
        ...form,
        inputStyle,
        conversationId: conversationId || undefined,
      }, {
        headers: authHeaders,
      });

      setConversationId(data.conversationId);
      localStorage.setItem("conversationId", data.conversationId);

      const topPublicationQuotes = (data.topPublicationQuotes || []).slice(0, 3).map((item) => ({
        quote: item.quote || "No summary snippet available.",
        title: item.title,
        url: item.url,
        rank: item.rank || 0,
      }));

      const rankedLinks = (data.rankedLinks || []).slice(0, 3);
      const assistantText = `${data.answer || "No answer available."}${data.correctedDisease && data.correctedDisease !== form.disease ? `\n\n(Note: corrected disease term to "${data.correctedDisease}" for a more relevant search.)` : ""}`;

      setChat((prev) => [
        ...prev,
        {
          role: "user",
          text: queryLabel(form),
        },
        {
          role: "assistant",
          text: assistantText,
          meta: {
            expandedQuery: data.expandedQuery,
            sourceStatus: data.sourceStatus,
            topPublicationQuotes,
            rankedLinks,
          },
        },
      ]);

      setForm((prev) => {
        if (inputStyle === "full") {
          return { patientName: "", disease: "", location: "", query: "" };
        }
        return { ...prev, query: "" };
      });
      if (token) await loadHistory();
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || err.message || "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function queryLabel(values) {
    const diseaseText = values.disease ? ` [Disease: ${values.disease}]` : "";
    const patientText = values.patientName ? ` [Patient: ${values.patientName}]` : "";
    const locationText = values.location ? ` [Location: ${values.location}]` : "";
    return `${values.query}${diseaseText}${patientText}${locationText}`;
  }

  function renderTextWithLinks(text) {
    const regex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s]+)/g;
    const nodes = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text))) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      if (match[1] && match[2]) {
        nodes.push(
          <a key={`${lastIndex}-${match.index}`} className="assistant-link" href={match[2]} target="_blank" rel="noreferrer">
            {match[1]}
          </a>
        );
      } else if (match[3]) {
        const rawUrl = match[3];
        const cleanUrl = rawUrl.replace(/[\)\.\],;:!?]+$/, "");
        const trailing = rawUrl.slice(cleanUrl.length);
        nodes.push(
          <a key={`${lastIndex}-${match.index}`} className="assistant-link" href={cleanUrl} target="_blank" rel="noreferrer">
            {cleanUrl}
          </a>
        );
        if (trailing) nodes.push(trailing);
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      nodes.push(text.slice(lastIndex));
    }

    return nodes;
  }

  function renderFormattedText(text) {
    return String(text || "").split(/\r?\n/).map((line, idx) => {
      const trimmed = line.trim().replace(/^##\s*/, "").replace(/^\*\*(.*)\*\*$/, "$1");
      if (!trimmed) return <br key={`br-${idx}`} />;

      const sectionMatch = trimmed.match(/^(\d+\.)\s*(Condition Overview|Research Insights|Clinical Trials|Practical Notes|Safety Disclaimer)\s*:?(.*)$/i);
      if (sectionMatch) {
        return (
          <div key={idx} className="assistant-heading">
            <span className="assistant-heading-number">{sectionMatch[1]}</span>
            <span>{sectionMatch[2]}{sectionMatch[3] ? `: ${sectionMatch[3].trim()}` : ""}</span>
          </div>
        );
      }

      const headingMatch = trimmed.match(/^(Condition Overview|Research Insights|Clinical Trials|Practical Notes|Safety Disclaimer)\s*:?(.*)$/i);
      if (headingMatch) {
        return (
          <div key={idx} className="assistant-heading">
            <span>{headingMatch[1]}{headingMatch[2] ? `: ${headingMatch[2].trim()}` : ""}</span>
          </div>
        );
      }

      if (/^[-*•]\s+/.test(trimmed)) {
        return (
          <div key={idx} className="assistant-bullet">
            • {renderTextWithLinks(trimmed.replace(/^[-*•]\s+/, ""))}
          </div>
        );
      }

      return (
        <p key={idx} className="assistant-paragraph">
          {renderTextWithLinks(trimmed)}
        </p>
      );
    });
  }

  function renderMessageContent(message) {
    if (message.role === "assistant") {
      return <div className="assistant-content">{renderFormattedText(message.text)}</div>;
    }
    return <pre>{message.text}</pre>;
  }

  return (
    <div className="layout">
      <nav className="top-navbar">
        <div className="navbar-brand-row">
          <div className="navbar-header">
            <button type="button" className="navbar-brand-button" onClick={goHome}>
              <h2>Curalink</h2>
              <p className="muted">Medical research companion</p>
            </button>
          </div>

          <div className="mobile-menu">
            <button type="button" className="hamburger-button" onClick={() => setIsNavOpen((open) => !open)} aria-label="Toggle menu">
              ☰
            </button>
            <div className={`navbar-links ${isNavOpen ? "open" : ""}`}>
              {!token ? (
                <>
                  <button type="button" onClick={() => { setAuthMode("login"); setSidebarAction("login"); setIsNavOpen(false); }}>LOGIN</button>
                  <button type="button" onClick={() => { setAuthMode("register"); setSidebarAction("register"); setIsNavOpen(false); }}>REGISTER</button>
                </>
              ) : (
                <>
                  <button type="button" className="user-button" aria-label="Logged in user">
                    {user?.name || "User"}
                  </button>
                  <button type="button" className="history-toggle-button" onClick={() => { setIsHistoryOpen((open) => !open); setIsNavOpen(false); }}>
                    {isHistoryOpen ? "Close History" : "History"}
                  </button>
                  <button type="button" className="logout-button" onClick={() => { logout(); setIsNavOpen(false); }}>LOGOUT</button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="navbar-actions desktop-links">
          {!token ? (
            <>
              <button type="button" onClick={() => { setAuthMode("login"); setSidebarAction("login"); }}>LOGIN</button>
              <button type="button" onClick={() => { setAuthMode("register"); setSidebarAction("register"); }}>REGISTER</button>
            </>
          ) : (
            <>
              <button type="button" className="user-button" aria-label="Logged in user">
                {user?.name || "User"}
              </button>
              <button type="button" className="history-toggle-button" onClick={() => setIsHistoryOpen((open) => !open)}>
                {isHistoryOpen ? "Close History" : "History"}
              </button>
              <button type="button" className="logout-button" onClick={logout}>LOGOUT</button>
            </>
          )}
        </div>
      </nav>

      <div className="main-content">
        <aside className={`sidebar ${showAuthPanel || isHistoryOpen ? "open" : ""}`}>
          {showAuthPanel ? (
            <form onSubmit={handleAuth} className="panel form-grid sidebar-panel">
              <h3>{authMode === "register" ? "Create Account" : "Login"}</h3>
              {authMode === "register" ? (
                <input value={authForm.name} placeholder="Full Name" onChange={(e) => setAuthForm((p) => ({ ...p, name: e.target.value }))} required />
              ) : null}
              <input value={authForm.email} type="email" placeholder="Email" onChange={(e) => setAuthForm((p) => ({ ...p, email: e.target.value }))} required />
              <input value={authForm.password} type="password" placeholder="Password" onChange={(e) => setAuthForm((p) => ({ ...p, password: e.target.value }))} required />
              <button type="submit">{authMode === "register" ? "Register" : "Login"}</button>
            </form>
          ) : null}

          {token ? (
            <>
              <div className="panel sidebar-panel history-panel">
                <div className="history-header">
                  <h3>History</h3>
                  <button type="button" className="new-chat-sidebar-button" onClick={newChat}>+</button>
                </div>
                {sortedHistory.length ? (
                  <>
                    {sortedHistory.slice(0, showMoreHistory ? sortedHistory.length : 5).map((item) => (
                      <button key={item.id} type="button" className={`history-item ${item.id === conversationId ? "active" : ""}`} onClick={() => loadConversation(item.id)}>
                        <span className="history-query">{truncateText(item.preview || item.lastMessage || item.disease || "Previous query")}</span>
                        <small>{item.disease || "Unknown"}</small>
                      </button>
                    ))}
                    {sortedHistory.length > 5 && (
                      <button type="button" className="show-more-button" onClick={() => setShowMoreHistory(!showMoreHistory)}>
                        {showMoreHistory ? "Show Less" : `Show ${sortedHistory.length - 5} More`}
                      </button>
                    )}
                  </>
                ) : <p className="muted">No history yet.</p>}
              </div>

            </>
          ) : null}
        </aside>

        <main className="chat-main">
          <section className="chat-window panel">
            {chat.length === 0 ? (
              <p className="muted">Start a conversation by entering disease context and your question in the chatbox.</p>
            ) : (
              chat.map((message, idx) => (
                <article key={`${message.role}-${idx}`} className={`message ${message.role}`}>
                  <div className="bubble">
                    <p className="role-label">{message.role === "user" ? "You" : "Assistant"}</p>
                    {renderMessageContent(message)}
                    {message.role === "assistant" && message.meta ? (
                      <div className="links">
                        <h4>Ranked Important Links</h4>
                        <ol>
                          {message.meta.rankedLinks.map((link) => (
                            <li key={`${link.url}-${link.label}`}>
                              <a href={link.url} target="_blank" rel="noreferrer">
                                {link.label}
                              </a>
                              {link.snippet ? <p className="link-snippet">{link.snippet}</p> : null}
                            </li>
                          ))}
                        </ol>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </section>

          <form autoComplete="off" onSubmit={handleSubmit} className={`panel form-grid chat-input bottom-input ${inputStyle === "followup" ? "followup" : ""}`}>
            <label className="input-style-toggle" htmlFor="fullInput">
              <input
                type="checkbox"
                id="fullInput"
                checked={inputStyle === "full"}
                onChange={(e) => setInputStyle(e.target.checked ? "full" : "followup")}
              />
              Full Input
            </label>
            {inputStyle === "full" ? (
              <>
                <input name="patientName" autoComplete="off" className="field-patient" value={form.patientName} placeholder="Patient" onChange={(e) => setForm((p) => ({ ...p, patientName: e.target.value }))} />
                <input name="disease" autoComplete="off" className="field-disease" value={form.disease} placeholder="Disease" onChange={(e) => setForm((p) => ({ ...p, disease: e.target.value }))} required />
                <input name="location" autoComplete="off" className="field-location" value={form.location} placeholder="Location" onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
              </>
            ) : null}
            <input className={inputStyle === "followup" ? "query-input wide" : "query-input"} name="researchQuery" autoComplete="off" value={form.query} placeholder="Ask your medical research question..." onChange={(e) => setForm((p) => ({ ...p, query: e.target.value }))} required />
            <button type="submit" className="send-button" disabled={loading}>{loading ? "Analyzing..." : "Send"}</button>
          </form>

          {error ? <div className="panel error">{error}</div> : null}
        </main>

      </div>

    </div>
  );
}

export default App;
