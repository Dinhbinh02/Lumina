import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load marked & KaTeX engines
const markedMinPath = path.join(__dirname, '../src/lib/marked.min.js');
const markedCode = fs.readFileSync(markedMinPath, 'utf8');
const markedFn = new Function('window', 'globalThis', `${markedCode}; return (typeof marked !== "undefined" ? marked : globalThis.marked);`);
const marked = markedFn({}, globalThis);
globalThis.marked = marked;

const katexMinPath = path.join(__dirname, '../src/lib/katex/katex.min.js');
const katexCode = fs.readFileSync(katexMinPath, 'utf8');
const katexFn = new Function('window', 'globalThis', `${katexCode}; return (typeof katex !== "undefined" ? katex : globalThis.katex);`);
const katex = katexFn({}, globalThis);
globalThis.katex = katex;

// 2. Load markdown_parser module
const mathModule = await import('../src/components/cores/markdown_parser.js');
mathModule.initMarkdownMath();

console.log('============================================================');
console.log('🧪 RUNNING 25 COMPREHENSIVE KATEX TEST CASES & EDGE CASES');
console.log('============================================================\n');

const testCases = [
    {
        id: 1,
        name: 'Business Metric (Inline with Vietnamese text & fractions)',
        input: '* **Công thức:** $\\text{CAC} = \\frac{\\text{Tổng chi phí Sales} + \\text{Tổng chi phí Marketing}}{\\text{Số lượng khách hàng mới thu được}}$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must contain katex class');
            assert(html.includes('CAC'), 'Must contain CAC');
            assert(html.includes('Sales'), 'Must contain Sales');
            assert(!html.includes('\\dfrac'), 'Must not force \\dfrac on inline math');
        }
    },
    {
        id: 2,
        name: 'Economic Formula (Display block with Vietnamese & multiplications)',
        input: '$$\\text{LTV} = \\frac{\\text{ARPU (Doanh thu trung bình)} \\times \\text{Gross Margin (Biên lợi nhuận gộp)}}{\\text{Customer Churn Rate (Tỷ lệ rời bỏ)}}$$',
        validator: (html) => {
            assert(html.includes('class="katex-display"') || html.includes('class="katex"'), 'Must render display math');
            assert(html.includes('LTV'), 'Must contain LTV');
            assert(html.includes('ARPU'), 'Must contain ARPU');
        }
    },
    {
        id: 3,
        name: 'ROI & Profitability (Vietnamese inline with percentages & symbols)',
        input: 'Hiệu quả đầu tư: $\\text{ROI} = \\frac{\\text{Lợi nhuận ròng}}{\\text{Tổng vốn đầu tư}} \\times 100\\%$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render inline katex');
            assert(html.includes('ROI'), 'Must contain ROI');
        }
    },
    {
        id: 4,
        name: 'Payback Period (Inline fraction with subtraction)',
        input: '$\\text{Thời gian hoàn vốn} = \\frac{\\text{Chi phí đầu tư ban đầu}}{\\text{Dòng tiền thuần hàng năm}}$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render payback period');
        }
    },
    {
        id: 5,
        name: 'Machine Learning Loss (Cross Entropy with double summation & log)',
        input: '$$\\mathcal{L}_{CE} = -\\frac{1}{N} \\sum_{i=1}^N \\sum_{c=1}^C y_{i,c} \\log(\\hat{y}_{i,c})$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render cross-entropy loss');
            assert(html.includes('log'), 'Must render log');
        }
    },
    {
        id: 6,
        name: 'Deep Learning Multi-Head Attention (Softmax & matrix multiplication)',
        input: '$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render Attention formula');
            assert(html.includes('softmax'), 'Must render softmax');
        }
    },
    {
        id: 7,
        name: 'Calculus - Definite Integral with limits and trigonometric square',
        input: '$$\\int_{0}^{\\pi} \\sin^2(x) \\, dx = \\frac{\\pi}{2}$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render definite integral');
        }
    },
    {
        id: 8,
        name: 'Calculus - Multivariable Gradient & Partial Derivatives Vector',
        input: '$$\\nabla f(x, y, z) = \\left( \\frac{\\partial f}{\\partial x}, \\frac{\\partial f}{\\partial y}, \\frac{\\partial f}{\\partial z} \\right)$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render gradient vector');
        }
    },
    {
        id: 9,
        name: 'Statistics - Gaussian Normal Distribution Probability Density Function',
        input: '$$f(x; \\mu, \\sigma^2) = \\frac{1}{\\sigma \\sqrt{2\\pi}} e^{-\\frac{1}{2}\\left(\\frac{x-\\mu}{\\sigma}\\right)^2}$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render Gaussian PDF');
        }
    },
    {
        id: 10,
        name: 'Statistics - Pearson Correlation Coefficient with dual square roots',
        input: '$$r_{xy} = \\frac{\\sum_{i=1}^n (x_i - \\bar{x})(y_i - \\bar{y})}{\\sqrt{\\sum_{i=1}^n (x_i - \\bar{x})^2} \\sqrt{\\sum_{i=1}^n (y_i - \\bar{y})^2}}$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render correlation');
        }
    },
    {
        id: 11,
        name: 'Physics - Einstein Mass-Energy & Special Relativity Lorentz factor',
        input: '$$E = \\gamma mc^2 = \\frac{mc^2}{\\sqrt{1 - \\frac{v^2}{c^2}}}$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render Einstein equation');
        }
    },
    {
        id: 12,
        name: 'Physics - Quantum Mechanics Time-Dependent Schrödinger Wave Equation',
        input: '$$i\\hbar \\frac{\\partial}{\\partial t}\\Psi(\\mathbf{r}, t) = \\hat{H}\\Psi(\\mathbf{r}, t)$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render Schrödinger equation');
        }
    },
    {
        id: 13,
        name: 'Linear Algebra - 2x2 Matrix Multiplication & Vector Transformation',
        input: '$$\\begin{pmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{pmatrix} \\begin{pmatrix} x_1 \\\\ x_2 \\end{pmatrix} = \\begin{pmatrix} b_1 \\\\ b_2 \\end{pmatrix}$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render matrix block');
        }
    },
    {
        id: 14,
        name: 'Linear Algebra - Determinant & Inverse Matrix Existence',
        input: '$$\\det(A) = ad - bc \\neq 0 \\implies A^{-1} = \\frac{1}{\\det(A)}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render determinant and matrix inversion');
        }
    },
    {
        id: 15,
        name: 'Piecewise Function with Cases environment and conditions',
        input: '$$f(x) = \\begin{cases} \\frac{\\sin x}{x} & \\text{khi } x \\neq 0 \\\\ 1 & \\text{khi } x = 0 \\end{cases}$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render piecewise cases');
        }
    },
    {
        id: 16,
        name: 'Discrete Math - Binomial Theorem with combinations',
        input: '$$(x + y)^n = \\sum_{k=0}^n \\binom{n}{k} x^{n-k} y^k$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render binomial expansion');
        }
    },
    {
        id: 17,
        name: 'Algorithm Complexity (Big-O, Big-Theta, Big-Omega in prose)',
        input: 'Thời gian chạy là $O(V + E)$, không gian nhớ $\\Theta(V)$ và giới hạn dưới $\\Omega(1)$.',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render asymptotic notations');
        }
    },
    {
        id: 18,
        name: 'Logic & Epsilon-Delta Limit Definition with Quantifiers',
        input: '$$\\forall \\epsilon > 0, \\exists \\delta > 0 : 0 < |x - c| < \\delta \\implies |f(x) - L| < \\epsilon$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render epsilon-delta logic');
        }
    },
    {
        id: 19,
        name: 'Complex Analysis - Euler Identity & Polar Coordinates',
        input: '$$e^{i\\pi} + 1 = 0 \\quad \\text{và} \\quad z = r(\\cos \\theta + i \\sin \\theta) = r e^{i\\theta}$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render Euler identity');
        }
    },
    {
        id: 20,
        name: 'Edge Case: Currency Symbol ($150, $200) false-positive protection',
        input: 'Sản phẩm giá $150 (giảm từ $200), mua 2 cái hết $300.',
        validator: (html) => {
            assert(!html.includes('class="katex"'), 'Must NOT treat standard currency as LaTeX math');
            assert(html.includes('$150') && html.includes('$200') && html.includes('$300'), 'Must preserve currency symbols');
        }
    },
    {
        id: 21,
        name: 'Edge Case: Inline math followed immediately by punctuation',
        input: 'Xét hàm số $f(x) = x^2 + 2x + 1$, ta có $f\'(x) = 2x + 2$.',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render math with trailing comma/period');
        }
    },
    {
        id: 22,
        name: 'Edge Case: Math nested inside Markdown Table cell',
        input: '| Chỉ số | Công thức | Ý nghĩa |\n| --- | --- | --- |\n| NPS | $\\text{NPS} = \\% \\text{Promoters} - \\% \\text{Detractors}$ | Đo lường độ hài lòng |',
        validator: (html) => {
            assert(html.includes('<table>'), 'Must render table');
            assert(html.includes('class="katex"'), 'Must render math inside table cell');
        }
    },
    {
        id: 23,
        name: 'Edge Case: Math inside nested bullet lists with bold label',
        input: '* Cấp 1\n  * **Cấp 2:** $\\sigma = \\sqrt{\\frac{1}{N}\\sum_{i=1}^N (x_i - \\mu)^2}$',
        validator: (html) => {
            assert(html.includes('<ul>'), 'Must render nested list');
            assert(html.includes('class="katex"'), 'Must render math in sub-bullet');
        }
    },
    {
        id: 24,
        name: 'Edge Case: Chemical reaction with reaction arrow and enthalpy',
        input: '$$\\text{2H}_2 + \\text{O}_2 \\xrightarrow{\\Delta} \\text{2H}_2\\text{O} \\quad (\\Delta H = -285.8\\text{ kJ/mol})$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render chemistry reaction');
        }
    },
    {
        id: 25,
        name: 'Edge Case: Complex Vietnamese with all compound accents (hỏi, ngã, nặng, nón, râu)',
        input: '$$\\text{Hiệu suất vận hành} = \\frac{\\text{Khối lượng sản phẩm đạt chuẩn}}{\\text{Tổng thời gian chu kỳ sản xuất}} \\times 100\\%$$',
        validator: (html) => {
            assert(html.includes('class="katex"'), 'Must render complex Vietnamese math labels');
        }
    }
];

let passedCount = 0;
for (const tc of testCases) {
    try {
        const rendered = marked.parse(tc.input);
        tc.validator(rendered);
        console.log(`  ✅ [CASE ${tc.id.toString().padStart(2, '0')}/25] ${tc.name}`);
        passedCount++;
    } catch (err) {
        console.error(`  ❌ [CASE ${tc.id.toString().padStart(2, '0')}/25] FAILED: ${tc.name}`);
        console.error('     Error:', err.message);
        throw err;
    }
}

console.log('\n============================================================');
console.log(`📊 TEST SUMMARY: ${passedCount}/25 test cases PASSED 100%!`);
console.log('🎉 ALL 25 COMPREHENSIVE KATEX TEST CASES VERIFIED!');
console.log('============================================================\n');
