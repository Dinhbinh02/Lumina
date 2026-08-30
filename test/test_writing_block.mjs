import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('============================================================');
console.log('🧪 TESTING WRITING BLOCKS COMPONENT & SURFACE GATING');
console.log('============================================================\n');

// 1. Load marked parser
const markedMinPath = path.join(__dirname, '../lib/vendor/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : globalThis.marked));`);
const marked = markedFn({}, globalThis);
globalThis.marked = marked;

// 2. Import LMDX parser
const lmdxModule = await import('../src/components/chat/lmdx_components_parser.js');
lmdxModule.initLmdxComponentsParser();

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition, message) {
    totalAssertions++;
    if (condition) {
        console.log(`  ✅ ${message}`);
        passedAssertions++;
    } else {
        console.error(`  ❌ FAILED: ${message}`);
    }
}

// [TEST 1] Single Option Document WritingBlock
console.log('[TEST 1/3] Single Option Document WritingBlock');
{
    const singleDoc = `<WritingBlock variant="document" title="Kế hoạch tuần">
<Option title="Bản thảo">
## Kế hoạch tuần 35
- [x] Triển khai WritingBlock
- [ ] Kiểm thử tính năng
</Option>
</WritingBlock>`;

    const singleHtml = marked.parse(singleDoc);
    assert(singleHtml.includes('nexus-writing-block'), 'Must contain nexus-writing-block');
    assert(singleHtml.includes('nexus-writing-icon'), 'Must render writing icon');
    assert(singleHtml.includes('Kế hoạch tuần'), 'Must render title');
    assert(singleHtml.includes('Triển khai WritingBlock'), 'Must render content');
}

// [TEST 2] Multi-Option Email with Subjects & Tabs
console.log('\n[TEST 2/3] Multi-Option Email with Subjects & Tabs');
{
    const multiEmail = `<WritingBlock variant="email" title="Thư xin phép nghỉ phép">
<Option title="Trang trọng" subject="Đơn xin nghỉ phép - Nguyễn Văn A">
Kính gửi Trưởng phòng,

Tôi xin phép nghỉ 2 ngày từ thứ Năm.
</Option>
<Option title="Ngắn gọn" subject="Xin nghỉ phép T5-T6">
Chào anh,

Em xin phép nghỉ thứ Năm và thứ Sáu tuần này nhé ạ.
</Option>
</WritingBlock>`;

    const emailHtml = marked.parse(multiEmail);
    assert(emailHtml.includes('nexus-writing-block'), 'Must contain nexus-writing-block');
    assert(emailHtml.includes('nexus-writing-icon'), 'Must render email icon');
    assert(emailHtml.includes('nexus-writing-segmented'), 'Must render tab switcher');
    assert(emailHtml.includes('Trang trọng'), 'Must contain tab 1');
    assert(emailHtml.includes('Ngắn gọn'), 'Must contain tab 2');
    assert(emailHtml.includes('nexus-writing-subject-row'), 'Must render subject row');
    assert(emailHtml.includes('Đơn xin nghỉ phép - Nguyễn Văn A'), 'Must contain option 1 subject');
    assert(emailHtml.includes('Xin nghỉ phép T5-T6'), 'Must contain option 2 subject');
    assert(emailHtml.includes('nexus-writing-btn-copy'), 'Must contain Copy button');
    assert(emailHtml.includes('nexus-writing-btn-canvas'), 'Must contain Canvas button');
}

// [TEST 3] Streaming Incomplete State Shielding
console.log('\n[TEST 3/3] Streaming Incomplete State');
{
    const streamIncomplete = `<WritingBlock variant="social_post" title="Bài đăng LinkedIn">
<Option title="Chuyên nghiệp">
Hôm nay tôi rất vui được chia sẻ tính năng mới...`;

    const streamHtml = marked.parse(streamIncomplete);
    assert(streamHtml.includes('nexus-writing-block'), 'Must contain streaming wrapper');
    assert(streamHtml.includes('nexus-writing-icon'), 'Must render social post icon');
}

console.log('\n============================================================');
console.log(`📊 TEST SUMMARY: ${passedAssertions}/${totalAssertions} assertions passed`);
if (passedAssertions === totalAssertions) {
    console.log('🎉 ALL WRITING BLOCK TESTS PASSED WITH 100% SUCCESS!');
}
console.log('============================================================\n');
