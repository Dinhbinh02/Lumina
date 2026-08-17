import React, { useEffect, useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";

function BlockNoteApp({ initialBlocks, onChange, onEditorReady }) {
    const wrapperRef = useRef(null);
    const [theme, setTheme] = useState(
        document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    );

    const editor = useCreateBlockNote({
        initialContent: (initialBlocks && Array.isArray(initialBlocks) && initialBlocks.length > 0) ? initialBlocks : undefined,
    });

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

    // Notion-style Marquee Drag Selection Handler
    useEffect(() => {
        const wrapper = wrapperRef.current;
        if (!wrapper || !editor) return;

        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let marqueeEl = null;
        let selectedBlockIds = new Set();

        const handleMouseDown = (e) => {
            if (e.button !== 0) return;

            // Only trigger marquee selection when clicking in empty margin/gutter padding outside blocks
            const isInsideBlock = e.target.closest('.bn-block, .bn-block-outer, [data-node-type="blockOuter"]');
            const isInteractive = e.target.closest('button, input, .bn-side-menu, .bn-inline-content');

            if (isInsideBlock || isInteractive) return;

            // Prevent default browser drag scroll when dragging from empty margin space
            e.preventDefault();

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            selectedBlockIds.clear();

            // Clear previous marquee highlights
            wrapper.querySelectorAll('.lumina-marquee-selected').forEach(el => {
                el.classList.remove('lumina-marquee-selected');
            });

            marqueeEl = document.createElement('div');
            marqueeEl.className = 'notes-marquee-box';
            marqueeEl.style.left = `${startX}px`;
            marqueeEl.style.top = `${startY}px`;
            marqueeEl.style.width = '0px';
            marqueeEl.style.height = '0px';
            document.body.appendChild(marqueeEl);

            document.addEventListener('mousemove', handleMouseMove, true);
            document.addEventListener('mouseup', handleMouseUp, true);
        };

        const handleMouseMove = (e) => {
            if (!isDragging || !marqueeEl) return;

            e.preventDefault();
            e.stopPropagation();

            const currentX = e.clientX;
            const currentY = e.clientY;

            const left = Math.min(startX, currentX);
            const top = Math.min(startY, currentY);
            const width = Math.abs(currentX - startX);
            const height = Math.abs(currentY - startY);

            if (width < 3 && height < 3) return;

            marqueeEl.style.left = `${left}px`;
            marqueeEl.style.top = `${top}px`;
            marqueeEl.style.width = `${width}px`;
            marqueeEl.style.height = `${height}px`;

            const marqueeRect = { left, top, right: left + width, bottom: top + height };
            selectedBlockIds.clear();

            const blocks = wrapper.querySelectorAll('[data-id], .bn-block-outer, [data-node-type="blockOuter"]');
            blocks.forEach((blockEl) => {
                const rect = blockEl.getBoundingClientRect();
                const intersects = !(
                    rect.right < marqueeRect.left ||
                    rect.left > marqueeRect.right ||
                    rect.bottom < marqueeRect.top ||
                    rect.top > marqueeRect.bottom
                );

                if (intersects) {
                    blockEl.classList.add('lumina-marquee-selected');
                    const id = blockEl.getAttribute('data-id');
                    if (id) selectedBlockIds.add(id);
                } else {
                    blockEl.classList.remove('lumina-marquee-selected');
                }
            });
        };

        const handleMouseUp = (e) => {
            if (!isDragging) return;
            isDragging = false;

            const endX = e ? e.clientX : startX;
            const endY = e ? e.clientY : startY;
            const dragDistance = Math.hypot(endX - startX, endY - startY);
            const isSimpleClick = dragDistance < 5;

            if (marqueeEl && marqueeEl.parentNode) {
                marqueeEl.parentNode.removeChild(marqueeEl);
            }
            marqueeEl = null;

            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);

            // Always clear any visual marquee selection highlights
            wrapper.querySelectorAll('.lumina-marquee-selected').forEach(el => {
                el.classList.remove('lumina-marquee-selected');
            });

            if (isSimpleClick) {
                // If simple click in empty margin space: clear selection & focus the last block
                try {
                    const docBlocks = editor.document;
                    if (docBlocks && docBlocks.length > 0) {
                        const lastBlock = docBlocks[docBlocks.length - 1];
                        editor.setTextCursorPosition(lastBlock, 'end');
                        editor.focus();
                    }
                } catch (err) {
                    console.warn('Focus last block error:', err);
                }
            } else if (selectedBlockIds.size > 0 && editor?._tiptapEditor) {
                // Sync with native TipTap/ProseMirror selection across selected blocks
                try {
                    const tiptap = editor._tiptapEditor;
                    const { state } = tiptap.view;
                    let minPos = Infinity;
                    let maxPos = -Infinity;

                    state.doc.descendants((node, pos) => {
                        if (node.isBlock && node.attrs && node.attrs.id) {
                            if (selectedBlockIds.has(node.attrs.id)) {
                                if (pos < minPos) minPos = pos;
                                const endPos = pos + node.nodeSize;
                                if (endPos > maxPos) maxPos = endPos;
                            }
                        }
                    });

                    if (minPos !== Infinity && maxPos !== -Infinity) {
                        tiptap.commands.setTextSelection({ from: minPos, to: maxPos });
                    }
                } catch (err) {
                    console.warn('Marquee selection sync error:', err);
                }
            }
        };

        wrapper.addEventListener('mousedown', handleMouseDown, true);
        return () => {
            wrapper.removeEventListener('mousedown', handleMouseDown, true);
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

window.LuminaBlockNote = {
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
