export interface OutlineItem {
  id: string;
  text: string;
  level: number;
  page: number;
}

export const OUTLINE_ITEMS: OutlineItem[] = [
  { id: 'sec-1', text: 'PHẦN 1: GIỚI THIỆU CÔNG TY', level: 1, page: 4 },
  { id: 'sec-2', text: '1.1. Thông tin doanh nghiệp', level: 2, page: 4 },
  { id: 'sec-3', text: '1.2. Tầm nhìn', level: 2, page: 4 },
  { id: 'sec-4', text: '1.3. Giá trị cốt lõi', level: 2, page: 4 },
  { id: 'sec-5', text: '1.4. Sơ đồ tổ chức - TD Consulting', level: 2, page: 4 },
  { id: 'sec-6', text: '1.5. Sơ đồ tổ chức - TD Games', level: 2, page: 4 },
  { id: 'sec-7', text: 'PHẦN 1B: TIÊU CHÍ HÀNH VI & VĂN HÓA LÀM VIỆC', level: 1, page: 6 },
  { id: 'sec-8', text: 'PHẦN 2: TỔNG ĐÃI NGỘ', level: 1, page: 7 },
  { id: 'sec-9', text: '2.1. Lương Gross', level: 2, page: 7 },
  { id: 'sec-10', text: '2.2. Hoa hồng (Commission) & Thưởng KPI', level: 2, page: 7 },
  { id: 'sec-11', text: '2.3. Phúc lợi công ty', level: 2, page: 7 },
  { id: 'sec-12', text: '2.4. Nhân viên thử việc', level: 2, page: 8 },
  { id: 'sec-13', text: '2.5. Career Path', level: 2, page: 8 },
  { id: 'sec-14', text: 'PHẦN 3: QUY CHẾ TEAM HEADHUNT', level: 1, page: 9 },
  { id: 'sec-15', text: '3.1. Định nghĩa các thuật ngữ', level: 2, page: 9 },
  { id: 'sec-16', text: '3.2. Công thức tính Commission theo cấp bậc', level: 2, page: 9 },
  { id: 'sec-17', text: '3.3. Ví dụ minh họa - Junior Headhunt', level: 2, page: 9 },
  { id: 'sec-18', text: '3.4. Ví dụ minh họa - Senior Headhunt', level: 2, page: 10 },
  { id: 'sec-19', text: 'PHẦN 4: NỘI QUY LAO ĐỘNG', level: 1, page: 11 },
  { id: 'sec-20', text: '4.1. Quy chế đi muộn / về sớm & tính công', level: 2, page: 11 },
  { id: 'sec-21', text: '4.2. Quy chế xin nghỉ & nghỉ phép', level: 2, page: 11 },
  { id: 'sec-22', text: '4.3. Quy chế quên chấm công', level: 2, page: 11 },
  { id: 'sec-23', text: '4.4. Quy trình nghỉ việc', level: 2, page: 11 },
  { id: 'sec-24', text: 'PHẦN 5: CHÍNH SÁCH HỖ TRỢ THAI SẢN', level: 1, page: 13 },
  { id: 'sec-25', text: '5.1. Trong thời gian nghỉ thai sản', level: 2, page: 13 },
  { id: 'sec-26', text: '5.2. Nuôi con nhỏ dưới 24 tháng', level: 2, page: 13 },
  { id: 'sec-27', text: '5.3. Các hỗ trợ khác', level: 2, page: 13 },
  { id: 'sec-28', text: 'PHẦN 5B: CHÍNH SÁCH LÀM VIỆC HYBRID', level: 1, page: 14 },
  { id: 'sec-29', text: 'PHẦN 6: HỆ THỐNG CÔNG NGHỆ TDC', level: 1, page: 14 },
  { id: 'sec-30', text: 'PHẦN 7: QUY ĐỊNH GIAO TIẾP NỘI BỘ', level: 1, page: 15 },
  { id: 'sec-31', text: '7.1. Kênh làm việc chính thức', level: 2, page: 15 },
  { id: 'sec-32', text: '7.2. Hạn chế trong giao tiếp công việc', level: 2, page: 15 },
  { id: 'sec-33', text: 'PHẦN 8: QUY CHẾ THƯỞNG THÁNG 13 & KPI (2026)', level: 1, page: 16 },
  { id: 'sec-34', text: '8.1. Đối tượng & Mục đích', level: 2, page: 16 },
  { id: 'sec-35', text: '8.2. Quy định Thưởng Tháng 13', level: 2, page: 16 },
  { id: 'sec-36', text: '8.3. Chỉ tiêu KPI duy trì công việc', level: 2, page: 16 },
  { id: 'sec-37', text: '8.4. Đánh giá khi không đạt KPI', level: 2, page: 16 },
  { id: 'sec-38', text: 'PHẦN 9: QUY ĐỊNH TRUYỀN THÔNG & BRANDING', level: 1, page: 17 },
  { id: 'sec-39', text: '9.1. Nguyên tắc đăng tuyển', level: 2, page: 17 },
  { id: 'sec-40', text: '9.2. Yêu cầu Branding cá nhân (BD & Headhunt)', level: 2, page: 17 },
  { id: 'sec-41', text: 'PHẦN 10: BÁO CÁO CÔNG VIỆC HÀNG TUẦN', level: 1, page: 18 },
  { id: 'sec-42', text: 'PHẦN 11: NGUYÊN TẮC LÀM DAILY PLAN', level: 1, page: 22 },
  { id: 'sec-43', text: '11.1. Nguyên tắc viết Daily Plan', level: 2, page: 22 },
  { id: 'sec-44', text: '11.2. Mỗi task BẮT BUỘC có target đo được', level: 2, page: 22 },
  { id: 'sec-45', text: '11.3. Daily Plan gắn với KẾT QUẢ', level: 2, page: 22 },
  { id: 'sec-46', text: '11.4. Random Check', level: 2, page: 22 },
  { id: 'sec-47', text: '11.5. Daily Plan là cam kết cá nhân', level: 2, page: 22 },
];

export function findPageForSection(secName: string): number {
  // Decode HTML entities (e.g. &amp; → &)
  const decoded = secName.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const cleanSearch = decoded.trim().toLowerCase();

  // 1. Khớp chính xác
  const exactMatch = OUTLINE_ITEMS.find(item => {
    const cleanItemText = item.text.toLowerCase()
      .replace(/^(phần\s+\d+[a-z]?:\s*|\d+(\.\d+)*\.\s*)/i, '')
      .trim();
    return cleanItemText === cleanSearch || item.text.toLowerCase() === cleanSearch;
  });
  if (exactMatch) return exactMatch.page;

  // 2. Khớp tương đối (substring)
  let bestMatch = OUTLINE_ITEMS[0];
  let bestScore = 0;
  
  OUTLINE_ITEMS.forEach(item => {
    const cleanItemText = item.text.toLowerCase()
      .replace(/^(phần\s+\d+[a-z]?:\s*|\d+(\.\d+)*\.\s*)/i, '')
      .trim();
      
    // Khớp chuỗi con
    if (cleanSearch.includes(cleanItemText) || cleanItemText.includes(cleanSearch)) {
      let score = 10;
      if (cleanItemText === cleanSearch) score += 20;
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    } else {
      // 3. Fallback: Khớp theo số lượng từ trùng lặp (keyword overlap)
      const searchWords = cleanSearch.split(/\s+/).filter(w => w.length > 3); // Lấy từ >= 4 ký tự (bỏ qua 'và', 'của'...)
      const itemWords = cleanItemText.split(/\s+/).filter(w => w.length > 3);
      let commonWords = 0;
      for (const w of searchWords) {
        if (itemWords.includes(w)) commonWords++;
      }
      
      // Tính điểm thưởng nếu có từ khoá trùng lặp, nhưng trọng số thấp hơn so với substring match
      if (commonWords > 0) {
        let score = commonWords;
        // Ưu tiên các mục có ít từ để tránh match bậy (như match với câu quá dài)
        score = score / itemWords.length;
        
        if (score > bestScore) {
          bestScore = score;
          bestMatch = item;
        }
      }
    }
  });
  
  return bestMatch.page;
}
