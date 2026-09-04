import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const markedMinPath = path.join(__dirname, '../src/lib/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : globalThis.marked));`);
const marked = markedFn({}, globalThis);
globalThis.marked = marked;

const lmdxModule = await import('../src/components/cores/component_parser.js');
lmdxModule.initLmdxComponentsParser();

// Exact text from user SSE chunks:
const chunks = [
  "\u003cWriting",
  "Block variant=\"email\" title=\"Thông báo bảo trì hệ thống định kỳ\"\u003e\n\u003c",
  "Option title=\"Chuyên nghiệp & Rõ ràng\" subject=\"Thông báo lịch bảo trì hệ thống định kỳ cuối tuần này\"\u003e\nK",
  "ính gửi Quý khách hàng,\n\nChúng tôi xin trân trọng thông báo về lịch bảo trì định kỳ nhằm nâng cấp chất",
  " lượng hạ tầng và tối ưu hóa trải nghiệm dịch vụ.\n\nChi tiết thời gian bảo trì:\n* **Thời gian bắt đầu:** ",
  "23:00, Thứ Bảy (05/09/2026)\n* **Thời gian dự",
  " kiến hoàn tất:** 04:00, Chủ Nhật (06/09/2026)\n*",
  " **Ảnh hưởng dự kiến:** Hệ thống và các dịch vụ trực tuyến có thể tạm thời gián đoạn trong khung giờ trên",
  ".\n\nChúng tôi rất xin lỗi vì sự bất tiện này và mong nhận được sự thông cảm từ Quý khách hàng. M",
  "ọi thắc mắc xin vui lòng liên hệ qua email này để được hỗ trợ kịp thời.\n\nTrân trọng,\n",
  "[Tên Công Ty/Bộ phận Hỗ trợ]\n\u003c/Option\u003e\n\u003cOption title=\"Ngắn gọn & Tr",
  "ực diện\" subject=\"[Thông báo] Lịch bảo trì hệ thống cuối tuần này\"\u003e\nChào Quý khách hàng,\n\n",
  "Để nâng cấp hệ thống và mang lại trải nghiệm tốt hơn, chúng tôi sẽ tiến hành bảo trì định kỳ vào cuối tuần này.",
  "\n\n* **Thời gian:** Từ 23:00 Thứ Bảy (05/09/2026) đến",
  " 04:00 Chủ Nhật (06/09/2026).\n* **Ảnh",
  " hưởng:** Dịch vụ sẽ tạm ngưng hoạt động trong thời gian bảo trì.\n\nHệ thống sẽ tự động hoạt động trở lại ngay",
  " sau khi hoàn tất quá trình nâng cấp. Cảm ơn sự hợp tác và kiên nhẫn của Quý khách.",
  "\n\nTrân trọng,\n[Tên Công Ty]\n\u003c/Option\u003e\n\u003c/WritingBlock\u003e"
];

let fullText = chunks.join('');
console.log('--- FULL TEXT ---');
console.log(fullText);
console.log('--- MARKED PARSE RESULT ---');
const res = marked.parse(fullText);
console.log(res);
