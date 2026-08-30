/**
 * Nexus Floating UI Engine
 * Unified Anchored Positioning for Menus, Dropdowns, Context Menus, and Tooltips.
 * Features:
 * - Real-time scroll & resize tracking (follows anchor element on scroll)
 * - Smart viewport flip & edge collision clamping
 * - Compact, sleek minimalist design system
 * - Keyboard navigation (Escape, ArrowUp, ArrowDown, Enter)
 * - Click-outside dismissal
 */

export class NexusFloatingPositioner {
    /**
     * Compute fixed coordinates for floating element relative to an anchor or client point.
     * @param {Object} options
     * @param {HTMLElement|{x: number, y: number, width?: number, height?: number}} options.anchor
     * @param {HTMLElement} options.floating
     * @param {'bottom-start'|'bottom-end'|'top-start'|'top-end'|'right-start'|'left-start'|'auto'} [options.placement='bottom-start']
     * @param {number} [options.offset=4]
     * @param {number} [options.viewportPadding=8]
     * @returns {{x: number, y: number, placement: string, isAnchorVisible: boolean}}
     */
    static computePosition({
        anchor,
        floating,
        placement = 'bottom-start',
        offset = 4,
        viewportPadding = 8
    }) {
        if (!anchor || !floating) {
            return { x: 0, y: 0, placement, isAnchorVisible: false };
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const floatRect = floating.getBoundingClientRect();
        const floatWidth = floatRect.width || floating.offsetWidth || 180;
        const floatHeight = floatRect.height || floating.offsetHeight || 120;

        let anchorRect;
        if (anchor instanceof HTMLElement) {
            anchorRect = anchor.getBoundingClientRect();
        } else if (typeof anchor.x === 'number' && typeof anchor.y === 'number') {
            anchorRect = {
                top: anchor.y,
                bottom: anchor.y + (anchor.height || 1),
                left: anchor.x,
                right: anchor.x + (anchor.width || 1),
                width: anchor.width || 1,
                height: anchor.height || 1
            };
        } else {
            return { x: 0, y: 0, placement, isAnchorVisible: false };
        }

        let containerTop = 0;
        let containerBottom = viewportHeight;
        let containerLeft = 0;
        let containerRight = viewportWidth;

        if (anchor && typeof anchor.closest === 'function') {
            const scrollParent = anchor.closest('.nexus-chat-scroll-content, .nexus-chat-container, .notes-editor-pane, .nexus-detail-body, .notes-hub-view, .sparks-page-body');
            if (scrollParent && typeof scrollParent.getBoundingClientRect === 'function') {
                const parentRect = scrollParent.getBoundingClientRect();
                containerTop = Math.max(0, parentRect.top);
                containerBottom = Math.min(viewportHeight, parentRect.bottom);
                containerLeft = Math.max(0, parentRect.left);
                containerRight = Math.min(viewportWidth, parentRect.right);
            }
        }

        // Check if anchor is completely scrolled out of its visible container / viewport
        const isAnchorVisible = !(
            anchorRect.bottom <= containerTop ||
            anchorRect.top >= containerBottom ||
            anchorRect.right <= containerLeft ||
            anchorRect.left >= containerRight
        );

        if (!isAnchorVisible) {
            return { x: 0, y: 0, placement, isAnchorVisible: false };
        }

        let chosenPlacement = placement;
        let x = 0;
        let y = 0;

        // Auto placement / flipping logic strictly within visible container boundaries
        const spaceBelow = containerBottom - anchorRect.bottom - offset - viewportPadding;
        const spaceAbove = anchorRect.top - containerTop - offset - viewportPadding;
        const spaceRight = containerRight - anchorRect.right - offset - viewportPadding;
        const spaceLeft = anchorRect.left - containerLeft - offset - viewportPadding;

        if (placement.startsWith('bottom')) {
            if (spaceBelow < floatHeight && spaceAbove >= floatHeight) {
                chosenPlacement = placement.replace('bottom', 'top');
            }
        } else if (placement.startsWith('top')) {
            if (spaceAbove < floatHeight && spaceBelow >= floatHeight) {
                chosenPlacement = placement.replace('top', 'bottom');
            }
        }

        // Calculate Y position
        if (chosenPlacement.startsWith('bottom')) {
            y = anchorRect.bottom + offset;
        } else if (chosenPlacement.startsWith('top')) {
            y = anchorRect.top - floatHeight - offset;
        } else if (chosenPlacement === 'right-start') {
            y = anchorRect.top;
        } else if (chosenPlacement === 'left-start') {
            y = anchorRect.top;
        }

        // Calculate X position
        if (chosenPlacement.endsWith('start') || chosenPlacement === 'bottom' || chosenPlacement === 'top') {
            x = anchorRect.left;
        } else if (chosenPlacement.endsWith('end')) {
            x = anchorRect.right - floatWidth;
        } else if (chosenPlacement === 'right-start') {
            x = anchorRect.right + offset;
        } else if (chosenPlacement === 'left-start') {
            x = anchorRect.left - floatWidth - offset;
        }

        // Clamping inside container boundaries (guarantees menu stays below Topbar and above Input Area)
        x = Math.max(containerLeft + viewportPadding, Math.min(x, containerRight - floatWidth - viewportPadding));
        y = Math.max(containerTop + viewportPadding, Math.min(y, containerBottom - floatHeight - viewportPadding));

        return {
            x: Math.round(x),
            y: Math.round(y),
            placement: chosenPlacement,
            isAnchorVisible
        };
    }
}

/**
 * Singleton / Manager for Active Menus & Dropdowns
 */
export class NexusMenu {
    static _activeMenu = null;
    static _activeAnchor = null;
    static _activeCleanup = null;
    static _rafId = null;

    /**
     * Show a standardized compact menu anchored to an element or cursor coordinates.
     * @param {Object} config
     * @param {HTMLElement|{x: number, y: number}} config.anchor - Anchor element or point
     * @param {Array<{label?: string, icon?: string, shortcut?: string, danger?: boolean, disabled?: boolean, divider?: boolean, action?: Function}>} config.items
     * @param {'bottom-start'|'bottom-end'|'top-start'|'top-end'|'auto'} [config.placement='bottom-start']
     * @param {string} [config.className='']
     * @param {number} [config.minWidth=160]
     * @param {Function} [config.onClose]
     * @returns {HTMLElement|null} The created menu DOM element
     */
    static show({
        anchor,
        items = [],
        placement = 'bottom-start',
        className = '',
        minWidth = 160,
        onClose = null
    }) {
        // Toggle behavior: If clicking the same anchor when menu is already active, close and return null
        if (NexusMenu._activeMenu && NexusMenu._activeAnchor === anchor) {
            NexusMenu.close();
            return null;
        }

        // Close any existing open menu first
        NexusMenu.close();

        if (!items || items.length === 0) return null;

        NexusMenu._activeAnchor = anchor;

        const menuEl = document.createElement('div');
        menuEl.className = `nexus-menu ${className} is-open`.trim();
        menuEl.style.minWidth = `${minWidth}px`;
        menuEl.setAttribute('role', 'menu');
        menuEl.setAttribute('tabindex', '-1');

        menuEl.style.zIndex = '10005';

        const viewStack = [{ title: null, items }];

        const renderView = () => {
            menuEl.innerHTML = '';
            const currentView = viewStack[viewStack.length - 1];

            // If in a drilled-down submenu, render header with Back button
            if (viewStack.length > 1) {
                const headerEl = document.createElement('div');
                headerEl.className = 'nexus-menu-header';

                const backBtn = document.createElement('button');
                backBtn.type = 'button';
                backBtn.className = 'nexus-menu-back-btn';
                backBtn.setAttribute('aria-label', 'Back');
                backBtn.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>`;
                backBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    viewStack.pop();
                    renderView();
                    updatePosition();
                });

                const titleSpan = document.createElement('span');
                titleSpan.className = 'nexus-menu-header-title';
                titleSpan.textContent = currentView.title || 'Back';

                headerEl.appendChild(backBtn);
                headerEl.appendChild(titleSpan);
                menuEl.appendChild(headerEl);

                const divEl = document.createElement('div');
                divEl.className = 'nexus-menu-divider';
                divEl.setAttribute('role', 'separator');
                menuEl.appendChild(divEl);
            }

            currentView.items.forEach((item) => {
                if (item.divider) {
                    const divider = document.createElement('div');
                    divider.className = 'nexus-menu-divider';
                    divider.setAttribute('role', 'separator');
                    menuEl.appendChild(divider);
                    return;
                }

                const itemBtn = document.createElement('button');
                itemBtn.className = `nexus-menu-item ${item.danger ? 'is-danger' : ''} ${item.disabled ? 'is-disabled' : ''} ${item.active ? 'is-active' : ''}`.trim();
                itemBtn.setAttribute('role', 'menuitem');
                if (item.disabled) itemBtn.disabled = true;

                let iconHtml = '';
                if (item.icon) {
                    iconHtml = `<span class="nexus-menu-icon">${item.icon}</span>`;
                } else if (item.active) {
                    iconHtml = `<span class="nexus-menu-check"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
                }

                let badgeHtml = '';
                if (item.badge) {
                    badgeHtml = `<span class="nexus-menu-badge">${item.badge}</span>`;
                }

                let chevronHtml = '';
                if (item.submenu && item.submenu.length > 0) {
                    chevronHtml = `<span class="nexus-menu-chevron"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg></span>`;
                }

                let shortcutHtml = '';
                if (item.shortcut) {
                    shortcutHtml = `<span class="nexus-menu-shortcut">${item.shortcut}</span>`;
                }

                let textWrapHtml = `
                    <div class="nexus-menu-text-wrap">
                        <span class="nexus-menu-label">${item.label || ''}</span>
                        ${item.desc ? `<span class="nexus-menu-desc">${item.desc}</span>` : ''}
                    </div>
                `;

                itemBtn.innerHTML = `
                    ${iconHtml}
                    ${textWrapHtml}
                    ${badgeHtml}
                    ${shortcutHtml}
                    ${chevronHtml}
                `;

                itemBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (item.disabled) return;

                    // If item has a submenu, drill down in-place!
                    if (item.submenu && item.submenu.length > 0) {
                        viewStack.push({
                            title: item.submenuTitle || item.label || 'Options',
                            items: item.submenu
                        });
                        renderView();
                        updatePosition();
                        return;
                    }

                    NexusMenu.close();
                    if (typeof item.action === 'function') {
                        item.action(e);
                    }
                });

                menuEl.appendChild(itemBtn);
            });
        };

        renderView();
        document.body.appendChild(menuEl);
        NexusMenu._activeMenu = menuEl;

        // Positioning & Scroll Tracking
        const updatePosition = () => {
            if (!NexusMenu._activeMenu) return;
            const pos = NexusFloatingPositioner.computePosition({
                anchor,
                floating: menuEl,
                placement,
                offset: 4,
                viewportPadding: 6
            });

            // If anchor element is an HTMLElement and is scrolled out of viewport, close it
            if (anchor instanceof HTMLElement && !pos.isAnchorVisible) {
                NexusMenu.close();
                return;
            }

            menuEl.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        };

        // Initial measurement & position
        updatePosition();

        const scheduleUpdate = () => {
            if (NexusMenu._rafId) cancelAnimationFrame(NexusMenu._rafId);
            NexusMenu._rafId = requestAnimationFrame(updatePosition);
        };

        // Global listeners for scroll tracking, resize, and click-outside
        const onScrollCapture = (e) => {
            if (menuEl.contains(e.target)) return;
            scheduleUpdate();
        };

        const onResize = () => scheduleUpdate();

        const onPointerDownOutside = (e) => {
            if (!menuEl.contains(e.target) && !(anchor instanceof HTMLElement && anchor.contains(e.target))) {
                NexusMenu.close();
            }
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                NexusMenu.close();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const buttons = Array.from(menuEl.querySelectorAll('.nexus-menu-item:not(.is-disabled)'));
                if (buttons.length === 0) return;
                const activeIndex = buttons.indexOf(document.activeElement);
                if (e.key === 'ArrowDown') {
                    const next = activeIndex < buttons.length - 1 ? activeIndex + 1 : 0;
                    buttons[next]?.focus();
                } else {
                    const prev = activeIndex > 0 ? activeIndex - 1 : buttons.length - 1;
                    buttons[prev]?.focus();
                }
            }
        };

        window.addEventListener('scroll', onScrollCapture, { capture: true, passive: true });
        window.addEventListener('resize', onResize, { passive: true });
        document.addEventListener('pointerdown', onPointerDownOutside, { capture: true });
        document.addEventListener('keydown', onKeyDown, { capture: true });

        NexusMenu._activeCleanup = () => {
            window.removeEventListener('scroll', onScrollCapture, { capture: true });
            window.removeEventListener('resize', onResize);
            document.removeEventListener('pointerdown', onPointerDownOutside, { capture: true });
            document.removeEventListener('keydown', onKeyDown, { capture: true });
            if (NexusMenu._rafId) cancelAnimationFrame(NexusMenu._rafId);
            if (typeof onClose === 'function') onClose();
        };

        return menuEl;
    }

    /**
     * Close the currently active menu if open.
     */
    static close() {
        if (NexusMenu._activeCleanup) {
            NexusMenu._activeCleanup();
            NexusMenu._activeCleanup = null;
        }
        if (NexusMenu._activeMenu) {
            NexusMenu._activeMenu.remove();
            NexusMenu._activeMenu = null;
        }
        NexusMenu._activeAnchor = null;
    }

    /**
     * Returns true if a menu is currently open (optionally for a specific anchor).
     * @param {HTMLElement|Object} [anchor]
     * @returns {boolean}
     */
    static isOpen(anchor) {
        if (anchor) {
            return NexusMenu._activeMenu !== null && NexusMenu._activeAnchor === anchor;
        }
        return NexusMenu._activeMenu !== null;
    }
}

/**
 * Unified Tooltip System with scroll tracking
 */
export class NexusTooltip {
    static _activeTooltip = null;
    static _rafId = null;
    static _timer = null;

    /**
     * Initialize tooltip listeners on document for elements with data-tooltip
     */
    static init() {
        document.addEventListener('pointerenter', (e) => {
            const target = e.target?.closest?.('[data-tooltip]');
            if (!target) return;
            const text = target.getAttribute('data-tooltip');
            if (!text) return;

            const placement = target.getAttribute('data-tooltip-placement') || 'top';
            const shortcut = target.getAttribute('data-tooltip-shortcut') || '';
            const delay = Number(target.getAttribute('data-tooltip-delay')) || 250;

            NexusTooltip._timer = setTimeout(() => {
                NexusTooltip.show({ anchor: target, text, shortcut, placement });
            }, delay);
        }, true);

        document.addEventListener('pointerleave', (e) => {
            const target = e.target?.closest?.('[data-tooltip]');
            if (target) {
                clearTimeout(NexusTooltip._timer);
                NexusTooltip.hide();
            }
        }, true);

        document.addEventListener('pointerdown', () => {
            clearTimeout(NexusTooltip._timer);
            NexusTooltip.hide();
        }, true);
    }

    static show(arg1, arg2, arg3, arg4) {
        NexusTooltip.hide();
        let anchor, text, shortcut, placement;
        if (arg1 && typeof arg1 === 'object' && !('nodeType' in arg1) && !('tagName' in arg1)) {
            anchor = arg1.anchor;
            text = arg1.text;
            shortcut = arg1.shortcut || '';
            placement = arg1.placement || 'top';
        } else {
            anchor = arg1;
            text = arg2;
            shortcut = arg3 || '';
            placement = arg4 || 'top';
        }

        if (!anchor || !text) return null;

        const tipEl = document.createElement('div');
        tipEl.className = 'nexus-tooltip is-visible';
        tipEl.innerHTML = `
            <span class="nexus-tooltip-text">${text}</span>
            ${shortcut ? `<span class="nexus-tooltip-shortcut">${shortcut}</span>` : ''}
        `;

        document.body.appendChild(tipEl);
        NexusTooltip._activeTooltip = tipEl;

        const updatePos = () => {
            if (!NexusTooltip._activeTooltip) return;
            const pos = NexusFloatingPositioner.computePosition({
                anchor,
                floating: tipEl,
                placement: placement === 'top' ? 'top-start' : placement === 'bottom' ? 'bottom-start' : 'top-start',
                offset: 5,
                viewportPadding: 6
            });
            if (!pos.isAnchorVisible) {
                NexusTooltip.hide();
                return;
            }
            tipEl.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        };

        updatePos();
        return tipEl;
    }

    static hide() {
        if (NexusTooltip._activeTooltip) {
            NexusTooltip._activeTooltip.remove();
            NexusTooltip._activeTooltip = null;
        }
    }
}
