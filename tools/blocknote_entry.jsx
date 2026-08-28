import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

const MARQUEE_STYLES = `
.blocknote-wrapper.is-marquee-dragging,
.blocknote-wrapper.is-marquee-dragging * {
  user-select: none !important;
  -webkit-user-select: none !important;
  pointer-events: none !important;
}

.notes-marquee-box {
  position: fixed !important;
  background: rgba(35, 131, 226, 0.08) !important;
  border: 1px solid rgba(35, 131, 226, 0.5) !important;
  border-radius: 3px !important;
  pointer-events: none !important;
  z-index: 999999 !important;
  box-sizing: border-box !important;
}

.bn-block-outer {
  position: relative !important;
}

.bn-block-outer.nexus-marquee-selected::after {
  content: "" !important;
  position: absolute !important;
  inset: 1px 0px !important;
  background: rgba(35, 131, 226, 0.16) !important;
  border-radius: 4px !important;
  pointer-events: none !important;
  z-index: 10 !important;
}

[data-theme="dark"] .notes-marquee-box {
  background: rgba(45, 170, 219, 0.1) !important;
  border-color: rgba(45, 170, 219, 0.6) !important;
}

[data-theme="dark"] .bn-block-outer.nexus-marquee-selected::after {
  background: rgba(45, 170, 219, 0.25) !important;
}
`;

function BlockNoteApp({ initialBlocks, onChange, onEditorReady }) {
    const wrapperRef = useRef(null);
    const [theme, setTheme] = useState(
        document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    );

    const editor = useCreateBlockNote({
        initialContent: (initialBlocks && Array.isArray(initialBlocks) && initialBlocks.length > 0) ? initialBlocks : undefined,
    });

    useEffect(() => {
        let styleEl = document.getElementById('nexus-marquee-injected-styles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'nexus-marquee-injected-styles';
            styleEl.textContent = MARQUEE_STYLES;
            document.head.appendChild(styleEl);
        } else {
            styleEl.textContent = MARQUEE_STYLES;
        }
    }, []);

    useEffect(() => {
        const observer = new MutationObserver(() => {
            const isDark = document.body.getAttribute('data-theme') === 'dark';
            setTheme(isDark ? 'dark' : 'light');
        });
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (editor) {
            if (onEditorReady) onEditorReady(editor);
        }
    }, [editor]);

    useEffect(() => {
        if (editor && onChange) {
            let lastBlockId = null;
            const unsubscribe = editor.onChange(() => {
                onChange(editor.document);

                // Auto-create empty paragraph below divider if focused on divider
                try {
                    const cursorPosition = editor.getTextCursorPosition();
                    const currentBlock = cursorPosition?.block;
                    if (currentBlock && currentBlock.type === 'divider' && currentBlock.id !== lastBlockId) {
                        lastBlockId = currentBlock.id;
                        const nextBlock = cursorPosition.nextBlock;
                        if (!nextBlock) {
                            const newBlock = editor.insertBlocks(
                                [{ type: 'paragraph' }],
                                currentBlock,
                                'after'
                            )[0];
                            if (newBlock) {
                                editor.setTextCursorPosition(newBlock, 'start');
                            }
                        } else {
                            editor.setTextCursorPosition(nextBlock, 'start');
                        }
                    }
                } catch (e) {
                    // Ignore transient selection states
                }
            });
            return () => {
                if (typeof unsubscribe === 'function') unsubscribe();
            };
        }
    }, [editor, onChange]);

    // Notion-style 2-stage Cmd+A / Ctrl+A handler using native TipTap/ProseMirror state
    useEffect(() => {
        const containerEl = wrapperRef.current;
        if (!containerEl || !editor) return;

        const handleKeyDown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
                try {
                    const tiptap = editor._tiptapEditor;
                    if (tiptap && tiptap.view && tiptap.view.state) {
                        const { state } = tiptap.view;
                        const { $from, from, to } = state.selection;

                        const blockStart = $from.start();
                        const blockEnd = $from.end();
                        const blockTextLen = blockEnd - blockStart;

                        if (blockTextLen > 0) {
                            const isBlockFullySelected = (from === blockStart && to === blockEnd);

                            if (!isBlockFullySelected) {
                                e.preventDefault();
                                e.stopPropagation();
                                e.stopImmediatePropagation();

                                tiptap.commands.setTextSelection({ from: blockStart, to: blockEnd });
                                return;
                            }
                        }
                    }
                } catch (err) {
                    console.warn('Custom Cmd+A handler error:', err);
                }
            }
        };

        containerEl.addEventListener('keydown', handleKeyDown, true);
        return () => containerEl.removeEventListener('keydown', handleKeyDown, true);
    }, [editor]);

    // Notion-style Block Marquee Selection Handler
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || !editor) return;

        let isPointerDown = false;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let marqueeEl = null;
        let selectedBlockIds = new Set();

        const clearSelection = () => {
            selectedBlockIds.clear();
            wrapper.querySelectorAll('.nexus-marquee-selected').forEach(el => {
                el.classList.remove('nexus-marquee-selected');
            });
        };

        const handleKeyDown = (e) => {
            if (selectedBlockIds.size === 0) return;

            if (e.key === 'Backspace' || e.key === 'Delete') {
                e.preventDefault();
                e.stopPropagation();
                try {
                    const idsToRemove = Array.from(selectedBlockIds);
                    editor.removeBlocks(idsToRemove);
                } catch (err) {
                    console.warn('Remove selected blocks error:', err);
                }
                clearSelection();
                return;
            }

            if (e.key === 'Escape') {
                e.preventDefault();
                clearSelection();
                return;
            }

            // Copy selected blocks
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
                try {
                    const blocksToCopy = [];
                    const traverse = (blocks) => {
                        if (!blocks) return;
                        for (const b of blocks) {
                            if (selectedBlockIds.has(b.id)) blocksToCopy.push(b);
                            if (b.children) traverse(b.children);
                        }
                    };
                    traverse(editor.document);
                    if (blocksToCopy.length > 0) {
                        const md = editor.blocksToMarkdownLossy(blocksToCopy);
                        if (md) navigator.clipboard.writeText(md);
                    }
                } catch (err) {
                    console.warn('Copy blocks error:', err);
                }
                return;
            }

            // Cut selected blocks
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
                e.preventDefault();
                try {
                    const blocksToCopy = [];
                    const traverse = (blocks) => {
                        if (!blocks) return;
                        for (const b of blocks) {
                            if (selectedBlockIds.has(b.id)) blocksToCopy.push(b);
                            if (b.children) traverse(b.children);
                        }
                    };
                    traverse(editor.document);
                    if (blocksToCopy.length > 0) {
                        const md = editor.blocksToMarkdownLossy(blocksToCopy);
                        if (md) navigator.clipboard.writeText(md);
                    }
                    const idsToRemove = Array.from(selectedBlockIds);
                    editor.removeBlocks(idsToRemove);
                } catch (err) {
                    console.warn('Cut blocks error:', err);
                }
                clearSelection();
                return;
            }
        };

        const updateIntersection = (marqueeRect) => {
            if (!wrapper || !marqueeRect) return;
            const blocks = wrapper.querySelectorAll('.bn-block-outer, [data-node-type="blockOuter"]');

            blocks.forEach((blockEl) => {
                const id = blockEl.getAttribute('data-id') || 
                           blockEl.querySelector('[data-id]')?.getAttribute('data-id') ||
                           blockEl.getAttribute('data-node-id');
                if (!id) return;

                const rect = blockEl.getBoundingClientRect();
                const intersects = !(
                    rect.right < marqueeRect.left ||
                    rect.left > marqueeRect.right ||
                    rect.bottom < marqueeRect.top ||
                    rect.top > marqueeRect.bottom
                );

                const isSelected = selectedBlockIds.has(id);
                if (intersects && !isSelected) {
                    selectedBlockIds.add(id);
                    blockEl.classList.add('nexus-marquee-selected');
                } else if (!intersects && isSelected) {
                    selectedBlockIds.delete(id);
                    blockEl.classList.remove('nexus-marquee-selected');
                }
            });
        };

        const handleMouseDown = (e) => {
            if (e.button !== 0) return;

            // Prevent drag on interactive buttons/menus
            const isInteractive = e.target.closest('button, .bn-side-menu, .bn-file-delete-button, input, textarea, a, select, [role="button"]');
            if (isInteractive) return;

            // Clear previous selection if clicking outside of current selection
            if (selectedBlockIds.size > 0 && !e.target.closest('.nexus-marquee-selected')) {
                clearSelection();
            }

            // Prevent native browser text drag/selection from hijacking mousemove
            e.preventDefault();

            isPointerDown = true;
            isDragging = false;
            startX = e.clientX;
            startY = e.clientY;

            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (e) => {
            if (!isPointerDown) return;

            const currentX = e.clientX;
            const currentY = e.clientY;
            const dragDistance = Math.hypot(currentX - startX, currentY - startY);

            if (!isDragging) {
                if (dragDistance < 4) return;
                isDragging = true;
                wrapper.classList.add('is-marquee-dragging');
                clearSelection();
                window.getSelection()?.removeAllRanges();

                try {
                    editor?._tiptapEditor?.view?.dom?.blur?.();
                } catch (_) {}

                marqueeEl = document.createElement('div');
                marqueeEl.className = 'notes-marquee-box';
                document.body.appendChild(marqueeEl);
            }

            e.preventDefault();
            e.stopPropagation();

            window.getSelection()?.removeAllRanges();

            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            if (marqueeEl) {
                marqueeEl.style.left = `${left}px`;
                marqueeEl.style.top = `${top}px`;
                marqueeEl.style.width = `${width}px`;
                marqueeEl.style.height = `${height}px`;
            }

            const marqueeRect = { left, top, right: left + width, bottom: top + height };
            updateIntersection(marqueeRect);
        };

        const handleMouseUp = (e) => {
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);

            if (!isPointerDown) return;
            isPointerDown = false;

            if (wrapper) {
                wrapper.classList.remove('is-marquee-dragging');
            }

            if (marqueeEl && marqueeEl.parentNode) {
                marqueeEl.parentNode.removeChild(marqueeEl);
            }
            marqueeEl = null;

            if (isDragging) {
                isDragging = false;
                window.getSelection()?.removeAllRanges();
            } else {
                clearSelection();
                try {
                    if (editor?._tiptapEditor) {
                        const view = editor._tiptapEditor.view;
                        const pos = view.posAtCoords({ left: startX, top: startY });
                        if (pos && typeof pos.pos === 'number') {
                            editor._tiptapEditor.commands.setTextSelection(pos.pos);
                        }
                        editor._tiptapEditor.commands.focus();
                    }
                } catch (err) {
                    console.warn('Click focus error:', err);
                }
            }
        };

        wrapper.addEventListener('mousedown', handleMouseDown, true);
        window.addEventListener('keydown', handleKeyDown, true);

        return () => {
            wrapper.removeEventListener('mousedown', handleMouseDown, true);
            window.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
            if (marqueeEl && marqueeEl.parentNode) {
                marqueeEl.parentNode.removeChild(marqueeEl);
            }
        };
    }, [editor]);

    return (
        <div ref={wrapperRef} className="blocknote-wrapper" style={{ width: '100%', background: 'transparent' }}>
            <BlockNoteView editor={editor} theme={theme} />
        </div>
    );
}

window.NexusBlockNote = {
    mount(container, initialBlocks, onChange) {
        if (!container) return null;
        container.innerHTML = '';
        const root = createRoot(container);
        let editorRef = null;

        root.render(
            <BlockNoteApp
                initialBlocks={initialBlocks}
                onChange={onChange}
                onEditorReady={(ed) => { editorRef = ed; }}
            />
        );

        return {
            root,
            get editor() {
                return editorRef;
            },
            getBlocks() {
                return editorRef ? editorRef.document : [];
            },
            unmount() {
                root.unmount();
                container.innerHTML = '';
            }
        };
    }
};
