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

const userInput = `<WritingBlock variant="email" title="Thông báo bảo trì hệ thống định kỳ cuối tuần">
<Option title="Trang trọng" subject="Thông báo lịch bảo trì hệ thống định kỳ cuối tuần này">
Kính gửi Quý khách hàng,

Chúng tôi xin trân trọng thông báo về lịch bảo trì hệ thống định kỳ nhằm nâng cấp chất lượng dịch vụ và tối ưu hóa trải nghiệm của Quý khách.

Chi tiết thời gian bảo trì:
* **Thời gian bắt đầu:** 23:00, Thứ Bảy (05/09/2026)
* **Thời gian dự kiến hoàn tất:** 06:00, Chủ Nhật (06/09/2026)
* **Ảnh hưởng:** Trong khoảng thời gian trên, hệ thống và các dịch vụ trực tuyến có thể sẽ gián đoạn tạm thời.

Chúng tôi rất mong Quý khách thông cảm vì sự bất tiện này và khuyến nghị Quý khách hoàn thành các giao dịch quan trọng trước thời điểm bảo trì. Mọi thắc mắc xin vui lòng liên hệ bộ phận hỗ trợ qua email hỗ trợ hoặc hotline.

Trân trọng,
Đội ngũ vận hành hệ thống
</Option>

<Option title="Ngắn gọn" subject="Thông báo gián đoạn dịch vụ do bảo trì hệ thống (Cuối tuần này)">
Chào Quý khách hàng,

Chúng tôi sẽ tiến hành bảo trì hệ thống định kỳ vào cuối tuần này để nâng cấp hiệu năng dịch vụ.

* **Thời gian:** Từ 23:00 Thứ Bảy (05/09/2026) đến 06:00 Chủ Nhật (06/09/2026).
* **Tác động:** Dịch vụ có thể tạm ngưng gián đoạn trong khung giờ trên.

Rất mong Quý khách thông cảm cho sự gián đoạn ngoài ý muốn này. Vui lòng liên hệ với chúng tôi nếu Quý khách cần hỗ trợ gấp.

Trân trọng,
Đội ngũ hỗ trợ khách hàng
</Option>

<Option title="Thân thiện" subject="Thông báo bảo trì hệ thống cuối tuần để nâng cấp dịch vụ">
Thân gửi Quý khách hàng,

Để mang đến trải nghiệm tốt hơn và mượt mà hơn, chúng tôi sẽ tiến hành bảo trì hệ thống vào cuối tuần này. 

Dịch vụ của chúng tôi sẽ tạm ngưng hoạt động trong khung giờ từ **23:00 ngày 05/09/2026** đến **06:00 ngày 06/09/2026**. 

Chúng tôi xin lỗi vì sự bất tiện này và hy vọng việc nâng cấp sẽ giúp Quý khách có những trải nghiệm tuyệt vời hơn. Nếu cần hỗ trợ thêm thông tin, đội ngũ của chúng tôi luôn sẵn sàng hỗ trợ Quý khách.

Thân ái,
Đội ngũ chăm sóc khách hàng
</Option>
</WritingBlock>`;

console.log('OUTPUT HTML:');
console.log(marked.parse(userInput));
