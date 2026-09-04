import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load marked
const markedMinPath = path.join(__dirname, '../src/lib/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : globalThis.marked));`);
const marked = markedFn({}, globalThis);

// Initialize LMDX parser on marked
globalThis.marked = marked;
globalThis.WidgetRunner = {
    renderWidgetCard: (body, height, title) => `<div class="nexus-widget-card" data-title="${title}">${title}</div>`
};

// Import LMDX parser
const lmdxModule = await import('../src/components/cores/component_parser.js');
lmdxModule.initLmdxComponentsParser();

const edgeCases = [
    {
        name: 'EDGE CASE 1: Mixed Content (Text Before, Step Cards, Text After)',
        input: `Dưới đây là hướng dẫn cài đặt SSH Key trên macOS:

<Sequence>
<Step title="Bước 1: Kiểm tra key cũ" subtitle="Thực hiện trong Terminal">
Mở Terminal và gõ:
\`\`\`bash
ls -al ~/.ssh
\`\`\`
</Step>
<Step title="Bước 2: Tạo key mới" subtitle="Khuyên dùng Ed25519">
Chạy lệnh sau:
\`\`\`bash
ssh-keygen -t ed25519 -C "user@example.com"
\`\`\`
</Step>
</Sequence>

Chúc bạn cấu hình thành công! Hãy kiểm tra kết nối với GitHub.`,
        checks: [
            { desc: 'Contains text before', test: (html) => html.includes('Dưới đây là hướng dẫn cài đặt') },
            { desc: 'Contains Step 1 Card', test: (html) => html.includes('Bước 1: Kiểm tra key cũ') },
            { desc: 'Contains Step 2 Card', test: (html) => html.includes('Bước 2: Tạo key mới') },
            { desc: 'Contains text after', test: (html) => html.includes('Chúc bạn cấu hình thành công!') },
            { desc: 'No unparsed XML tag leaks', test: (html) => !/<Sequence|<Step/i.test(html) }
        ]
    },
    {
        name: 'EDGE CASE 2: Sequence with arbitrary / out-of-order attributes (id, name, subtitle before title)',
        input: `<Sequence>
<Step id="step-one" subtitle="Cảnh báo an toàn" name="step-1" title="Bước 1: Ngắt nguồn điện">
Hãy chắc chắn rằng nguồn điện đã tắt hoàn toàn.
</Step>
<Step title="Bước 2: Cắm dây nguồn" subtitle="220V">
Cắm lại nguồn điện và bật công tắc.
</Step>
</Sequence>`,
        checks: [
            { desc: 'Step 1 extracted title properly', test: (html) => html.includes('Bước 1: Ngắt nguồn điện') },
            { desc: 'Step 1 extracted subtitle properly', test: (html) => html.includes('Cảnh báo an toàn') },
            { desc: 'Step 2 extracted title properly', test: (html) => html.includes('Bước 2: Cắm dây nguồn') },
            { desc: 'No unparsed XML tag leaks', test: (html) => !/<Sequence|<Step/i.test(html) }
        ]
    },
    {
        name: 'EDGE CASE 3: Mid-stream Simulation (Incomplete Sequence before </Sequence> arrives)',
        input: `<Sequence>
<Step title="Bước 1: Khởi động hệ thống" subtitle="Bước khởi đầu">
Hệ thống đang được kích hoạt...
</Step>
<Step title="Bước 2: Nạp dữ liệu">
Đang tải dữ liệu từ database...`,
        checks: [
            { desc: 'Renders Step 1 during streaming', test: (html) => html.includes('Bước 1: Khởi động hệ thống') },
            { desc: 'Renders in-progress Step 2 cleanly', test: (html) => html.includes('Bước 2: Nạp dữ liệu') },
            { desc: 'No raw <Sequence> tag leaked', test: (html) => !html.includes('<Sequence>') && !html.includes('<Sequence') }
        ]
    },
    {
        name: 'EDGE CASE 4: Timeline with Date & Event Attributes',
        input: `<Timeline>
<TimelineEvent time="1995" title="Sự ra đời của JavaScript">
JavaScript được tạo ra bởi Brendan Eich.
</TimelineEvent>
<TimelineEvent date="2015" title="Kỷ nguyên hiện đại ES6">
ECMAScript 2015 mang đến Arrow Function, Promises và Classes.
</TimelineEvent>
</Timeline>`,
        checks: [
            { desc: 'Timeline Item 1 rendered with time 1995', test: (html) => html.includes('1995') && html.includes('Sự ra đời của JavaScript') },
            { desc: 'Timeline Item 2 rendered with date 2015', test: (html) => html.includes('2015') && html.includes('Kỷ nguyên hiện đại ES6') },
            { desc: 'Timeline Track container present', test: (html) => html.includes('nexus-timeline-track') },
            { desc: 'No raw <Timeline> tag leaked', test: (html) => !/<Timeline|<TimelineEvent/i.test(html) }
        ]
    },
    {
        name: 'EDGE CASE 5: FollowUp with custom button attribute & language detection',
        input: `<FollowUp label="Bạn có muốn tôi hướng dẫn cấu hình GPG Key không?" button="Cấu hình ngay" query="Hãy hướng dẫn tôi cấu hình GPG Key trên GitHub." />`,
        checks: [
            { desc: 'FollowUp label present', test: (html) => html.includes('Bạn có muốn tôi hướng dẫn cấu hình GPG Key không?') },
            { desc: 'Custom button text used', test: (html) => html.includes('Cấu hình ngay') },
            { desc: 'Data query embedded safely', test: (html) => html.includes('data-query="Hãy hướng dẫn tôi cấu hình GPG Key trên GitHub."') },
            { desc: 'No raw <FollowUp> tag leaked', test: (html) => !/<FollowUp/i.test(html) }
        ]
    },
    {
        name: 'EDGE CASE 6: ElicitationsGroup with Multiple Action Chips',
        input: `<ElicitationsGroup message="Các hướng phát triển tiếp theo:">
<Elicitation label="So sánh hiệu năng RSA vs Ed25519" query="So sánh chi tiết tốc độ và độ an toàn giữa RSA 4096 và Ed25519." />
<Elicitation label="Cấu hình nhiều tài khoản GitHub trên 1 máy" query="Làm thế nào để dùng 2 tài khoản GitHub khác nhau trên cùng 1 máy Mac?" />
</ElicitationsGroup>`,
        checks: [
            { desc: 'Context message rendered', test: (html) => html.includes('Các hướng phát triển tiếp theo:') },
            { desc: 'Chip 1 rendered', test: (html) => html.includes('So sánh hiệu năng RSA vs Ed25519') },
            { desc: 'Chip 2 rendered', test: (html) => html.includes('Cấu hình nhiều tài khoản GitHub trên 1 máy') },
            { desc: 'Chips wrapper class present', test: (html) => html.includes('nexus-elicitations-wrapper') },
            { desc: 'No raw XML tag leaked', test: (html) => !/<ElicitationsGroup|<Elicitation/i.test(html) }
        ]
    },
    {
        name: 'EDGE CASE 7: Consecutive Components (Sequence followed immediately by FollowUp)',
        input: `<Sequence>
<Step title="Hoàn tất cài đặt">
Mọi thứ đã sẵn sàng.
</Step>
</Sequence>

<FollowUp label="Bạn có muốn chuyển sang bước deploy ứng dụng lên Vercel?" query="Hãy hướng dẫn deploy lên Vercel." />`,
        checks: [
            { desc: 'Sequence rendered', test: (html) => html.includes('nexus-sequence-flow') },
            { desc: 'FollowUp rendered', test: (html) => html.includes('nexus-followup-card') },
            { desc: 'No raw XML leaked', test: (html) => !/<Sequence|<Step|<FollowUp/i.test(html) }
        ]
    }
];

console.log('\n============================================================');
console.log('🧪 RUNNING COMPREHENSIVE LMDX EDGE CASES TEST SUITE');
console.log('============================================================\n');

let totalChecks = 0;
let passedChecks = 0;

for (let i = 0; i < edgeCases.length; i++) {
    const ec = edgeCases[i];
    console.log(`\n------------------------------------------------------------`);
    console.log(`[TEST ${i + 1}/${edgeCases.length}] ${ec.name}`);
    
    const htmlOutput = marked.parse(ec.input);
    let ecPassed = true;

    for (const check of ec.checks) {
        totalChecks++;
        const ok = check.test(htmlOutput);
        if (ok) {
            passedChecks++;
            console.log(`  ✅ ${check.desc}`);
        } else {
            ecPassed = false;
            console.log(`  ❌ FAIL: ${check.desc}`);
        }
    }

    if (!ecPassed) {
        console.log(`\n--- FAILED HTML OUTPUT ---`);
        console.log(htmlOutput);
    }
}

console.log('\n============================================================');
console.log(`📊 EDGE CASES RESULTS: ${passedChecks}/${totalChecks} assertions passed`);
if (passedChecks === totalChecks) {
    console.log(`🎉 ALL EDGE CASES PASSED WITH 100% ACCURACY!`);
} else {
    console.log(`❌ SOME EDGE CASES FAILED`);
}
console.log('============================================================\n');
