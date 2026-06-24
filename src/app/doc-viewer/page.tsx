'use client';

import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Download, ExternalLink, Loader2, FileText } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { findPageForSection } from '@/lib/document-outline';

export default function DocViewerPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [sectionName, setSectionName] = useState('');
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sec = params.get('section') || '';
    if (sec) {
      setSectionName(sec);
      setCurrentPage(findPageForSection(sec));
    }
    const timer = setTimeout(() => setLoading(false), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="pure-doc-viewer">
      {/* Minimal toolbar */}
      <header className="pure-toolbar">
        <button className="pure-toolbar-btn" onClick={() => router.push('/')} title="Quay lại">
          <ArrowLeft size={18} />
        </button>
        <div className="pure-doc-info">
          <FileText size={16} className="pure-doc-icon" />
          <span className="pure-doc-title">Sổ Tay Nhân Viên</span>
          {sectionName && (
            <span className="pure-doc-section">— Tr. {currentPage}: {sectionName}</span>
          )}
        </div>
        <div className="pure-toolbar-right">
          <a href="/sotaynhanvien.pdf" target="_blank" className="pure-toolbar-btn" title="Mở PDF">
            <ExternalLink size={18} />
          </a>
          <a href="/api/doc/serve-docx" download className="pure-btn-primary" title="Tải file Word">
            <Download size={16} />
            <span>DOCX</span>
          </a>
          <a href="/sotaynhanvien.pdf" download className="pure-btn-primary" title="Tải file PDF">
            <Download size={16} />
            <span>PDF</span>
          </a>
        </div>
      </header>

      {/* PDF viewer - full remaining height */}
      <div className="pure-viewport">
        {loading ? (
          <div className="pure-loading">
            <Loader2 size={28} className="spin" />
          </div>
        ) : (
          <iframe
            key={currentPage}
            ref={iframeRef}
            src={`/sotaynhanvien.pdf#page=${currentPage}`}
            className="pure-iframe"
            title="Sổ Tay Nhân Viên PDF"
          />
        )}
      </div>

      <style jsx global>{`
        .pure-doc-viewer {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #525659;
          font-family: 'Inter', system-ui, sans-serif;
          overflow: hidden;
        }

        .pure-toolbar {
          display: flex;
          align-items: center;
          gap: 12px;
          height: 52px;
          padding: 0 16px;
          background: #323639;
          color: #fff;
          z-index: 10;
          flex-shrink: 0;
        }

        .pure-toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 6px;
          background: transparent;
          color: #bdc1c6;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .pure-toolbar-btn:hover {
          background: rgba(255,255,255,0.1);
          color: #fff;
        }

        .pure-doc-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
        }
        .pure-doc-icon {
          color: #9aa0a6;
          flex-shrink: 0;
        }
        .pure-doc-title {
          font-size: 14px;
          font-weight: 500;
          color: #e8eaed;
          white-space: nowrap;
        }
        .pure-doc-section {
          font-size: 12px;
          color: #9aa0a6;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .pure-toolbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pure-btn-primary {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 30px;
          padding: 0 12px;
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 6px;
          background: transparent;
          color: #e8eaed;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
          transition: background 0.15s;
        }
        .pure-btn-primary:hover {
          background: rgba(255,255,255,0.1);
        }

        .pure-viewport {
          flex: 1;
          background: #525659;
          overflow: hidden;
          position: relative;
        }

        .pure-iframe {
          width: 100%;
          height: 100%;
          border: none;
        }

        .pure-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #9aa0a6;
        }
        .spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
