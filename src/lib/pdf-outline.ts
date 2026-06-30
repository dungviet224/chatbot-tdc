
import { supabaseAdmin } from './supabase';
import { loadOutlineItems, saveOutlineItems, OutlineItem } from './outline-store';
import { getConfig } from './cfg-store';

export async function autoSyncOutlinePagesFromPdf(pdfBuffer: Buffer): Promise<number> {
  console.log('[PDF-Outline] Bắt đầu tự động quét trang từ PDF...');
  
  // 1. Phân tích PDF thành mảng các trang văn bản
  const pdfParseModule = require('pdf-parse/lib/pdf-parse.js');
  const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default || pdfParseModule);

  const options = {
    pagerender: function(pageData: any) {
        return pageData.getTextContent().then(function(textContent: any) {
            let text = '';
            for (let item of textContent.items) {
                text += item.str + ' ';
            }
            return text + '\n---PAGE_BREAK---\n';
        });
    }
  };
  
  const data = await pdfParse(pdfBuffer, options);
  const pages = data.text.split('---PAGE_BREAK---').map((p: string) => p.replace(/\s+/g, ' ').toLowerCase());
  
  // 2. Tải Outline hiện tại từ DB
  const outlineItems = await loadOutlineItems();
  let updatedCount = 0;
  let lastKnownPage = 1;
  
  // 3. Nhận diện các trang Mục lục (TOC) động bằng cách đếm mật độ tiêu đề
  // Nếu một trang chứa quá nhiều tiêu đề mục lục (ví dụ > 5), nó chắc chắn là trang Mục lục.
  const tocPages = new Set<number>();
  for (let i = 0; i < pages.length; i++) {
      let headingsOnPage = 0;
      for (const item of outlineItems) {
          const searchStr = item.text.replace(/\s+/g, ' ').toLowerCase();
          if (searchStr.length >= 3 && pages[i].includes(searchStr)) {
              headingsOnPage++;
          }
      }
      // Nếu trang có quá nhiều tiêu đề (ví dụ > 15), chắc chắn là trang Mục lục để bỏ qua. 
      // (Không để số quá thấp vì một trang nội dung bình thường có thể chứa 5-6 mục con ngắn).
      if (headingsOnPage > 15) {
          tocPages.add(i);
          console.log(`[PDF-Outline] Nhận diện Trang ${i + 1} là trang Mục lục (chứa ${headingsOnPage} tiêu đề)`);
      }
  }

  // 4. Quét từng mục outline để tìm trang (bỏ qua các trang TOC đã nhận diện)
  const updatedOutline = outlineItems.map(item => {
     const searchStr = item.text.replace(/\s+/g, ' ').toLowerCase();
     
     // Bỏ qua các mục quá ngắn
     if (searchStr.length < 3) return item;

     // Tìm trong mảng pages, luôn tìm từ trang gần nhất trở đi để số trang không bao giờ bị lùi (time travel)
     let foundPage = -1;
     let startIndex = Math.max(0, lastKnownPage - 1);
     
     for (let i = startIndex; i < pages.length; i++) {
         if (tocPages.has(i)) continue; // Bỏ qua trang Mục lục động

         if (pages[i].includes(searchStr)) {
             foundPage = i + 1; // 1-indexed
             break;
         }
     }
     
     if (foundPage !== -1) {
         lastKnownPage = foundPage;
         if (item.page !== foundPage) {
             updatedCount++;
             return { ...item, page: foundPage };
         }
     } else {
         // Thử tìm chuỗi không có tiền tố số (ví dụ: "1.1. Thông tin" -> "thông tin")
         const strippedSearch = searchStr.replace(/^(phần\s+\d+[a-z]?:\s*|\d+(\.\d+)*\.\s*)/i, '').trim();
         if (strippedSearch.length >= 15) {
             for (let i = startIndex; i < pages.length; i++) {
                 if (tocPages.has(i)) continue;

                 if (pages[i].includes(strippedSearch)) {
                     foundPage = i + 1;
                     break;
                 }
             }
         }
         
         if (foundPage !== -1) {
             lastKnownPage = foundPage;
             if (item.page !== foundPage) {
                 updatedCount++;
                 return { ...item, page: foundPage };
             }
         } else {
             // Nếu hoàn toàn không tìm thấy, ép số trang bằng lastKnownPage để tránh lưu lại dữ liệu rác cũ
             if (item.page !== lastKnownPage) {
                 updatedCount++;
                 return { ...item, page: lastKnownPage };
             }
         }
     }
     
     return item;
  });
  
  if (updatedCount > 0) {
      await saveOutlineItems(updatedOutline);
      console.log(`[PDF-Outline] ✅ Đã tự động cập nhật số trang cho ${updatedCount} mục lục`);
  } else {
      console.log(`[PDF-Outline] Không có thay đổi nào về trang.`);
  }
  
  return updatedCount;
}

export async function runAutoSyncFromSupabasePdf() {
    try {
        const { data: files } = await supabaseAdmin.storage.from('documents').list();
        const pdfFile = files?.find(f => f.name.toLowerCase().endsWith('.pdf'));
        if (!pdfFile) return;
        
        console.log(`[PDF-Outline] Đang tải PDF từ Storage để sync: ${pdfFile.name}`);
        const { data, error } = await supabaseAdmin.storage.from('documents').download(pdfFile.name);
        if (error || !data) return;
        
        const buffer = Buffer.from(await data.arrayBuffer());
        await autoSyncOutlinePagesFromPdf(buffer);
    } catch (e) {
        console.error('[PDF-Outline] Lỗi đồng bộ tự động từ Supabase PDF:', e);
    }
}

