import { NextRequest, NextResponse } from 'next/server';
import { loadAndEmbedDocument, retrieveRelevantChunks } from '@/lib/docLoader';
import { getConfig } from '@/lib/cfg-store';

const API_BASE = process.env.CHAT_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
const API_KEY = process.env.CHAT_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
const MODEL = process.env.CHAT_MODEL || 'oc/deepseek-v4-flash-free';

interface SourceLink {
  sectionId: string;
  sectionName: string;
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Đảm bảo document đã được load & embedded
    await loadAndEmbedDocument();

    // Lấy base URL từ request headers
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    const host = req.headers.get('host') || 'chatbot-tdc.vercel.app';
    const baseUrl = `${proto}://${host}`;
    const docxUrl = `${baseUrl}/api/doc/serve-docx`;
    const docViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(docxUrl)}&embedded=true`;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const userQuery = lastUserMsg?.content ?? '';

    // Lấy chunks liên quan bằng embedding + cosine similarity
    const relevantChunks = await retrieveRelevantChunks(userQuery, 5);

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
      sourceLinks.push({
        id: sourceIndex.toString(),
        sectionId: data.sectionId,
        sectionName: name
      });
      contextLines.push(`[Nguồn ${sourceIndex}]\n${data.content}`);
      sourceIndex++;
    }

    const contextText = contextLines.join('\n\n---\n\n');

    // Đọc rules từ config
    const cfg = getConfig();
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
        '2. Khi dùng thông tin từ Nguồn nào, BẮT BUỘC chèn thẻ [Nguồn X] (X là số của Nguồn) ngay sau câu chứa thông tin đó. Ví dụ: "...hưởng 85% lương cơ bản [Nguồn 1]." (Trích dẫn phải nằm ngay vị trí nội dung, không dồn xuống cuối).',
        '3. Nếu thông tin THỰC SỰ KHÔNG CÓ trong dữ liệu: trả lời "Tôi không tìm thấy thông tin này trong Sổ Tay Nhân Viên."',
        '4. Nếu câu hỏi KHÔNG LIÊN QUAN đến chính sách/nội quy/nhân sự: trả lời "Tôi chỉ hỗ trợ các câu hỏi liên quan đến Sổ Tay Nhân Viên TDConsulting."',
        '5. Không thay đổi bất kỳ con số, ngày tháng, tỉ lệ nào trong tài liệu.',
        '',
        'ĐỊNH DẠNG TRẢ LỜI:',
        '- Tiếng Việt, ngắn gọn, chuyên nghiệp',
        '- Dùng **in đậm** cho số liệu quan trọng (ngày, %, deadline)',
        '- Dùng "- item" khi liệt kê nhiều mục',
        '- Xưng "tôi", gọi người dùng là "bạn"',
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
