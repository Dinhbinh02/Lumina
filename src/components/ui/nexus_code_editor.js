import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands';
import { html } from '@codemirror/lang-html';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

/**
 * Custom Nexus Dracula/Dark Highlight Style matching components.css exactly
 */
export const nexusCustomHighlightStyle = HighlightStyle.define([
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.quote], color: '#6272a4', fontStyle: 'italic' },
    { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.moduleKeyword, t.definitionKeyword], color: '#ff79c6', fontWeight: '600' },
    { tag: [t.string, t.special(t.string), t.character, t.inserted], color: '#50fa7b' },
    { tag: [t.number, t.integer, t.float, t.unit, t.color, t.bool, t.null, t.atom, t.literal], color: '#bd93f9' },
    { tag: [t.className, t.typeName, t.standard(t.name), t.labelName, t.namespace, t.macroName], color: '#8be9fd' },
    { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], color: '#50fa7b' },
    { tag: [t.attributeName, t.propertyName, t.definition(t.propertyName)], color: '#f1fa8c' },
    { tag: [t.tagName, t.angleBracket, t.standard(t.tagName)], color: '#ff79c6' },
    { tag: [t.variableName, t.definition(t.variableName), t.special(t.variableName), t.self], color: '#ffb86c' },
    { tag: [t.attributeValue], color: '#50fa7b' },
    { tag: [t.heading, t.strong], color: '#8be9fd', fontWeight: 'bold' },
    { tag: [t.deleted, t.invalid], color: '#ff5555' },
    { tag: [t.meta, t.processingInstruction, t.documentMeta], color: '#50fa7b' },
    { tag: [t.punctuation, t.separator, t.bracket, t.paren, t.brace], color: '#f8f8f2' },
    { tag: [t.operator, t.compareOperator, t.arithmeticOperator, t.logicOperator, t.bitwiseOperator], color: '#ff79c6' }
]);

/**
 * NexusCodeEditor - High performance in-browser code editor using CodeMirror 6 with custom pure black theme.
 */
export class NexusCodeEditor {
    constructor(containerEl, options = {}) {
        this.container = containerEl;
        this.options = {
            initialCode: '',
            language: 'html',
            readOnly: false,
            onChange: null,
            ...options
        };
        this.view = null;
        this.isUpdatingFromExternal = false;
        this.init();
    }

    init() {
        if (!this.container) return;
        this.container.innerHTML = '';

        const themeExtensions = EditorView.theme({
            "&": {
                height: "100%",
                width: "100%",
                fontSize: "13px",
                fontFamily: "var(--nexus-font-family-monospace, 'Google Sans Code', ui-monospace, monospace)",
                backgroundColor: "#000000",
                color: "#f8f8f2"
            },
            ".cm-scroller": {
                overflow: "auto",
                fontFamily: "inherit",
                lineHeight: "1.6",
                height: "100%"
            },
            ".cm-content": {
                padding: "14px 18px",
                caretColor: "#50fa7b"
            },
            ".cm-gutters": {
                backgroundColor: "#000000",
                color: "rgba(255, 255, 255, 0.35)",
                borderRight: "1px solid rgba(255, 255, 255, 0.08)",
                paddingRight: "8px",
                userSelect: "none"
            },
            ".cm-activeLine": {
                backgroundColor: "rgba(255, 255, 255, 0.04)"
            },
            ".cm-activeLineGutter": {
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                color: "#ffffff"
            },
            ".cm-selectionMatch": {
                backgroundColor: "rgba(255, 255, 255, 0.15)"
            },
            "&.cm-focused .cm-cursor": {
                borderLeftColor: "#50fa7b",
                borderLeftWidth: "2px"
            },
            "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
                backgroundColor: "rgba(98, 114, 164, 0.45) !important"
            },
            ".cm-foldGutter span": {
                color: "rgba(255, 255, 255, 0.4)"
            }
        }, { dark: true });

        const updateListener = EditorView.updateListener.of((update) => {
            if (update.docChanged && !this.isUpdatingFromExternal) {
                const newCode = update.state.doc.toString();
                if (typeof this.options.onChange === 'function') {
                    this.options.onChange(newCode);
                }
            }
        });

        const extensions = [
            basicSetup,
            html(),
            syntaxHighlighting(nexusCustomHighlightStyle),
            themeExtensions,
            updateListener,
            keymap.of([
                indentWithTab,
                ...defaultKeymap,
                ...historyKeymap
            ])
        ];

        if (this.options.readOnly) {
            extensions.push(EditorState.readOnly.of(true));
        }

        const state = EditorState.create({
            doc: this.options.initialCode || '',
            extensions
        });

        this.view = new EditorView({
            state,
            parent: this.container
        });
    }

    getValue() {
        return this.view ? this.view.state.doc.toString() : '';
    }

    setValue(code) {
        if (!this.view) return;
        const currentDoc = this.view.state.doc.toString();
        const nextCode = (code !== undefined && code !== null) ? code : '';
        if (currentDoc === nextCode) return;

        this.isUpdatingFromExternal = true;
        this.view.dispatch({
            changes: { from: 0, to: currentDoc.length, insert: nextCode }
        });
        this.isUpdatingFromExternal = false;
    }

    focus() {
        if (this.view) {
            this.view.focus();
        }
    }

    destroy() {
        if (this.view) {
            this.view.destroy();
            this.view = null;
        }
    }
}
