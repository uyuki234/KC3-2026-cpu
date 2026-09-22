import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
export default function Editor({
  value,
  onChange,
  label,
  onRun,
  location,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  onRun?: () => void;
  location?: { line: number; key: number };
}) {
  const host = useRef<HTMLDivElement>(null),
    instance = useRef<EditorView | null>(null),
    syncing = useRef(false),
    callbacks = useRef({ onChange, onRun });
  callbacks.current = { onChange, onRun };
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        basicSetup,
        StreamLanguage.define(verilog),
        EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              callbacks.current.onRun?.();
              return true;
            },
          },
        ]),
        syntaxHighlighting(
          HighlightStyle.define([
            { tag: tags.keyword, color: '#cab8ff' },
            { tag: tags.number, color: '#97dfbb' },
            { tag: tags.comment, color: '#94a6bc' },
            { tag: tags.string, color: '#f0cf97' },
            { tag: tags.operator, color: '#9dcaff' },
          ]),
        ),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !syncing.current)
            callbacks.current.onChange(update.state.doc.toString());
        }),
        EditorView.theme(
          {
            '&': { backgroundColor: '#172336', color: '#e4edf8', fontSize: '13px' },
            '.cm-content': {
              fontFamily: 'Consolas, monospace',
              padding: '18px 0',
              caretColor: '#a4ddff',
            },
            '.cm-gutters': { backgroundColor: '#172336', border: 'none', color: '#7d91ac' },
            '.cm-scroller': { minHeight: '350px', maxHeight: '610px', overflow: 'auto' },
            '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#ffffff08' },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
              backgroundColor: '#385379 !important',
            },
          },
          { dark: true },
        ),
      ],
    });
    instance.current = view;
    return () => {
      view.destroy();
      instance.current = null;
    };
  }, []);
  useEffect(() => {
    const view = instance.current;
    const normalized = value.replace(/\r\n?/g, '\n');
    if (view && normalized !== view.state.doc.toString()) {
      syncing.current = true;
      try {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: normalized } });
      } finally {
        syncing.current = false;
      }
    }
  }, [value]);
  useEffect(() => {
    const view = instance.current;
    if (view && location) {
      const line = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, location.line)));
      view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
      view.focus();
    }
  }, [location]);
  return <div ref={host} className="editor" />;
}
