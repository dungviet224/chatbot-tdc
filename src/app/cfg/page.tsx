'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Settings, Shield, Upload, LogOut, Save, Loader2, Check, AlertCircle,
  Key, Server, FileText, RefreshCw, Eye, EyeOff,
} from 'lucide-react';

// ── Helpers ──
async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    credentials: 'include',
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  return res.json();
}

interface ConfigData {
  apiBase: string;
  apiKey: string;
  embedModel: string;
  chatModel: string;
  rules: string;
}

interface EmbedData {
  ready: boolean;
  totalChunks: number;
  docUpdatedAt: string | null;
  fileSize: number;
}

// ── Login ──
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api('/api/cfg/login', {
        method: 'POST',
        body: JSON.stringify({ username: user, password: pass }),
      });
      if (res.success) onLogin();
      else setError(res.error || 'Đăng nhập thất bại');
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cfg-root">
      <div className="cfg-login-card">
        <div className="cfg-login-brand">
          <div className="cfg-login-icon"><Shield size={28} /></div>
          <h1>Cấu hình TDConsulting AI</h1>
          <p>Đăng nhập để quản lý cài đặt</p>
        </div>
        <form onSubmit={handleSubmit} className="cfg-login-form">
          {error && (
            <div className="cfg-alert cfg-alert-error" role="alert">
              <AlertCircle size={16} /><span>{error}</span>
            </div>
          )}
          <div className="cfg-field">
            <label htmlFor="cfg-user">Tài khoản</label>
            <input
              id="cfg-user"
              type="text"
              value={user}
              onChange={e => setUser(e.target.value)}
              placeholder="adminmmb"
              required
              autoFocus
            />
          </div>
          <div className="cfg-field">
            <label htmlFor="cfg-pass">Mật khẩu</label>
            <input
              id="cfg-pass"
              type="password"
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" className="cfg-btn cfg-btn-primary" disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : <Shield size={16} />}
            Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Config Tab ──
function ApiConfigTab({ config, onChange }: { config: ConfigData; onChange: (k: keyof ConfigData, v: string) => void }) {
  const [showKey, setShowKey] = useState(false);

  return (
    <div className="cfg-tab-content">
      <div className="cfg-section">
        <h3><Server size={18} /> API Endpoint</h3>
        <div className="cfg-field">
          <label htmlFor="cfg-api-base">Base URL</label>
          <input id="cfg-api-base" type="text" value={config.apiBase}
            onChange={e => onChange('apiBase', e.target.value)}
            placeholder="http://mbasic8.pikamc.vn:25246/v1"
            autoComplete="off" />
        </div>
        <div className="cfg-field">
          <label htmlFor="cfg-api-key">API Key</label>
          <div className="cfg-input-with-btn">
            <input id="cfg-api-key" type={showKey ? 'text' : 'password'} value={config.apiKey}
              onChange={e => onChange('apiKey', e.target.value)}
              placeholder="sk-..."
              autoComplete="new-password" />
            <button type="button" className="cfg-icon-btn" onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Ẩn key' : 'Hiện key'}>
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div className="cfg-field">
          <label htmlFor="cfg-embed-model">Embed Model</label>
          <input id="cfg-embed-model" type="text" value={config.embedModel}
            onChange={e => onChange('embedModel', e.target.value)}
            placeholder="openrouter/openai/text-embedding-3-large"
            autoComplete="off" />
        </div>
        <div className="cfg-field">
          <label htmlFor="cfg-chat-model">Chat Model</label>
          <input id="cfg-chat-model" type="text" value={config.chatModel}
            onChange={e => onChange('chatModel', e.target.value)}
            placeholder="oc/deepseek-v4-flash-free"
            autoComplete="off" />
        </div>
      </div>
    </div>
  );
}

// ── Rules Tab ──
function RulesTab({ config, onChange }: { config: ConfigData; onChange: (k: keyof ConfigData, v: string) => void }) {
  return (
    <div className="cfg-tab-content">
      <div className="cfg-section">
        <h3><FileText size={18} /> System Prompt Rules</h3>
        <p className="cfg-hint">Những rule này được inject vào system prompt khi chat. Mỗi dòng là một rule.</p>
        <div className="cfg-field">
          <label htmlFor="cfg-rules">Rules</label>
          <textarea id="cfg-rules" rows={12} value={config.rules}
            onChange={e => onChange('rules', e.target.value)}
            placeholder={'1. Chỉ trả lời từ dữ liệu Sổ Tay Nhân Viên\n2. Không bịa thông tin\n3. ...'} />
        </div>
      </div>
    </div>
  );
}

// ── Documents Tab ──
function DocumentsTab({ embed, onUpload }: { embed: EmbedData; onUpload: (f: File) => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMsg('');
    try {
      await onUpload(file);
      setMsg(`✅ Upload thành công — đã re-embed`);
    } catch (err) {
      setMsg(`❌ ${err}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="cfg-tab-content">
      <div className="cfg-section">
        <h3><Upload size={18} /> Tài liệu Sổ Tay Nhân Viên</h3>
        <div className="cfg-status-grid">
          <div className="cfg-stat"><span className="cfg-stat-label">Trạng thái</span>
            <span className={`cfg-stat-val ${embed.ready ? 'cfg-stat-ok' : 'cfg-stat-na'}`}>
              {embed.ready ? '✅ Sẵn sàng' : '❌ Chưa có dữ liệu'}
            </span>
          </div>
          {embed.ready && (
            <>
              <div className="cfg-stat"><span className="cfg-stat-label">Số chunks</span>
                <span className="cfg-stat-val">{embed.totalChunks}</span>
              </div>
              <div className="cfg-stat"><span className="cfg-stat-label">Dung lượng</span>
                <span className="cfg-stat-val">{embed.fileSize > 0 ? `${(embed.fileSize / 1024).toFixed(0)} KB` : '-'}</span>
              </div>
              {embed.docUpdatedAt && (
                <div className="cfg-stat"><span className="cfg-stat-label">Cập nhật</span>
                  <span className="cfg-stat-val">{new Date(embed.docUpdatedAt).toLocaleString('vi-VN')}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="cfg-upload-area">
          <label className="cfg-upload-btn" htmlFor="cfg-file-upload">
            {uploading ? <Loader2 size={18} className="spin" /> : <Upload size={18} />}
            {uploading ? 'Đang xử lý...' : 'Chọn file .docx để upload'}
          </label>
          <input
            ref={fileRef}
            id="cfg-file-upload"
            type="file"
            accept=".docx"
            onChange={handleFile}
            disabled={uploading}
            className="cfg-hidden-input"
          />
          {msg && <p className={`cfg-upload-msg ${msg.startsWith('✅') ? 'cfg-msg-ok' : 'cfg-msg-err'}`}>{msg}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ──
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<'api' | 'rules' | 'docs'>('api');
  const [config, setConfig] = useState<ConfigData>({
    apiBase: '', apiKey: '', embedModel: '', chatModel: '', rules: '',
  });
  const [embed, setEmbed] = useState<EmbedData>({ ready: false, totalChunks: 0, docUpdatedAt: null, fileSize: 0 });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStatus(); }, []);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await api('/api/cfg/status');
      if (res.success) {
        setConfig(res.config);
        setEmbed(res.embed);
      }
    } catch {} finally { setLoading(false); }
  };

  const handleConfigChange = (k: keyof ConfigData, v: string) => {
    setConfig(prev => ({ ...prev, [k]: v }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await api('/api/cfg/save', {
        method: 'POST',
        body: JSON.stringify({
          apiBase: config.apiBase || undefined,
          apiKey: config.apiKey || undefined,
          embedModel: config.embedModel || undefined,
          chatModel: config.chatModel || undefined,
          rules: config.rules || undefined,
        }),
      });
      if (res.success) setSaveMsg('✅ Đã lưu');
      else setSaveMsg('❌ ' + (res.error || 'Lỗi'));
    } catch {
      setSaveMsg('❌ Lỗi kết nối');
    } finally { setSaving(false); }
  };

  const handleUpload = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/cfg/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json();
    if (data.success) {
      await loadStatus();
    } else {
      throw new Error(data.error || 'Upload thất bại');
    }
  };

  const handleLogout = async () => {
    await api('/api/cfg/logout', { method: 'POST' });
    onLogout();
  };

  if (loading) {
    return (
      <div className="cfg-root cfg-loading">
        <Loader2 size={32} className="spin" />
        <p>Đang tải cấu hình...</p>
      </div>
    );
  }

  return (
    <div className="cfg-root">
      {/* Header */}
      <header className="cfg-header">
        <div className="cfg-header-left">
          <div className="cfg-header-icon"><Settings size={22} /></div>
          <div>
            <h1>Cấu hình hệ thống</h1>
            <p className="cfg-header-sub">TDConsulting AI — Quản lý API, Rules & Tài liệu</p>
          </div>
        </div>
        <div className="cfg-header-actions">
          <button className="cfg-btn cfg-btn-outline" onClick={loadStatus} aria-label="Làm mới">
            <RefreshCw size={15} /> Làm mới
          </button>
          <button className="cfg-btn cfg-btn-outline" onClick={handleLogout} aria-label="Đăng xuất">
            <LogOut size={15} /> Thoát
          </button>
        </div>
      </header>

      {/* Tabs */}
      <nav className="cfg-tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'api'} className={`cfg-tab ${tab === 'api' ? 'active' : ''}`}
          onClick={() => setTab('api')}><Server size={16} /> API Config</button>
        <button role="tab" aria-selected={tab === 'rules'} className={`cfg-tab ${tab === 'rules' ? 'active' : ''}`}
          onClick={() => setTab('rules')}><FileText size={16} /> Rules</button>
        <button role="tab" aria-selected={tab === 'docs'} className={`cfg-tab ${tab === 'docs' ? 'active' : ''}`}
          onClick={() => setTab('docs')}><Upload size={16} /> Documents</button>
      </nav>

      {/* Body */}
      <main className="cfg-body">
        {tab === 'api' && <ApiConfigTab config={config} onChange={handleConfigChange} />}
        {tab === 'rules' && <RulesTab config={config} onChange={handleConfigChange} />}
        {tab === 'docs' && <DocumentsTab embed={embed} onUpload={handleUpload} />}
      </main>

      {/* Footer */}
      <footer className="cfg-footer">
        {saveMsg && <span className={`cfg-save-msg ${saveMsg.startsWith('✅') ? 'ok' : 'err'}`}>{saveMsg}</span>}
        <button className="cfg-btn cfg-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
          Lưu cấu hình
        </button>
      </footer>
    </div>
  );
}

// ── Page ──
export default function CfgPage() {
  const [authed, setAuthed] = useState(false);

  // Check token on mount
  useEffect(() => {
    fetch('/api/cfg/status', { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setAuthed(true); })
      .catch(() => {});
  }, []);

  if (!authed) return <LoginForm onLogin={() => setAuthed(true)} />;
  return <Dashboard onLogout={() => setAuthed(false)} />;
}
