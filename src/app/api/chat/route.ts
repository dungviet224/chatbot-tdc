import { NextRequest, NextResponse } from 'next/server';
import { loadAndEmbedDocument, retrieveRelevantChunks } from '@/lib/docLoader';

const API_BASE = process.env.CHAT_API_BASE || 'http://mbasic8.pikamc.vn:25246/v1';
const API_KEY = process.env.CHAT_API_KEY || 'sk-987312a0a1689afc-m1wrjj-666571e0';
const MODEL = process.env.CHAT_MODEL || 'oc/deepseek-v4-flash-free';

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Đảm bảo document đã được load & embedded
    await loadAndEmbedDocument();

    // Lấy câu hỏi cuối cùng của user
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const userQuery = lastUserMsg?.content ?? '';

    // Lấy chunks liên quan bằng embedding + cosine similarity
    const relevantChunks = await retrieveRelevantChunks(userQuery, 10);

    // Merge chunks liền kề để tránh đứt đoạn nội dung
    const mergedChunks = relevantChunks
      .sort((a, b) => a.id - b.id)
      .reduce((acc, chunk) => {
        if (acc.length === 0) return [chunk];
        const last = acc[acc.length - 1];
        // Nếu chunk liền kề (cùng section, id cách nhau 1) → gộp
        if (chunk.id === last.id + 1) {
          acc[acc.length - 1] = {
            ...last,
            content: last.content + '\n\n' + chunk.content,
          };
          return acc;
        }
        return [...acc, chunk];
      }, [] as typeof relevantChunks);

    const contextText = mergedChunks.map((c, i) => `[Đoạn ${i + 1}]\n${c.content}`).join('\n\n---\n\n');

    const systemPrompt = [
      'Bạn là trợ lý AI nội bộ của TDConsulting.',
      'Nhiệm vụ DUY NHẤT: trả lời câu hỏi về nội quy, chính sách công ty DỰA TRỰC TIẾP vào dữ liệu bên dưới.',
      '',
      '=== DỮ LIỆU SỔ TAY NHÂN VIÊN ===',
      contextText,
      '=== HẾT DỮ LIỆU ===',
      '',
      'QUY TẮC BẮT BUỘC:',
      '1. Thông tin trả lời PHẢI CÓ trong dữ liệu trên. Tuyệt đối không bịa, suy đoán, hay thêm thông tin tự biết.',
      '2. Được phép suy luận ngữ nghĩa: nếu dữ liệu có "Tổng Giám Đốc" mà hỏi "ai điều hành" → trả lời được. "người đại diện" = "Tổng Giám Đốc". "người đứng đầu" = "Tổng Giám Đốc". Đây không phải bịa, đây là suy luận từ dữ liệu.',
      '3. Nếu thông tin THỰC SỰ KHÔNG CÓ trong dữ liệu (kể cả suy luận ngữ nghĩa): trả lời "Tôi không tìm thấy thông tin này trong Sổ Tay Nhân Viên. Vui lòng liên hệ HR để được hỗ trợ."',
      '4. Nếu câu hỏi KHÔNG LIÊN QUAN đến chính sách/nội quy/nhân sự công ty: trả lời "Tôi chỉ hỗ trợ các câu hỏi liên quan đến Sổ Tay Nhân Viên TDConsulting."',
      '5. Không thay đổi bất kỳ con số, ngày tháng, tỉ lệ nào trong tài liệu.',
      '',
      'ĐỊNH DẠNG TRẢ LỜI:',
      '- Tiếng Việt, ngắn gọn, chuyên nghiệp',
      '- Dùng **in đậm** cho số liệu quan trọng (ngày, %, deadline)',
      '- Dùng "- item" khi liệt kê nhiều mục',
      '- Xưng "tôi", gọi người dùng là "bạn"',
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

    // Stream response về client
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = ''; // ← buffer dòng chưa hoàn chỉnh

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Giữ lại phần chưa hoàn chỉnh (sau \n cuối) trong buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) continue;

              const data = trimmed.slice(6).trim();
              if (data === '[DONE]') {
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
                // bỏ qua dòng JSON lỗi
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
