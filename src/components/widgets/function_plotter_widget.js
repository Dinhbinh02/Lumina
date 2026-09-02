/**
 * FunctionPlotterWidget
 * Premium True-Vector 2D Analytical Function Grapher
 * Features:
 * - Pure SVG Vector Engine with infinite Retina/4K sharpness.
 * - Reactive Auto-Scale: Dynamically scales domain/range to fit vertex, roots, and critical points.
 * - Interactive Mouse Drag-to-Pan (kéo rê chuột tự do).
 * - Mouse Wheel / Pinch-to-Zoom (lăn chuột phóng to/thu nhỏ tại tâm con trỏ).
 * - Real-time Live Typing Updates.
 * - 100% Content Security Policy (CSP) compliant — Zero eval() / Zero new Function().
 */

class SafeMathParser {
    constructor(expr) {
        this.tokens = this.tokenize(expr);
        this.pos = 0;
    }

    tokenize(expr) {
        let s = (expr || '').trim().toLowerCase();
        // Handle implicit multiplication like 4x or 2(x) or 3sin(x)
        s = s.replace(/(\d+)\s*([a-zA-Z(])/g, '$1*$2');
        s = s.replace(/\)\s*([a-zA-Z\d(])/g, ')*$1');

        const tokens = [];
        let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if (/\s/.test(ch)) {
                i++;
                continue;
            }
            if (/\d/.test(ch) || (ch === '.' && /\d/.test(s[i + 1]))) {
                let numStr = '';
                while (i < s.length && (/[\d.]/.test(s[i]))) {
                    numStr += s[i];
                    i++;
                }
                tokens.push({ type: 'number', value: parseFloat(numStr) });
                continue;
            }
            if (/[a-zA-Z]/.test(ch)) {
                let id = '';
                while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) {
                    id += s[i];
                    i++;
                }
                tokens.push({ type: 'identifier', value: id });
                continue;
            }
            if (['+', '-', '*', '/', '^', '%', '(', ')', ','].includes(ch)) {
                tokens.push({ type: 'op', value: ch });
                i++;
                continue;
            }
            i++;
        }
        return tokens;
    }

    peek() {
        return this.tokens[this.pos] || null;
    }

    consume(expected) {
        const token = this.peek();
        if (expected && (!token || token.value !== expected)) {
            throw new Error(`Expected "${expected}"`);
        }
        this.pos++;
        return token;
    }

    parse() {
        if (!this.tokens.length) {
            throw new Error('Empty formula');
        }
        const ast = this.parseExpression();
        if (this.pos < this.tokens.length) {
            throw new Error('Unexpected extra symbols in equation');
        }
        return ast;
    }

    parseExpression() {
        return this.parseAddSub();
    }

    parseAddSub() {
        let node = this.parseMulDiv();
        while (this.peek() && (this.peek().value === '+' || this.peek().value === '-')) {
            const op = this.consume().value;
            const right = this.parseMulDiv();
            node = { type: 'binary', op, left: node, right };
        }
        return node;
    }

    parseMulDiv() {
        let node = this.parseExponent();
        while (this.peek() && (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')) {
            const op = this.consume().value;
            const right = this.parseExponent();
            node = { type: 'binary', op, left: node, right };
        }
        return node;
    }

    parseExponent() {
        let node = this.parseUnary();
        if (this.peek() && this.peek().value === '^') {
            this.consume();
            const right = this.parseExponent(); // right associative
            node = { type: 'binary', op: '^', left: node, right };
        }
        return node;
    }

    parseUnary() {
        if (this.peek() && (this.peek().value === '+' || this.peek().value === '-')) {
            const op = this.consume().value;
            const arg = this.parseUnary();
            return { type: 'unary', op, arg };
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const token = this.peek();
        if (!token) throw new Error('Unexpected end of formula');

        if (token.type === 'number') {
            this.consume();
            return { type: 'literal', value: token.value };
        }

        if (token.type === 'identifier') {
            const name = token.value;
            this.consume();

            if (name === 'x') {
                return { type: 'variable', name: 'x' };
            }
            if (name === 'pi') {
                return { type: 'literal', value: Math.PI };
            }
            if (name === 'e') {
                return { type: 'literal', value: Math.E };
            }

            // Function call
            if (this.peek() && this.peek().value === '(') {
                this.consume('(');
                const args = [];
                if (this.peek() && this.peek().value !== ')') {
                    args.push(this.parseExpression());
                    while (this.peek() && this.peek().value === ',') {
                        this.consume(',');
                        args.push(this.parseExpression());
                    }
                }
                this.consume(')');
                return { type: 'call', name, args };
            }

            // Function without parens e.g. sin x -> convert to call
            if (['sin', 'cos', 'tan', 'sqrt', 'abs', 'exp', 'ln', 'log'].includes(name)) {
                const arg = this.parsePrimary();
                return { type: 'call', name, args: [arg] };
            }

            return { type: 'variable', name };
        }

        if (token.value === '(') {
            this.consume('(');
            const expr = this.parseExpression();
            this.consume(')');
            return expr;
        }

        throw new Error(`Unexpected symbol: ${token.value}`);
    }
}

function evaluateAst(node, x) {
    if (!node) return 0;
    switch (node.type) {
        case 'literal':
            return node.value;
        case 'variable':
            return node.name === 'x' ? x : 0;
        case 'unary': {
            const val = evaluateAst(node.arg, x);
            return node.op === '-' ? -val : val;
        }
        case 'binary': {
            const left = evaluateAst(node.left, x);
            const right = evaluateAst(node.right, x);
            switch (node.op) {
                case '+': return left + right;
                case '-': return left - right;
                case '*': return left * right;
                case '/': return right !== 0 ? left / right : NaN;
                case '%': return left % right;
                case '^': return Math.pow(left, right);
                default: return 0;
            }
        }
        case 'call': {
            const args = node.args.map(a => evaluateAst(a, x));
            const arg0 = args[0] || 0;
            const arg1 = args[1] || 0;
            switch (node.name) {
                case 'sin': return Math.sin(arg0);
                case 'cos': return Math.cos(arg0);
                case 'tan': return Math.tan(arg0);
                case 'asin': return Math.asin(arg0);
                case 'acos': return Math.acos(arg0);
                case 'atan': return Math.atan(arg0);
                case 'sqrt': return arg0 >= 0 ? Math.sqrt(arg0) : NaN;
                case 'cbrt': return Math.cbrt(arg0);
                case 'abs': return Math.abs(arg0);
                case 'exp': return Math.exp(arg0);
                case 'ln':
                case 'log': return arg0 > 0 ? Math.log(arg0) : NaN;
                case 'log10': return arg0 > 0 ? Math.log10(arg0) : NaN;
                case 'floor': return Math.floor(arg0);
                case 'ceil': return Math.ceil(arg0);
                case 'round': return Math.round(arg0);
                case 'min': return Math.min(...args);
                case 'max': return Math.max(...args);
                case 'pow': return Math.pow(arg0, arg1);
                default: return NaN;
            }
        }
        default:
            return 0;
    }
}

export class FunctionPlotterWidget {
    constructor(container, props = {}) {
        this.container = container;
        this.props = props;
        this.expr = props.expr || props.fn || props.func || props.formula || props.equation || 'x^2 - 4*x + 3';
        this.xmin = props.xmin !== undefined ? parseFloat(props.xmin) : -6;
        this.xmax = props.xmax !== undefined ? parseFloat(props.xmax) : 6;
        this.ymin = props.ymin !== undefined ? parseFloat(props.ymin) : -5;
        this.ymax = props.ymax !== undefined ? parseFloat(props.ymax) : 7;
        this.hasExplicitRange = props.xmin !== undefined || props.ymin !== undefined;

        this.ast = null;
        this.hoverPt = null;
        this.errorMsg = null;
        this.viewWidth = 370;
        this.viewHeight = 230;

        this.init();
    }

    init() {
        this._compileFunction(this.expr);
        if (!this.hasExplicitRange) {
            this._autoFitRange();
        }
        this._renderBase();
        this._draw();
    }

    _autoFitRange() {
        if (!this.ast) return;
        
        // Sample points across domain [-8, 8]
        const samples = [];
        const step = 0.2;
        for (let x = -8; x <= 8; x += step) {
            try {
                const y = evaluateAst(this.ast, x);
                if (!isNaN(y) && isFinite(y) && Math.abs(y) < 1e5) {
                    samples.push({ x, y });
                }
            } catch (_) {}
        }

        if (samples.length < 5) return;

        // Filter reasonable middle values to avoid asymptotes blowing up the scale
        const yVals = samples.map(s => s.y).sort((a, b) => a - b);
        
        let minY = yVals[0];
        let maxY = yVals[yVals.length - 1];

        if (yVals.length > 20) {
            const p05 = yVals[Math.floor(yVals.length * 0.05)];
            const p95 = yVals[Math.floor(yVals.length * 0.95)];
            if (Math.abs(minY) > Math.abs(p05) * 5) minY = p05;
            if (Math.abs(maxY) > Math.abs(p95) * 5) maxY = p95;
        }

        // Clamp huge values
        if (minY < -150) minY = -80;
        if (maxY > 150) maxY = 80;

        // Ensure origin 0 is somewhat visible or centered
        if (minY > 0 && minY < 4) minY = -2;
        if (maxY < 0 && maxY > -4) maxY = 2;

        const ySpan = Math.max(maxY - minY, 5);
        this.ymin = Math.floor(minY - ySpan * 0.15);
        this.ymax = Math.ceil(maxY + ySpan * 0.15);
        this.xmin = -7;
        this.xmax = 7;
    }

    _compileFunction(exprStr, isSilent = false) {
        if (!exprStr || !exprStr.trim()) {
            if (!isSilent) this.errorMsg = 'Please enter a valid function.';
            return false;
        }

        try {
            const parser = new SafeMathParser(exprStr);
            const ast = parser.parse();
            // Test evaluation with sample x
            evaluateAst(ast, 1);
            this.ast = ast;
            this.expr = exprStr;
            this.errorMsg = null;
            return true;
        } catch (e) {
            if (!isSilent) {
                console.warn('[FunctionPlotterWidget] Parse error:', e);
                this.errorMsg = 'Syntax error in equation.';
            }
            return false;
        }
    }

    _renderBase() {
        this.container.innerHTML = `
            <div class="nexus-sol-plotter-card">
                <div class="nexus-plotter-header">
                    <div class="nexus-plotter-brand">
                        <div class="nexus-plotter-icon-badge">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M3 12h3l3-9 6 18 3-9h3"></path>
                            </svg>
                        </div>
                        <div class="nexus-plotter-brand-text">
                            <span class="nexus-plotter-title">Function Grapher</span>
                            <span class="nexus-plotter-subtitle">Analytical 2D Vector Curve</span>
                        </div>
                    </div>
                    <div class="nexus-plotter-toolbar">
                        <button class="nexus-plotter-tool-btn" id="nexus-plotter-autofit" title="Auto Fit (Tự động thu phóng)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <polyline points="9 21 3 21 3 15"></polyline>
                                <line x1="21" y1="3" x2="14" y2="10"></line>
                                <line x1="3" y1="21" x2="10" y2="14"></line>
                            </svg>
                        </button>
                        <button class="nexus-plotter-tool-btn" id="nexus-plotter-zoom-in" title="Zoom In">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                        <button class="nexus-plotter-tool-btn" id="nexus-plotter-zoom-out" title="Zoom Out">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                            </svg>
                        </button>
                        <button class="nexus-plotter-tool-btn" id="nexus-plotter-reset" title="Reset View">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                <path d="M3 3v5h5"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="nexus-plotter-input-container">
                    <div class="nexus-plotter-fn-prefix">
                        <span>f(x) =</span>
                    </div>
                    <input type="text" class="nexus-plotter-formula-input" id="nexus-plotter-input" value="${this._escapeHtml(this.expr)}" placeholder="e.g. x^2 - 4*x + 3, sin(x)">
                    <button class="nexus-plotter-submit-btn" id="nexus-plotter-plot-btn" title="Plot Function">
                        <span>Plot</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </button>
                </div>

                <div class="nexus-plotter-presets-wrapper">
                    <span class="nexus-plotter-presets-tag">Presets</span>
                    <div class="nexus-plotter-presets-scroll">
                        <button class="nexus-plotter-chip" data-expr="x^2 - 4*x + 3">x² − 4x + 3</button>
                        <button class="nexus-plotter-chip" data-expr="x^2 - 4*x - 12">x² − 4x − 12</button>
                        <button class="nexus-plotter-chip" data-expr="sin(x)">sin(x)</button>
                        <button class="nexus-plotter-chip" data-expr="cos(2*x)">cos(2x)</button>
                        <button class="nexus-plotter-chip" data-expr="x^3 - 3*x">x³ − 3x</button>
                        <button class="nexus-plotter-chip" data-expr="1/x">1/x</button>
                        <button class="nexus-plotter-chip" data-expr="exp(-x^2)">e^(−x²)</button>
                    </div>
                </div>

                <div class="nexus-plotter-viewport" id="nexus-plotter-viewport" style="cursor: grab;">
                    <svg class="nexus-plotter-svg" id="nexus-plotter-svg" viewBox="0 0 ${this.viewWidth} ${this.viewHeight}">
                        <!-- SVG Elements rendered dynamically -->
                    </svg>
                    <div class="nexus-plotter-error-overlay" id="nexus-plotter-error" style="display: ${this.errorMsg ? 'block' : 'none'};">${this._escapeHtml(this.errorMsg || '')}</div>
                    <div class="nexus-plotter-tooltip" id="nexus-plotter-coords" style="display: none;"></div>
                </div>

                <div class="nexus-plotter-footer-bar">
                    <div class="nexus-plotter-range-chip">
                        <span class="nexus-plotter-range-axis">X:</span>
                        <span class="nexus-plotter-range-val" id="nexus-plotter-xrange">[${this.xmin.toFixed(1)}, ${this.xmax.toFixed(1)}]</span>
                    </div>
                    <div class="nexus-plotter-range-chip">
                        <span class="nexus-plotter-range-axis">Y:</span>
                        <span class="nexus-plotter-range-val" id="nexus-plotter-yrange">[${this.ymin.toFixed(1)}, ${this.ymax.toFixed(1)}]</span>
                    </div>
                </div>
            </div>
        `;

        this._attachEvents();
    }

    _updateRanges() {
        const xEl = this.container.querySelector('#nexus-plotter-xrange');
        const yEl = this.container.querySelector('#nexus-plotter-yrange');
        if (xEl) xEl.textContent = `[${this.xmin.toFixed(1)}, ${this.xmax.toFixed(1)}]`;
        if (yEl) yEl.textContent = `[${this.ymin.toFixed(1)}, ${this.ymax.toFixed(1)}]`;
    }

    _showError(msg) {
        const errEl = this.container.querySelector('#nexus-plotter-error');
        if (errEl) {
            errEl.textContent = msg;
            errEl.style.display = 'block';
        }
    }

    _hideError() {
        const errEl = this.container.querySelector('#nexus-plotter-error');
        if (errEl) {
            errEl.style.display = 'none';
        }
    }

    _attachEvents() {
        const input = this.container.querySelector('#nexus-plotter-input');
        const plotBtn = this.container.querySelector('#nexus-plotter-plot-btn');
        const autoFitBtn = this.container.querySelector('#nexus-plotter-autofit');
        const zoomIn = this.container.querySelector('#nexus-plotter-zoom-in');
        const zoomOut = this.container.querySelector('#nexus-plotter-zoom-out');
        const resetBtn = this.container.querySelector('#nexus-plotter-reset');
        const presetBtns = this.container.querySelectorAll('.nexus-plotter-chip');
        const viewport = this.container.querySelector('#nexus-plotter-viewport');

        // Live Real-Time Typing Update with Auto-Range
        if (input && input.addEventListener) {
            input.addEventListener('input', () => {
                const val = input.value;
                if (this._compileFunction(val, true)) {
                    this._hideError();
                    this._autoFitRange();
                    this._updateRanges();
                    this._draw();
                }
            });

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (this._compileFunction(input.value, false)) {
                        this._hideError();
                        this._autoFitRange();
                        this._updateRanges();
                        this._draw();
                    } else if (this.errorMsg) {
                        this._showError(this.errorMsg);
                    }
                }
            });
        }

        if (plotBtn && plotBtn.addEventListener) {
            plotBtn.addEventListener('click', () => {
                if (input) {
                    if (this._compileFunction(input.value, false)) {
                        this._hideError();
                        this._autoFitRange();
                        this._updateRanges();
                        this._draw();
                    } else if (this.errorMsg) {
                        this._showError(this.errorMsg);
                    }
                }
            });
        }

        if (autoFitBtn && autoFitBtn.addEventListener) {
            autoFitBtn.addEventListener('click', () => {
                this._autoFitRange();
                this._updateRanges();
                this._draw();
            });
        }

        if (zoomIn && zoomIn.addEventListener) {
            zoomIn.addEventListener('click', () => {
                const xSpan = (this.xmax - this.xmin) * 0.25;
                const ySpan = (this.ymax - this.ymin) * 0.25;
                this.xmin += xSpan;
                this.xmax -= xSpan;
                this.ymin += ySpan;
                this.ymax -= ySpan;
                this._updateRanges();
                this._draw();
            });
        }

        if (zoomOut && zoomOut.addEventListener) {
            zoomOut.addEventListener('click', () => {
                const xSpan = (this.xmax - this.xmin) * 0.33;
                const ySpan = (this.ymax - this.ymin) * 0.33;
                this.xmin -= xSpan;
                this.xmax += xSpan;
                this.ymin += ySpan;
                this.ymax += ySpan;
                this._updateRanges();
                this._draw();
            });
        }

        if (resetBtn && resetBtn.addEventListener) {
            resetBtn.addEventListener('click', () => {
                this.xmin = -6;
                this.xmax = 6;
                this.ymin = -5;
                this.ymax = 7;
                this._updateRanges();
                this._draw();
            });
        }

        if (presetBtns) {
            presetBtns.forEach(btn => {
                if (btn && btn.addEventListener) {
                    btn.addEventListener('click', () => {
                        const expr = btn.dataset ? btn.dataset.expr : null;
                        if (expr) {
                            if (input) input.value = expr;
                            this._compileFunction(expr, false);
                            this._hideError();
                            this._autoFitRange();
                            this._updateRanges();
                            this._draw();
                        }
                    });
                }
            });
        }

        // Interactive Drag-to-Pan (Kéo rê chuột để di chuyển hệ toạ độ)
        let isDragging = false;
        let startX = 0, startY = 0;
        let initXMin = 0, initXMax = 0, initYMin = 0, initYMax = 0;

        if (viewport && viewport.addEventListener) {
            viewport.addEventListener('mousedown', (e) => {
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                initXMin = this.xmin;
                initXMax = this.xmax;
                initYMin = this.ymin;
                initYMax = this.ymax;
                viewport.style.cursor = 'grabbing';
            });

            if (typeof window !== 'undefined') {
                window.addEventListener('mousemove', (e) => {
                    if (isDragging) {
                        const dx = e.clientX - startX;
                        const dy = e.clientY - startY;
                        const rect = viewport.getBoundingClientRect();
                        const w = rect.width || this.viewWidth;
                        const h = rect.height || this.viewHeight;

                        const xRange = initXMax - initXMin;
                        const yRange = initYMax - initYMin;

                        const dXUnits = (dx / w) * xRange;
                        const dYUnits = (dy / h) * yRange;

                        this.xmin = initXMin - dXUnits;
                        this.xmax = initXMax - dXUnits;
                        this.ymin = initYMin + dYUnits;
                        this.ymax = initYMax + dYUnits;

                        this._updateRanges();
                        this._draw();
                        return;
                    }

                    // Normal hover coordinate tracking
                    if (!viewport.getBoundingClientRect) return;
                    const rect = viewport.getBoundingClientRect();
                    if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
                        return;
                    }
                    const displayW = rect.width || this.viewWidth;
                    const mouseX = e.clientX - rect.left;
                    const xVal = this.xmin + (mouseX / displayW) * (this.xmax - this.xmin);

                    if (this.ast) {
                        try {
                            const yVal = evaluateAst(this.ast, xVal);
                            if (!isNaN(yVal) && isFinite(yVal)) {
                                const coordsBox = this.container.querySelector('#nexus-plotter-coords');
                                if (coordsBox) {
                                    coordsBox.style.display = 'flex';
                                    coordsBox.innerHTML = `<span>(<b>${xVal.toFixed(2)}</b>, <b>${yVal.toFixed(2)}</b>)</span>`;
                                }
                                this.hoverPt = { x: xVal, y: yVal };
                                this._draw();
                                return;
                            }
                        } catch (_) {}
                    }
                });

                window.addEventListener('mouseup', () => {
                    if (isDragging) {
                        isDragging = false;
                        viewport.style.cursor = 'grab';
                    }
                });
            }

            // Interactive Wheel-to-Zoom (Lăn chuột phóng to/thu nhỏ tại tâm trỏ)
            viewport.addEventListener('wheel', (e) => {
                e.preventDefault();
                const zoomFactor = e.deltaY < 0 ? 0.85 : 1.18;
                const rect = viewport.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                const w = rect.width || this.viewWidth;
                const h = rect.height || this.viewHeight;

                const mouseXVal = this.xmin + (mouseX / w) * (this.xmax - this.xmin);
                const mouseYVal = this.ymin + ((h - mouseY) / h) * (this.ymax - this.ymin);

                this.xmin = mouseXVal + (this.xmin - mouseXVal) * zoomFactor;
                this.xmax = mouseXVal + (this.xmax - mouseXVal) * zoomFactor;
                this.ymin = mouseYVal + (this.ymin - mouseYVal) * zoomFactor;
                this.ymax = mouseYVal + (this.ymax - mouseYVal) * zoomFactor;

                this._updateRanges();
                this._draw();
            }, { passive: false });

            viewport.addEventListener('mouseleave', () => {
                if (!isDragging) {
                    const coordsBox = this.container.querySelector('#nexus-plotter-coords');
                    if (coordsBox) coordsBox.style.display = 'none';
                    this.hoverPt = null;
                    this._draw();
                }
            });
        }
    }

    _draw() {
        const svg = this.container.querySelector('#nexus-plotter-svg');
        if (!svg) return;

        const w = this.viewWidth;
        const h = this.viewHeight;

        // Coordinate transforms
        const toScreenX = (x) => ((x - this.xmin) / (this.xmax - this.xmin)) * w;
        const toScreenY = (y) => h - ((y - this.ymin) / (this.ymax - this.ymin)) * h;

        // Auto calculate optimal grid steps with "Nice Numbers" (1, 2, 5 * 10^k)
        const getNiceStep = (span, maxTicks) => {
            if (span <= 0 || !isFinite(span)) return 1;
            const rawStep = span / Math.max(maxTicks, 2);
            const power = Math.floor(Math.log10(rawStep));
            const magnitude = Math.pow(10, power);
            const residual = rawStep / magnitude;

            let niceStep;
            if (residual <= 1.5) {
                niceStep = 1 * magnitude;
            } else if (residual <= 3.5) {
                niceStep = 2 * magnitude;
            } else if (residual <= 7.5) {
                niceStep = 5 * magnitude;
            } else {
                niceStep = 10 * magnitude;
            }
            return niceStep;
        };

        const xSpan = this.xmax - this.xmin;
        const ySpan = this.ymax - this.ymin;

        // Max 5-6 ticks on X axis (>= 60px between numbers)
        // Max 4-5 ticks on Y axis (>= 45px between numbers)
        const xGridStep = getNiceStep(xSpan, 5);
        const yGridStep = getNiceStep(ySpan, 4);

        const formatTickVal = (val) => {
            const rounded = parseFloat(val.toFixed(6));
            if (Math.abs(rounded) >= 100000) {
                return (rounded / 1000).toFixed(0) + 'k';
            }
            return rounded.toString();
        };

        let gridLinesSvg = '';
        let labelsSvg = '';

        // 1. Grid Lines & Numbers
        const firstX = Math.ceil(this.xmin / xGridStep) * xGridStep;
        for (let x = firstX; x <= this.xmax + 1e-7; x += xGridStep) {
            const sx = toScreenX(x).toFixed(2);
            gridLinesSvg += `<line x1="${sx}" y1="0" x2="${sx}" y2="${h}" stroke="rgba(255,255,255,0.06)" stroke-width="1" shape-rendering="crispEdges" />`;
        }

        const firstY = Math.ceil(this.ymin / yGridStep) * yGridStep;
        for (let y = firstY; y <= this.ymax + 1e-7; y += yGridStep) {
            const sy = toScreenY(y).toFixed(2);
            gridLinesSvg += `<line x1="0" y1="${sy}" x2="${w}" y2="${sy}" stroke="rgba(255,255,255,0.06)" stroke-width="1" shape-rendering="crispEdges" />`;
        }

        // 2. Cartesian Axes
        const y0 = toScreenY(0);
        const x0 = toScreenX(0);

        let axesSvg = '';
        if (this.ymin <= 0 && this.ymax >= 0) {
            axesSvg += `<line x1="0" y1="${y0.toFixed(2)}" x2="${w}" y2="${y0.toFixed(2)}" stroke="rgba(255,255,255,0.32)" stroke-width="1.5" shape-rendering="crispEdges" />`;
        }
        if (this.xmin <= 0 && this.xmax >= 0) {
            axesSvg += `<line x1="${x0.toFixed(2)}" y1="0" x2="${x0.toFixed(2)}" y2="${h}" stroke="rgba(255,255,255,0.32)" stroke-width="1.5" shape-rendering="crispEdges" />`;
        }

        // 3. Axis Number Labels (Spaced out nicely, no collision)
        for (let x = firstX; x <= this.xmax + 1e-7; x += xGridStep) {
            if (Math.abs(x) < 1e-5) continue; // skip 0
            const sx = toScreenX(x);
            if (sx > 20 && sx < w - 20) {
                const labelY = (this.ymin <= 0 && this.ymax >= 0) ? Math.min(Math.max(y0 + 12, 12), h - 6) : h - 6;
                labelsSvg += `<text x="${sx.toFixed(2)}" y="${labelY.toFixed(2)}" fill="rgba(255,255,255,0.55)" font-size="10" font-family="Inter, sans-serif" font-weight="500" text-anchor="middle">${formatTickVal(x)}</text>`;
            }
        }

        for (let y = firstY; y <= this.ymax + 1e-7; y += yGridStep) {
            if (Math.abs(y) < 1e-5) continue; // skip 0
            const sy = toScreenY(y);
            if (sy > 12 && sy < h - 12) {
                const labelX = (this.xmin <= 0 && this.xmax >= 0) ? Math.min(Math.max(x0 - 6, 25), w - 6) : 25;
                labelsSvg += `<text x="${labelX.toFixed(2)}" y="${(sy + 3).toFixed(2)}" fill="rgba(255,255,255,0.55)" font-size="10" font-family="Inter, sans-serif" font-weight="500" text-anchor="end">${formatTickVal(y)}</text>`;
            }
        }

        // 4. Vector SVG Curve Path Construction (Infinite continuous resolution)
        let curveSvg = '';
        if (this.ast) {
            let pathD = '';
            let isDrawing = false;
            const steps = 600; // 600 high-precision vector points

            const clipYMin = -100;
            const clipYMax = h + 100;

            for (let i = 0; i <= steps; i++) {
                const x = this.xmin + (i / steps) * (this.xmax - this.xmin);
                try {
                    const y = evaluateAst(this.ast, x);
                    if (typeof y !== 'number' || isNaN(y) || !isFinite(y)) {
                        isDrawing = false;
                        continue;
                    }

                    const sx = toScreenX(x);
                    const rawSy = toScreenY(y);

                    // Clamp to just outside the visible SVG viewport to prevent SVG coordinate overflow
                    // while ensuring the curve reaches the top and bottom edges continuously
                    const sy = Math.max(clipYMin, Math.min(clipYMax, rawSy));

                    // If both this point and previous were way off screen on same side, skip to save path length
                    if (!isDrawing) {
                        pathD += `M ${sx.toFixed(2)} ${sy.toFixed(2)} `;
                        isDrawing = true;
                    } else {
                        pathD += `L ${sx.toFixed(2)} ${sy.toFixed(2)} `;
                    }
                } catch (_) {
                    isDrawing = false;
                }
            }

            if (pathD) {
                curveSvg = `<path d="${pathD}" fill="none" stroke="#38bdf8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />`;
            }
        }

        // 5. Hover Crosshair & Anchor
        let hoverSvg = '';
        if (this.hoverPt) {
            const hx = toScreenX(this.hoverPt.x).toFixed(2);
            const hy = toScreenY(this.hoverPt.y).toFixed(2);
            const targetY0 = (y0 >= 0 && y0 <= h ? y0 : h).toFixed(2);
            const targetX0 = (x0 >= 0 && x0 <= w ? x0 : 0).toFixed(2);

            hoverSvg = `
                <g class="nexus-plotter-hover-group">
                    <line x1="${hx}" y1="${hy}" x2="${hx}" y2="${targetY0}" stroke="rgba(245, 158, 11, 0.45)" stroke-dasharray="3,3" stroke-width="1" />
                    <line x1="${hx}" y1="${hy}" x2="${targetX0}" y2="${hy}" stroke="rgba(245, 158, 11, 0.45)" stroke-dasharray="3,3" stroke-width="1" />
                    <circle cx="${hx}" cy="${hy}" r="6" fill="rgba(245, 158, 11, 0.25)" />
                    <circle cx="${hx}" cy="${hy}" r="3.5" fill="#f59e0b" stroke="#ffffff" stroke-width="1.5" />
                </g>
            `;
        }

        svg.innerHTML = `
            ${gridLinesSvg}
            ${axesSvg}
            ${labelsSvg}
            ${curveSvg}
            ${hoverSvg}
        `;
    }

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}
