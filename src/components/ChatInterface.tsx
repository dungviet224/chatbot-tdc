'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Bot,
  User,
  Loader2,
  AlertCircle,
  WifiOff,
  Calendar,
  FileText,
  Coins,
  Clock,
  Gift,
  Star,
  ExternalLink,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: { sectionId: string; sectionName: string }[];
  timestamp: Date;
}

interface SuggestedQuestion {
  text: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}

const SUGGESTED_QUESTIONS: SuggestedQuestion[] = [
  { text: 'Chính sách nghỉ phép hàng năm là bao nhiêu ngày?', Icon: Calendar },
  { text: 'Quy trình xin nghỉ phép như thế nào?', Icon: FileText },
  { text: 'Chính sách lương thưởng của công ty?', Icon: Coins },
  { text: 'Quy định về thời gian làm việc?', Icon: Clock },
  { text: 'Các quyền lợi phúc lợi của nhân viên?', Icon: Gift },
  { text: 'Quy trình onboarding nhân viên mới?', Icon: Star },
];

function TypingDots() {
  return (
    <span className="typing-dots" aria-label="AI đang soạn thảo">
      <span />
      <span />
      <span />
    </span>
  );
}

/** Inline markdown: **bold**, *italic*, `code` */
function applyInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code class="msg-code">$1</code>');
}

/** Markdown → HTML */
function formatMessage(content: string): string {
  const lines = content.split('\n');
  const output: string[] = [];
  const listBuffer: string[] = [];

  function flushList() {
    if (listBuffer.length === 0) return;
    output.push(`<ul class="msg-list">${listBuffer.join('')}</ul>`);
    listBuffer.length = 0;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const listMatch = trimmed.match(/^[-•]\s+(.+)/);
    if (listMatch) {
      listBuffer.push(`<li>${applyInline(listMatch[1])}</li>`);
      continue;
    }
    if (trimmed === '') {
      flushList();
      if (output.length > 0 && output[output.length - 1] !== '<br/>') {
        output.push('<br/>');
      }
      continue;
    }
    flushList();
    output.push(`<span>${applyInline(trimmed)}</span><br/>`);
  }

  flushList();
  while (output.length > 0 && output[0] === '<br/>') output.shift();
  while (output.length > 0 && output[output.length - 1] === '<br/>') output.pop();
  return output.join('').replace(/<br\/>(<ul)/g, '$1');
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [initStatus, setInitStatus] = useState('Đang đọc & embedding Sổ Tay Nhân Viên...');
  const [hasError, setHasError] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<Message[]>([]);
  const liveRegionRef = useRef<HTMLDivElement>(null);
  messagesRef.current = messages;

  // ── Scroll to bottom ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Initialize ──
  useEffect(() => {
    fetch('/api/init')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setIsInitialized(true);
          setMessages([
            {
              id: 'welcome',
              role: 'assistant',
              content: `Xin chào! Tôi là trợ lý AI của **TDConsulting**. Hãy hỏi tôi về chính sách nghỉ phép, lương thưởng, quy định làm việc hoặc các quyền lợi nhân viên.`,
              timestamp: new Date(),
            },
          ]);
        } else {
          setHasError(true);
          setInitStatus('Không thể tải dữ liệu: ' + data.error);
        }
      })
      .catch(() => {
        setHasError(true);
        setInitStatus('Không thể kết nối đến server.');
      });
  }, []);

  // ── Auto resize textarea ──
  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 128) + 'px';
  };

  // ── Send message ──
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return;

      const userMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      const historySnapshot = messagesRef.current;
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setIsLoading(true);

      const assistantId = `ai-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: '', timestamp: new Date() },
      ]);

      try {
        abortControllerRef.current = new AbortController();

        const allMessages = [...historySnapshot, userMessage]
          .filter((m) => m.content.trim() !== '')
          .map((m) => ({ role: m.role, content: m.content }));

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: allMessages }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err?.error ?? `HTTP ${response.status}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';
        let clientBuffer = '';
        let isDone = false;
        let lastSources: { sectionId: string; sectionName: string }[] = [];

        while (!isDone) {
          const { done, value } = await reader.read();
          if (done) break;
          clientBuffer += decoder.decode(value, { stream: true });
          const lines = clientBuffer.split('\n');
          clientBuffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6).trim();
            if (data === '[DONE]') { isDone = true; break; }
            try {
              const parsed = JSON.parse(data);
              if (parsed.content) {
                accumulated += parsed.content;
                setMessages((prev) =>
                  prev.map((m) => m.id === assistantId ? { ...m, content: accumulated } : m)
                );
              }
              if (parsed.sources) {
                lastSources = parsed.sources;
              }
            } catch { /* skip */ }
          }
        }

        // Gắn sources vào message
        if (lastSources.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, sources: lastSources } : m
            )
          );
        }

        if (!accumulated) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: 'Không nhận được phản hồi. Vui lòng thử lại.' }
                : m
            )
          );
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: `Lỗi kết nối: ${error.message}. Vui lòng thử lại.` }
                : m
            )
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, isInitialized]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const canSend = input.trim().length > 0 && !isLoading;

  return (
    <div className="chat-root">
      <a href="#chat-main" className="skip-link">Bỏ qua điều hướng</a>

      <div
        ref={liveRegionRef}
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="sr-only"
      />

      {/* ── HEADER ── */}
      <header className="chat-header" role="banner">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">
              <Bot size={22} strokeWidth={2} />
            </div>
            <div className="brand-text">
              <h1 className="brand-name">TDConsulting AI</h1>
              <p className="brand-sub">Trợ lý Sổ Tay Nhân Viên</p>
            </div>
          </div>

          {(!isInitialized || hasError) && (
            <div
              className={`status-chip ${hasError ? 'status-error' : 'status-loading'}`}
              role="status"
              aria-label={hasError ? 'Lỗi kết nối' : 'Đang tải'}
            >
              {hasError ? (
                <WifiOff size={13} aria-hidden="true" />
              ) : (
                <Loader2 size={13} className="spin" aria-hidden="true" />
              )}
              <span>{hasError ? 'Lỗi' : 'Đang tải...'}</span>
            </div>
          )}
        </div>

        {!isInitialized && !hasError && (
          <div className="init-strip" role="progressbar" aria-label="Đang khởi tạo">
            <div className="init-track"><div className="init-fill" /></div>
            <span className="init-label">{initStatus}</span>
          </div>
        )}
      </header>

      {/* ── MESSAGES ── */}
      <main id="chat-main" className="chat-messages" role="log" aria-label="Lịch sử cuộc trò chuyện" aria-live="polite">

        {!isInitialized && !hasError && (
          <div className="init-screen" role="status" aria-label="Đang khởi tạo">
            <div className="init-spinner" aria-hidden="true">
              <Loader2 size={32} className="spin" />
            </div>
            <p className="init-text">{initStatus}</p>
            <p className="init-sub">Vui lòng chờ trong giây lát...</p>
          </div>
        )}

        {hasError && (
          <div className="error-screen" role="alert">
            <AlertCircle size={32} aria-hidden="true" />
            <p>{initStatus}</p>
            <button
              className="retry-btn"
              onClick={() => window.location.reload()}
              aria-label="Thử lại kết nối"
            >
              Thử lại
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <article
            key={msg.id}
            className={`msg-row ${msg.role}`}
            aria-label={msg.role === 'user' ? 'Tin nhắn của bạn' : 'Phản hồi từ AI'}
          >
            <div className={`msg-avatar ${msg.role}`} aria-hidden="true">
              {msg.role === 'assistant' ? <Bot size={16} strokeWidth={2} /> : <User size={16} strokeWidth={2} />}
            </div>
            <div className={`msg-bubble ${msg.role}`}>
              {msg.content ? (
                <div
                  className="msg-text"
                  dangerouslySetInnerHTML={{
                    __html: formatMessage(msg.content) + (
                      msg.sources && msg.sources.length > 0
                        ? ' ' + msg.sources.map(s =>
                            `<a href="/sotaynhanvien.html#${s.sectionId}" target="_blank" rel="noopener noreferrer" class="msg-source-tag" aria-label="Xem nội dung: ${s.sectionName || s.sectionId}">🔗 ${s.sectionName || s.sectionId}</a>`
                          ).join(' ')
                        : ''
                    ),
                  }}
                />
              ) : (
                <TypingDots />
              )}

              <time
                className="msg-time"
                dateTime={msg.timestamp.toISOString()}
                aria-label={`Lúc ${formatTime(msg.timestamp)}`}
              >
                {formatTime(msg.timestamp)}
              </time>
            </div>
          </article>
        ))}

        {messages.length === 1 && isInitialized && (
          <section className="suggestions" aria-label="Câu hỏi gợi ý">
            <div className="suggestions-grid">
              {SUGGESTED_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  className="suggestion-btn"
                  onClick={() => sendMessage(q.text)}
                  disabled={isLoading}
                  aria-label={`Hỏi: ${q.text}`}
                >
                  <q.Icon size={15} className="suggestion-icon" aria-hidden="true" />
                  <span>{q.text}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div ref={messagesEndRef} aria-hidden="true" />
      </main>

      {/* ── INPUT AREA ── */}
      <footer className="chat-footer" role="contentinfo">
        <form
          className="input-form"
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
          aria-label="Nhập câu hỏi"
        >
          <div className={`input-box ${canSend ? 'has-content' : ''}`}>
            <textarea
              ref={textareaRef}
              id="chat-input"
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              placeholder={isInitialized ? 'Hỏi về chính sách, quy định công ty...' : 'Đang khởi tạo, vui lòng chờ...'}
              rows={1}
              aria-label="Câu hỏi"
              aria-describedby="input-hint"
              autoComplete="off"
              spellCheck="false"
            />
            <button
              type="submit"
              className="send-btn"
              disabled={isLoading}
              aria-label={isLoading ? 'Đang xử lý...' : 'Gửi câu hỏi'}
            >
              {isLoading
                ? <Loader2 size={18} className="spin" aria-hidden="true" />
                : <Send size={18} aria-hidden="true" />
              }
            </button>
          </div>
        </form>
        <p id="input-hint" className="footer-hint">
          <kbd>Enter</kbd> gửi &nbsp;&bull;&nbsp; <kbd>Shift+Enter</kbd> xuống dòng
        </p>
      </footer>
    </div>
  );
}
