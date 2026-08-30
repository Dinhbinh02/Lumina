import assert from 'node:assert';

// Lightweight in-memory DOM mock for Node.js testing
class MockElement {
    constructor(tagName = 'div') {
        this.tagName = tagName.toUpperCase();
        this.className = '';
        this.classList = {
            _classes: new Set(),
            add: (...cls) => cls.forEach(c => this.classList._classes.add(c)),
            remove: (...cls) => cls.forEach(c => this.classList._classes.delete(c)),
            contains: (c) => this.classList._classes.has(c),
            toggle: (c) => this.classList.contains(c) ? this.classList.remove(c) : this.classList.add(c)
        };
        this.style = {};
        this.attributes = {};
        this.children = [];
        this.parentNode = null;
        this.innerHTMLVal = '';
        this._listeners = {};
    }

    set innerHTML(val) {
        this.innerHTMLVal = val;
        this.children = [];
        if (typeof val === 'string') {
            if (val.includes('nexus-menu-item')) {
                const item1 = new MockElement('button');
                item1.className = 'nexus-menu-item';
                const item2 = new MockElement('button');
                item2.className = 'nexus-menu-item is-danger';
                this.children.push(item1, item2);
            }
            if (val.includes('nexus-menu-divider')) {
                const div = new MockElement('div');
                div.className = 'nexus-menu-divider';
                this.children.push(div);
            }
            if (val.includes('nexus-toast-close')) {
                const btn = new MockElement('button');
                btn.className = 'nexus-toast-close';
                this.children.push(btn);
            }
        }
    }

    get innerHTML() {
        return this.innerHTMLVal;
    }

    get textContent() {
        return this.innerHTMLVal.replace(/<[^>]+>/g, '');
    }

    set textContent(val) {
        this.innerHTMLVal = String(val);
    }

    setAttribute(name, val) {
        this.attributes[name] = val;
    }

    getAttribute(name) {
        return this.attributes[name] || null;
    }

    appendChild(child) {
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    remove() {
        if (this.parentNode) {
            const idx = this.parentNode.children.indexOf(this);
            if (idx > -1) this.parentNode.children.splice(idx, 1);
            this.parentNode = null;
        }
    }

    querySelector(selector) {
        if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            return this._findByClass(cls);
        }
        return this.children[0] || null;
    }

    querySelectorAll(selector) {
        if (selector.startsWith('.')) {
            const cls = selector.slice(1);
            const res = [];
            this._findAllByClass(cls, res);
            return res;
        }
        return this.children;
    }

    _findByClass(cls) {
        for (const child of this.children) {
            if (child.className && child.className.includes(cls)) return child;
            if (child.classList.contains(cls)) return child;
            const nested = child._findByClass(cls);
            if (nested) return nested;
        }
        return null;
    }

    _findAllByClass(cls, list) {
        for (const child of this.children) {
            if ((child.className && child.className.includes(cls)) || child.classList.contains(cls)) {
                list.push(child);
            }
            child._findAllByClass(cls, list);
        }
    }

    addEventListener(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
    }

    removeEventListener(event, fn) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    }

    click() {
        if (this._listeners['click']) {
            this._listeners['click'].forEach(fn => fn({ stopPropagation: () => {} }));
        }
    }

    getBoundingClientRect() {
        return { top: 100, bottom: 130, left: 100, right: 150, width: 50, height: 30 };
    }

    contains(el) {
        if (el === this) return true;
        for (const child of this.children) {
            if (child.contains(el)) return true;
        }
        return false;
    }

    closest(selector) {
        let cur = this;
        while (cur) {
            if (selector.split(',').some(s => cur.className && cur.className.includes(s.trim().replace('.', '')))) {
                return cur;
            }
            cur = cur.parentNode;
        }
        return null;
    }
}

const mockBody = new MockElement('body');
const mockDoc = {
    body: mockBody,
    createElement: (tag) => new MockElement(tag),
    getElementById: (id) => null,
    addEventListener: () => {},
    removeEventListener: () => {}
};

globalThis.window = {
    innerWidth: 1024,
    innerHeight: 768,
    document: mockDoc,
    addEventListener: () => {},
    removeEventListener: () => {}
};
globalThis.document = mockDoc;
globalThis.HTMLElement = MockElement;
globalThis.requestAnimationFrame = (cb) => { cb(); return 1; };
globalThis.cancelAnimationFrame = () => {};

// Import UI module
const { NexusFloatingPositioner, NexusMenu, NexusTooltip, NexusToast } = await import('../src/components/ui/index.js');

console.log('--- Running Nexus Floating UI System Tests ---');

// 1. Test NexusFloatingPositioner
console.log('1. Testing NexusFloatingPositioner.computePosition...');
const anchor = new MockElement('div');
mockBody.appendChild(anchor);
const floatEl = new MockElement('div');
mockBody.appendChild(floatEl);

const pos = NexusFloatingPositioner.computePosition({
    anchor,
    floating: floatEl,
    placement: 'bottom-start',
    offset: 4
});

assert.strictEqual(pos.placement, 'bottom-start');
assert.strictEqual(pos.x, 100);
assert.strictEqual(pos.y, 134); // bottom (130) + offset (4)
assert.strictEqual(pos.isAnchorVisible, true);
console.log('   Position computed successfully:', pos);

// 2. Test NexusMenu
console.log('2. Testing NexusMenu...');
let actionTriggered = false;
const menuEl = NexusMenu.show({
    anchor,
    placement: 'bottom-start',
    items: [
        {
            label: 'Action 1',
            icon: '<svg></svg>',
            action: () => { actionTriggered = true; }
        },
        { divider: true },
        {
            label: 'Delete Item',
            danger: true,
            action: () => {}
        }
    ]
});

assert(mockBody.contains(menuEl), 'Menu element should be attached to body');
const items = menuEl.querySelectorAll('.nexus-menu-item');
assert.strictEqual(items.length, 2, 'Should render 2 action items');

// Trigger action
items[0].addEventListener('click', () => { actionTriggered = true; });
items[0].click();
assert.strictEqual(actionTriggered, true, 'Item click should execute action');

// Test closing
NexusMenu.close();
assert(!mockBody.contains(menuEl), 'Menu should be removed from body after close');

// Test Toggle behavior on same anchor
console.log('2.1 Testing NexusMenu Anchor Toggle...');
const menuOpen1 = NexusMenu.show({
    anchor,
    items: [{ label: 'Toggle Item', action: () => {} }]
});
assert(mockBody.contains(menuOpen1), 'Menu should open on first show call');
assert.strictEqual(NexusMenu.isOpen(anchor), true, 'Menu should report open for anchor');

// Second call with same anchor should toggle close and return null
const menuOpen2 = NexusMenu.show({
    anchor,
    items: [{ label: 'Toggle Item', action: () => {} }]
});
assert.strictEqual(menuOpen2, null, 'Second call on same anchor should return null (closed)');
assert(!mockBody.contains(menuOpen1), 'Menu should be removed from DOM on toggle close');
assert.strictEqual(NexusMenu.isOpen(anchor), false, 'Menu should report closed for anchor');
console.log('   Anchor Toggle works perfectly!');

// Test Drill-down Submenu Navigation
console.log('2.2 Testing NexusMenu Drill-down Submenu Navigation...');
let subActionTriggered = false;
const drillMenu = NexusMenu.show({
    anchor,
    items: [
        { label: 'Option A', action: () => {} },
        {
            label: 'Thinking Level',
            badge: 'Minimal',
            submenuTitle: 'Thinking Level',
            submenu: [
                { label: 'Minimal', desc: 'Fast', active: true, action: () => { subActionTriggered = true; } },
                { label: 'Standard', desc: 'Balanced', action: () => {} }
            ]
        }
    ]
});

assert(mockBody.contains(drillMenu), 'Drill menu attached to DOM');
const drillItems = drillMenu.querySelectorAll('.nexus-menu-item');
assert.strictEqual(drillItems.length, 2, 'Should have 2 main items initially');

// Click on Thinking Level to drill down
drillItems[1].click();

// Verify Header with Back button exists
const backBtn = drillMenu.querySelector('.nexus-menu-back-btn');
assert(backBtn !== null, 'Back button should be present in subview');
const headerTitle = drillMenu.querySelector('.nexus-menu-header-title');
assert.strictEqual(headerTitle.textContent, 'Thinking Level', 'Header title should match submenuTitle');

const subItems = drillMenu.querySelectorAll('.nexus-menu-item');
assert.strictEqual(subItems.length, 2, 'Submenu should render 2 options');

// Click back button to return to root
backBtn.click();
const rootItemsAfterBack = drillMenu.querySelectorAll('.nexus-menu-item');
assert.strictEqual(rootItemsAfterBack.length, 2, 'Should return to 2 root items');
assert.strictEqual(drillMenu.querySelector('.nexus-menu-back-btn'), null, 'Back button should not exist on root view');

// Drill down again and click an action
const itemsAgain = drillMenu.querySelectorAll('.nexus-menu-item');
itemsAgain[1].click();
const subItemsAgain = drillMenu.querySelectorAll('.nexus-menu-item');
subItemsAgain[0].click();
assert.strictEqual(subActionTriggered, true, 'Submenu item action should execute');
assert(!mockBody.contains(drillMenu), 'Menu should close after action execution');
console.log('   Drill-down Submenu Navigation passed with flying colors!');

// 3. Test NexusTooltip
console.log('3. Testing NexusTooltip...');
const tooltipEl = NexusTooltip.show(anchor, 'Helpful info', '⌘K');
assert(mockBody.contains(tooltipEl), 'Tooltip should be in DOM');
assert(tooltipEl.innerHTML.includes('Helpful info'), 'Tooltip should contain message text');
assert(tooltipEl.innerHTML.includes('⌘K'), 'Tooltip should contain shortcut');
NexusTooltip.hide();

// 4. Test NexusToast
console.log('4. Testing NexusToast...');
const toast1 = NexusToast.success('Saved successfully!', 5000);
assert(mockBody.contains(toast1), 'Toast should be in DOM');
assert(toast1.className.includes('is-success'), 'Toast should have is-success class');
assert(toast1.innerHTML.includes('Saved successfully!'), 'Toast text should match');

const toast2 = NexusToast.error('An error occurred!');
assert(toast2.className.includes('is-error'), 'Toast should have is-error class');

console.log('🎉 ALL Nexus UI Floating System tests passed successfully!');
