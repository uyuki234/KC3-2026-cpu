import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { EditorView, keymap } from '@codemirror/view';
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';

export function Editor({
  value,
  onChange,
  onRun,
  location,
}: {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  location?: { line: number; key: number };
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView | null>(null);
  const callbacks = useRef({ onChange, onRun });
  callbacks.current = { onChange, onRun };
  useEffect(() => {
    const view = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        basicSetup,
        StreamLanguage.define(verilog),
        EditorView.contentAttributes.of({ 'aria-label': 'Verilogコード' }),
        syntaxHighlighting(
          HighlightStyle.define([
            { tag: tags.keyword, color: '#c8a6fa' },
            { tag: tags.number, color: '#9bd9b7' },
            { tag: tags.comment, color: '#8e9bb1' },
            { tag: tags.string, color: '#efd394' },
            { tag: tags.operator, color: '#95c9ef' },
          ]),
        ),
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              callbacks.current.onRun();
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) callbacks.current.onChange(update.state.doc.toString());
        }),
        EditorView.theme(
          {
            '&': { backgroundColor: '#151e30', color: '#e0e8f8', fontSize: '14px' },
            '.cm-content': {
              fontFamily: 'Consolas, monospace',
              padding: '20px 0',
              caretColor: '#a6e5ff',
            },
            '.cm-gutters': { backgroundColor: '#151e30', color: '#6c7c98', border: 'none' },
            '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#ffffff08' },
            '.cm-scroller': { overflow: 'auto', minHeight: '320px' },
            '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
              backgroundColor: '#365180 !important',
            },
          },
          { dark: true },
        ),
      ],
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
    // The editor persists across ordinary edits; external changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const view = editor.current;
    if (view && view.state.doc.toString() !== value)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);
  useEffect(() => {
    const view = editor.current;
    if (view && location) {
      const line = view.state.doc.line(Math.min(view.state.doc.lines, Math.max(1, location.line)));
      view.dispatch({ selection: { anchor: line.from, head: line.to }, scrollIntoView: true });
      view.focus();
    }
  }, [location]);
  return <div className="editor" ref={host} />;
}
