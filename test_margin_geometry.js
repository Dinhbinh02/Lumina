/**
 * Unit Test for TipTap Margin Click Geometry & Positioning (TH1 - TH6 & Red Boxes)
 */
import { getDocPositionFromPoint, isPointInText, getAllVisualLines } from './src/components/panels/tiptap_margin_click.js';
import assert from 'node:assert';

console.log('=== Running Unit Tests for TipTap Margin Click & Positioning ===\n');

// Mock DOM Range, Node, Text, and ProseMirror View
class MockRect {
    constructor(top, bottom, left, right) {
        this.top = top;
        this.bottom = bottom;
        this.left = left;
        this.right = right;
        this.width = Math.max(0, right - left);
        this.height = Math.max(0, bottom - top);
    }
}

class MockTextNode {
    constructor(text) {
        this.nodeType = 3;
        this.nodeValue = text;
        this.length = text.length;
    }
}

class MockElement {
    constructor(tagName, rect) {
        this.nodeType = 1;
        this.tagName = tagName.toUpperCase();
        this.rect = rect;
        this.children = [];
        this.childNodes = [];
    }

    getBoundingClientRect() {
        return this.rect;
    }

    appendChild(node) {
        this.childNodes.push(node);
        if (node.nodeType === 1) {
            this.children.push(node);
        }
    }
}

// Global DOM setup for Node test environment
global.NodeFilter = { SHOW_TEXT: 4 };

// Visual Lines definition
const lines = [
    { start: 0, end: 63, text: "Thật ra việc này không khó nhưng đòi hỏi tính cẩn thận khiến cho", top: 100, bottom: 124, left: 300, right: 780 },
    { start: 64, end: 123, text: "chúng ta phải suy nghĩ nhiều hơn trước khi bắt đầu triển khai", top: 124, bottom: 148, left: 300, right: 750 },
    { start: 124, end: 180, text: "mọi thứ trở nên mượt mà và dễ dàng hơn rất nhiều nhằm tránh", top: 148, bottom: 172, left: 300, right: 740 },
    { start: 181, end: 237, text: "cải thiện trải nghiệm của người dùng mà không gây lãng phí", top: 172, bottom: 196, left: 300, right: 770 },
    { start: 238, end: 293, text: "thời gian và công sức một cách không cần thiết và nặng nề.", top: 196, bottom: 220, left: 300, right: 600 }
];

const fullText = lines.map(l => l.text).join(' ');
const textNode = new MockTextNode(fullText);
const pEl = new MockElement('p', new MockRect(100, 220, 300, 1080));
pEl.appendChild(textNode);

const pmDom = new MockElement('div', new MockRect(0, 600, 0, 1200));
pmDom.appendChild(pEl);

global.document = {
    createTreeWalker(root, filter) {
        const nodes = [textNode];
        let idx = 0;
        return {
            nextNode() {
                if (idx < nodes.length) {
                    return nodes[idx++];
                }
                return null;
            }
        };
    },
    createRange() {
        let startNode = null;
        let startOffset = 0;
        let endOffset = 0;
        return {
            setStart(node, offset) {
                startNode = node;
                startOffset = offset;
            },
            setEnd(node, offset) {
                endOffset = offset;
            },
            getBoundingClientRect() {
                // Find which line startOffset belongs to
                let currentPos = 0;
                for (const line of lines) {
                    const lineLen = line.text.length + 1; // + space
                    if (startOffset >= currentPos && startOffset < currentPos + lineLen) {
                        const relOffset = startOffset - currentPos;
                        const charWidth = (line.right - line.left) / line.text.length;
                        const charLeft = line.left + relOffset * charWidth;
                        return new MockRect(line.top, line.bottom, charLeft, charLeft + charWidth);
                    }
                    currentPos += lineLen;
                }
                return new MockRect(lines[0].top, lines[0].bottom, lines[0].left, lines[0].left + 10);
            }
        };
    }
};

// Mock ProseMirror view & doc
const mockDoc = {
    content: {
        size: fullText.length + 2 // node open/close
    }
};

const mockView = {
    dom: pmDom,
    state: {
        doc: mockDoc
    },
    posFromDOM(node, offset) {
        // ProseMirror pos is 1-indexed inside paragraph
        return offset + 1;
    },
    posAtCoords({ left, top }) {
        return { pos: 50 };
    }
};

let passedCount = 0;

function runTest(testName, fn) {
    try {
        fn();
        console.log(`✅ PASS: ${testName}`);
        passedCount++;
    } catch (err) {
        console.error(`❌ FAIL: ${testName}`);
        console.error(err);
        process.exitCode = 1;
    }
}

// ------------------- TEST CASES -------------------

// TH1: Click left of visual line 1 -> caret at start of line 1 (before "Thật ra")
runTest('TH1: Click left of line 1 (before "Thật ra")', () => {
    const pos = getDocPositionFromPoint(mockView, 100, 112);
    // Line 1 starts at offset 0 -> pos = 1 (before 'T')
    assert.strictEqual(pos, 1, `Expected pos 1 (before 'T'), got ${pos}`);
    assert.strictEqual(isPointInText(mockView, 100, 112), false, 'Expected left margin to not be in text');
});

// TH2: Click left of visual line 4 -> caret at start of visual line 4 (before "cải thiện")
runTest('TH2: Click left of line 4 (before "cải thiện")', () => {
    const line4StartOffset = lines[0].text.length + 1 + lines[1].text.length + 1 + lines[2].text.length + 1;
    const pos = getDocPositionFromPoint(mockView, 100, 184);
    const expectedPos = line4StartOffset + 1;
    assert.strictEqual(pos, expectedPos, `Expected pos ${expectedPos} (before 'c'), got ${pos}`);
    assert.strictEqual(isPointInText(mockView, 100, 184), false, 'Expected left margin to not be in text');
});

// TH3 / Left Red Box: Click left below document -> caret at start of last line (before "thời gian")
runTest('TH3 / Left Red Box: Click left below document (before "thời gian")', () => {
    const line5StartOffset = lines[0].text.length + 1 + lines[1].text.length + 1 + lines[2].text.length + 1 + lines[3].text.length + 1;
    const pos = getDocPositionFromPoint(mockView, 100, 350);
    const expectedPos = line5StartOffset + 1;
    assert.strictEqual(pos, expectedPos, `Expected pos ${expectedPos} (start of line 5), got ${pos}`);
    assert.strictEqual(isPointInText(mockView, 100, 350), false, 'Expected below doc left to not be in text');
});

// TH4: Click right of visual line 1 -> caret at end of line 1 (after "khiến cho")
runTest('TH4: Click right of line 1 (after "khiến cho")', () => {
    const line1EndOffset = lines[0].text.length;
    const pos = getDocPositionFromPoint(mockView, 900, 112);
    const expectedPos = line1EndOffset + 1;
    assert.strictEqual(pos, expectedPos, `Expected pos ${expectedPos} (after 'o'), got ${pos}`);
    assert.strictEqual(isPointInText(mockView, 900, 112), false, 'Expected right margin to not be in text');
});

// TH5: Click right of visual line 4 -> caret at end of line 4 (after "lãng phí")
runTest('TH5: Click right of line 4 (after "lãng phí")', () => {
    const line4EndOffset = lines[0].text.length + 1 + lines[1].text.length + 1 + lines[2].text.length + 1 + lines[3].text.length;
    const pos = getDocPositionFromPoint(mockView, 900, 184);
    const expectedPos = line4EndOffset + 1;
    assert.strictEqual(pos, expectedPos, `Expected pos ${expectedPos} (after 'í'), got ${pos}`);
    assert.strictEqual(isPointInText(mockView, 900, 184), false, 'Expected right margin to not be in text');
});

// TH6 / Right Red Box bottom: Click right below document -> caret at end of document (after "nặng nề.")
runTest('TH6 / Right Red Box bottom: Click right below document (after "nặng nề.")', () => {
    const line5EndOffset = fullText.length;
    const pos = getDocPositionFromPoint(mockView, 900, 350);
    const expectedPos = line5EndOffset + 1;
    assert.strictEqual(pos, expectedPos, `Expected pos ${expectedPos} (doc end), got ${pos}`);
    assert.strictEqual(isPointInText(mockView, 900, 350), false, 'Expected below doc right to not be in text');
});

// Test 7: Direct click inside text is identified as in-text
runTest('Test 7: Direct click inside text is identified as in-text', () => {
    assert.strictEqual(isPointInText(mockView, 500, 112), true, 'Expected (500, 112) to be in text');
    assert.strictEqual(isPointInText(mockView, 500, 184), true, 'Expected (500, 184) to be in text');
});

console.log(`\n🎉 All ${passedCount}/7 unit tests passed successfully!`);
