import { NextRequest, NextResponse } from 'next/server';
import { retrieveRelevantChunks } from '@/lib/docLoader';
import { getConfig } from '@/lib/cfg-store';
import { findPageForSection } from '@/lib/document-outline';
import { supabaseAdmin } from '@/lib/supabase';

// ── Rate Limiting: tối đa 30 requests/phút/IP ────────────────────────────────
const _rateMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = _rateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    _rateMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true; // OK
  }
  if (entry.count >= 30) return false; // vượt giới hạn
  entry.count++;
  return true;
}

const API_BASE = process.env.CHAT_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
const API_KEY = process.env.CHAT_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
const MODEL = process.env.CHAT_MODEL || 'oc/deepseek-v4-flash-free';

interface SourceLink {
  sectionId: string;
  sectionName: string;
  tag?: string;
  pageNum?: number;
}

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Quá nhiều yêu cầu. Vui lòng chờ 1 phút.' },
        { status: 429 }
      );
    }

    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }



    const cfg = getConfig();
    const { data: files } = await supabaseAdmin.storage.from('documents').list();
    const pdfFileName = files?.find(f => f.name.toLowerCase().endsWith('.pdf'))?.name || null;
    const displayFileName = pdfFileName || cfg.docFile || 'sotaynhanvien.docx';
    
    const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${encodeURIComponent(displayFileName)}`;
    let docViewerUrl = fileUrl;
    if (displayFileName?.toLowerCase().endsWith('.docx')) {
      docViewerUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(fileUrl)}`;
    }
    
    const userMessages = messages.filter((m: any) => m.role === 'user');
    const lastUserMsg = userMessages[userMessages.length - 1];
    let userQuery = lastUserMsg?.content ?? '';

    // Nếu câu hỏi ngắn (thường là follow-up), ghép thêm ngữ cảnh từ câu hỏi liền trước
    if (userMessages.length >= 2 && userQuery.split(' ').length <= 20) {
      const prevUserMsg = userMessages[userMessages.length - 2];
      // Nối câu trước và câu hiện tại để embedding model hiểu được Context
      userQuery = `${prevUserMsg.content}. ${userQuery}`;
    }

    // Lấy chunks liên quan bằng embedding + cosine similarity (8 chunks để đảm bảo đủ ngữ cảnh)
    const relevantChunks = await retrieveRelevantChunks(userQuery, 8);

    // Gom nhóm chunks theo sectionName
    const sectionsMap = new Map<string, { sectionId: string; content: string }>();
    for (const c of relevantChunks) {
      const name = c.sectionName || 'Sổ Tay Nhân Viên';
      if (!sectionsMap.has(name)) {
        sectionsMap.set(name, { sectionId: c.sectionId || '', content: c.content });
      } else {
        sectionsMap.get(name)!.content += '\n' + c.content;
      }
    }

    const sourceLinks: (SourceLink & { id: string })[] = [];
    const contextLines: string[] = [];
    let sourceIndex = 1;
    for (const [name, data] of sectionsMap.entries()) {
      let tagValue = name;
      const match = name.match(/^(PHẦN\s+\d+[A-Z]?|\d+\.\d+\.\d+|\d+\.\d+|\d+)/i);
      if (match) {
        let val = match[1].toUpperCase();
        val = val.replace(/\.$/, '');
        if (/^\d/.test(val)) {
          val = 'PHẦN ' + val;
        }
        tagValue = val;
      }
      const tag = `[${tagValue}]`;

      const pageNum = await findPageForSection(name);
      sourceLinks.push({
        id: sourceIndex.toString(),
        sectionId: data.sectionId,
        sectionName: name,
        tag: tag,
        pageNum: pageNum
      });
      contextLines.push(`Tag nguồn: ${tag}\nTên phần: ${name} (Trang ${pageNum})\nNội dung:\n${data.content}`);
      sourceIndex++;
    }

    const contextText = contextLines.join('\n\n---\n\n');

    // Đọc rules từ config
    const userRules = cfg.rules || '';

    const systemPrompt = [
      'Bạn là trợ lý AI nội bộ của TDConsulting.',
      'Nhiệm vụ DUY NHẤT: trả lời câu hỏi về nội quy, chính sách công ty DỰA TRỰC TIẾP vào dữ liệu bên dưới.',
      '',
      '=== DỮ LIỆU SỔ TAY NHÂN VIÊN ===',
      contextText,
      '=== HẾT DỮ LIỆU ===',
      '',
      userRules,
      '',
      ...(userRules ? [] : [
        'QUY TẮC BẮT BUỘC:',
        '1. Thông tin trả lời PHẢI CÓ trong dữ liệu trên. Tuyệt đối không bịa, suy đoán, hay thêm thông tin tự biết.',
        '2. MỖI CÂU TRẢ LỜI ĐỀU PHẢI BẮT ĐẦU bằng Tag nguồn tương ứng. Ví dụ: "[PHẦN 4] Theo quy định, nhân viên được hưởng..."',
        '3. Nếu thông tin THỰC SỰ KHÔNG CÓ trong dữ liệu: trả lời "Tôi không tìm thấy thông tin này trong Sổ Tay Nhân Viên."',
        '4. Nếu câu hỏi KHÔNG LIÊN QUAN đến chính sách/nội quy/nhân sự: trả lời "Tôi chỉ hỗ trợ các câu hỏi liên quan đến Sổ Tay Nhân Viên TDConsulting."',
        '5. Không thay đổi bất kỳ con số, ngày tháng, tỉ lệ nào trong tài liệu.',
        '',
        'ĐỊNH DẠNG TRẢ LỜI:',
        '- Tiếng Việt, trình bày chi tiết, đầy đủ, rõ ràng và chuyên nghiệp',
        '- Giải thích cặn kẽ các ý quan trọng trong chính sách để người dùng dễ hiểu',
        '- Dùng **in đậm** cho số liệu quan trọng (ngày, %, deadline)',
        '- Dùng "- item" khi liệt kê nhiều mục',
        '- Xưng "tôi", gọi người dùng là "bạn"',
        '- TUYỆT ĐỐI KHÔNG sử dụng biểu tượng cảm xúc (emoji / icon) trong văn bản',
      ]),
      '',
    ].join('\n');

    const requestMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter((m: { role: string }) => m.role !== 'system'),
    ];

    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: requestMessages,
        stream: true,
        temperature: 0.15,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json(
        { error: `API Error: ${response.status} - ${errText}` },
        { status: response.status }
      );
    }

    // Stream response về client, kèm sourceLinks ở cuối
    const encoder = new TextEncoder();
    const sourcePayload = JSON.stringify({ sources: sourceLinks, docViewerUrl });

    const readable = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;

              const data = trimmed.slice(6).trim();
              if (data === '[DONE]') {
                // Gửi sources trước [DONE]
                if (sourceLinks.length > 0) {
                  controller.enqueue(encoder.encode(`data: ${sourcePayload}\n\n`));
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'));
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                  );
                }
              } catch {
                // skip
              }
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Chat API]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
