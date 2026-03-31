import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { searchKeymap } from "@codemirror/search";
import { HighlightStyle, bracketMatching, indentOnInput, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

export type CodeMirrorEditorHandle = {
  focus: () => void;
  insertTextAtCursor: (text: string) => void;
  appendTextToEnd: (text: string) => void;
  getSelectedText: () => string;
  replaceSelection: (text: string) => void;
};

export function normalizeDocNewlines(s: string): string {
  return s.replace(/\r\n/g, "\n");
}

function buildThemeExtensions() {
  const hl = HighlightStyle.define([
    { tag: tags.heading1, fontWeight: "700" },
    { tag: tags.heading2, fontWeight: "700" },
    { tag: tags.heading3, fontWeight: "700" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.strong, fontWeight: "700" },
    { tag: tags.link, color: "var(--accent)" },
    { tag: tags.monospace, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  ]);
  return [syntaxHighlighting(hl)];
}

export const CodeMirrorEditor = forwardRef<
  CodeMirrorEditorHandle,
  {
    value: string;
    onChange: (next: string) => void;
    ariaLabel?: string;
    placeholderText?: string;
    className?: string;
    readOnly?: boolean;
  }
>(function CodeMirrorEditor(
  { value, onChange, ariaLabel, placeholderText, className, readOnly },
  ref,
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const latestOnChangeRef = useRef(onChange);
  latestOnChangeRef.current = onChange;

  const extensions = useMemo(() => {
    const themeExt = buildThemeExtensions();
    return [
      history(),
      indentOnInput(),
      bracketMatching(),
      keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
      markdown(),
      EditorView.lineWrapping,
      placeholder(placeholderText ?? ""),
      EditorView.updateListener.of((v) => {
        if (!v.docChanged) return;
        const next = v.state.doc.toString();
        latestOnChangeRef.current(next);
      }),
      EditorState.readOnly.of(Boolean(readOnly)),
      ...themeExt,
    ];
  }, [placeholderText, readOnly]);

  useEffect(() => {
    if (!hostRef.current) return;
    if (viewRef.current) return;
    const st = EditorState.create({
      doc: normalizeDocNewlines(value),
      extensions,
    });
    const view = new EditorView({ state: st, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const next = normalizeDocNewlines(value);
    const cur = view.state.doc.toString();
    if (cur === next) return;
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: next },
    });
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => viewRef.current?.focus(),
      insertTextAtCursor: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      appendTextToEnd: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const end = view.state.doc.length;
        const ins = text;
        view.dispatch({
          changes: { from: end, to: end, insert: ins },
          selection: { anchor: end + ins.length },
          scrollIntoView: true,
        });
        view.focus();
      },
      getSelectedText: () => {
        const view = viewRef.current;
        if (!view) return "";
        const sel = view.state.selection.main;
        return view.state.doc.sliceString(sel.from, sel.to);
      },
      replaceSelection: (text: string) => {
        const view = viewRef.current;
        if (!view) return;
        const sel = view.state.selection.main;
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: text },
          selection: { anchor: sel.from + text.length },
          scrollIntoView: true,
        });
        view.focus();
      },
    }),
    [],
  );

  return <div ref={hostRef} className={className} aria-label={ariaLabel} />;
});

