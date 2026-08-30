import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Testing <Comparison> and <Metrics> Components in Marked Parser...');

// 1. Load marked parser from vendor
const markedMinPath = path.join(__dirname, '../lib/vendor/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== 'undefined' ? marked : (typeof window !== 'undefined' ? window.marked : globalThis.marked));`);
const marked = markedFn({}, globalThis);
globalThis.marked = marked;

// 2. Import LMDX parser
const lmdxModule = await import('../src/components/chat/lmdx_components_parser.js');
lmdxModule.initLmdxComponentsParser();

// 1. Test <Comparison> complete rendering
const comparisonXml = `
<Comparison title="PostgreSQL vs MongoDB" leftName="PostgreSQL" rightName="MongoDB">
<Aspect name="Mô hình dữ liệu" left="Quan hệ (RDBMS)" right="Tài liệu (Document BSON)" />
<Aspect name="ACID" left="100% tuân thủ ACID" right="Document-level" winner="left" />
<Aspect name="Khả năng mở rộng" left="Mở rộng chiều dọc" right="Sharding tự động" winner="right" />
</Comparison>
`;

const renderedComparison = marked.parse(comparisonXml);
console.log('Rendered Comparison:\n', renderedComparison);

assert(renderedComparison.includes('class="nexus-comparison-card"'), 'Must contain comparison card wrapper');
assert(renderedComparison.includes('PostgreSQL vs MongoDB'), 'Must contain title');
assert(renderedComparison.includes('badge-left">PostgreSQL</span>'), 'Must contain left badge');
assert(renderedComparison.includes('badge-right">MongoDB</span>'), 'Must contain right badge');
assert(renderedComparison.includes('nexus-aspect-label">Mô hình dữ liệu</div>'), 'Must contain aspect label');
assert(renderedComparison.includes('is-winner'), 'Must render winner class');

// 2. Test <Metrics> complete rendering
const metricsXml = `
<Metrics title="Độ phức tạp QuickSort">
<Metric label="Best Case" value="O(n log n)" status="success" hint="Phân hoạch đều" />
<Metric label="Worst Case" value="O(n²)" status="danger" hint="Mảng đã sắp xếp" />
<Metric label="Bộ nhớ phụ" value="O(log n)" status="neutral" hint="Ngăn xếp đệ quy" />
</Metrics>
`;

const renderedMetrics = marked.parse(metricsXml);
console.log('Rendered Metrics:\n', renderedMetrics);

assert(renderedMetrics.includes('class="nexus-metrics-wrapper"'), 'Must contain metrics wrapper');
assert(renderedMetrics.includes('Độ phức tạp QuickSort'), 'Must contain title');
assert(renderedMetrics.includes('data-status="success"'), 'Must contain success status');
assert(renderedMetrics.includes('data-status="danger"'), 'Must contain danger status');
assert(renderedMetrics.includes('O(n log n)'), 'Must contain metric value');
assert(renderedMetrics.includes('Phân hoạch đều'), 'Must contain hint text');

// 3. Test Partial streaming (Zero XML flash)
const partialComparison = `<Comparison title="REST vs GraphQL" leftName="REST" rightName="GraphQL">`;
const streamingComparison = marked.parse(partialComparison);
assert(streamingComparison.includes('nexus-comparison-card'), 'Streaming comparison must render card immediately');

// 4. Test nested <Metrics> and robust child regex
const nestedMetricsXml = `
<Metrics title="Hiệu Năng & An Toàn Của Rust">
<Metrics title="Chỉ số kiến trúc Rust">
<Metric label="Memory Overhead" value="0%" status="success" hint="Không có Garbage Collector" />
<Metric label="Data Races" value="0 (Compile-time)" status="success" hint="Loại bỏ bằng Borrow Checker" />
<Metric label="Performance" value="Ngang ngửa C/C++" status="success" hint="Zero-cost abstractions" />
</Metrics>
</Metrics>
`;
const renderedNested = marked.parse(nestedMetricsXml);
const cardMatches = renderedNested.match(/class="nexus-metric-card"/g) || [];
assert.strictEqual(cardMatches.length, 3, 'Must render exactly 3 valid metric cards, no phantom empty card');
assert(!renderedNested.includes('<div class="nexus-metric-label">Metric</div>\n                            <div class="nexus-metric-value"></div>'), 'Must not render blank dummy card');

// 5. Test Comparison with <Left> and <Right> tags
const leftRightComparisonXml = `
<Comparison title="Rust vs C++" left="Rust" right="C++">
<Aspect label="Memory Safety" leftWinner="true">
<Left>Borrow Checker</Left>
<Right>Manual / Smart Pointers</Right>
</Aspect>
</Comparison>
`;
const renderedLeftRight = marked.parse(leftRightComparisonXml);
console.log('renderedLeftRight:\n', renderedLeftRight);
assert(renderedLeftRight.includes('Borrow Checker'), 'Must parse <Left> content correctly');
assert(renderedLeftRight.includes('Manual / Smart Pointers'), 'Must parse <Right> content correctly');
assert(renderedLeftRight.includes('is-winner'), 'Must apply winner class');

// 6. Test attributes containing > and < symbols inside quotes
const saasMetricsXml = `
<Metrics title="Ngưỡng Chuẩn Sức Khỏe SaaS (Benchmarks)">
<Metric label="LTV / CAC Ratio" value="> 3.0x" status="success" hint="Mức lành mạnh tối thiểu" />
<Metric label="Net Churn Rate" value="< 1% / mo" status="success" hint="Tối ưu hóa giữ chân" />
<Metric label="CAC Payback" value="< 12 mos" status="success" hint="Thời gian hoàn vốn" />
<Metric label="Gross Margin" value="> 70%" status="success" hint="Đặc thù phần mềm đám mây" />
</Metrics>
`;
const renderedSaaS = marked.parse(saasMetricsXml);
console.log('renderedSaaS:\n', renderedSaaS);
assert(renderedSaaS.includes('<div class="nexus-metric-value">&gt; 3.0x</div>') || renderedSaaS.includes('<div class="nexus-metric-value">> 3.0x</div>'), 'Must parse value="> 3.0x" correctly');
assert(renderedSaaS.includes('<div class="nexus-metric-value">&lt; 1% / mo</div>') || renderedSaaS.includes('<div class="nexus-metric-value">< 1% / mo</div>'), 'Must parse value="< 1% / mo" correctly');
assert(renderedSaaS.includes('<div class="nexus-metric-value">&gt; 70%</div>') || renderedSaaS.includes('<div class="nexus-metric-value">> 70%</div>'), 'Must parse value="> 70%" correctly');
assert(!renderedSaaS.includes('status=&quot;success&quot;'), 'Must not leak raw XML attributes into rendered card value');

console.log('✅ ALL Comparison & Metrics assertions passed successfully!');
