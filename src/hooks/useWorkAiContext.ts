import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getWorkStyleCard,
  listBibleCharacters,
  listBibleGlossaryTerms,
  listWritingStyleSamples,
  upsertWorkStyleCard,
} from "../db/repo";
import type { BibleCharacter, BibleGlossaryTerm, WritingStyleSample } from "../db/types";
import {
  defaultWorkAiRagInjectDefaults,
  loadWorkAiRagInjectDefaults,
  persistWorkAiRagInjectDefaults,
} from "../util/work-ai-rag-inject-defaults-storage";
import {
  defaultWorkAiWritingVars,
  loadWorkAiWritingVars,
  persistWorkAiWritingVars,
} from "../util/work-ai-vars-storage";
import type {
  AiPanelWorkRagInjectDefaultsPatch,
  AiPanelWorkStyle,
  AiPanelWorkStylePatch,
  AiPanelWorkWritingVarsPatch,
} from "../components/ai-panel/types";
import type { WritingStyleSampleSlice } from "../ai/assemble-context";

export function useWorkAiContext(workId: string | null) {
  const [stylePov, setStylePov] = useState("");
  const [styleTone, setStyleTone] = useState("");
  const [styleBanned, setStyleBanned] = useState("");
  const [styleAnchor, setStyleAnchor] = useState("");
  const [styleExtra, setStyleExtra] = useState("");
  const [styleSentenceRhythm, setStyleSentenceRhythm] = useState<string | undefined>(undefined);
  const [stylePunctuationStyle, setStylePunctuationStyle] = useState<string | undefined>(undefined);
  const [styleDialogueDensity, setStyleDialogueDensity] = useState<"low" | "medium" | "high" | undefined>(undefined);
  const [styleEmotionStyle, setStyleEmotionStyle] = useState<"cold" | "neutral" | "warm" | undefined>(undefined);
  const [styleNarrativeDistance, setStyleNarrativeDistance] = useState<
    "omniscient" | "limited" | "deep_pov" | undefined
  >(undefined);
  const [glossaryTerms, setGlossaryTerms] = useState<BibleGlossaryTerm[]>([]);
  const [bibleCharacters, setBibleCharacters] = useState<BibleCharacter[]>([]);
  const [writingStyleSamples, setWritingStyleSamples] = useState<WritingStyleSample[]>([]);
  const [workAiWritingVars, setWorkAiWritingVars] = useState(() =>
    workId ? loadWorkAiWritingVars(workId) : defaultWorkAiWritingVars(),
  );
  const [workAiRagInjectDefaults, setWorkAiRagInjectDefaults] = useState(() =>
    workId ? loadWorkAiRagInjectDefaults(workId) : defaultWorkAiRagInjectDefaults(),
  );

  const updateWorkStyleFromPanel = useCallback(
    (patch: AiPanelWorkStylePatch) => {
      if (!workId) return;
      if (patch.pov !== undefined) setStylePov(patch.pov);
      if (patch.tone !== undefined) setStyleTone(patch.tone);
      if (patch.bannedPhrases !== undefined) setStyleBanned(patch.bannedPhrases);
      if (patch.styleAnchor !== undefined) setStyleAnchor(patch.styleAnchor);
      if (patch.extraRules !== undefined) setStyleExtra(patch.extraRules);
      if (patch.sentenceRhythm !== undefined) setStyleSentenceRhythm(patch.sentenceRhythm);
      if (patch.punctuationStyle !== undefined) setStylePunctuationStyle(patch.punctuationStyle);
      if (patch.dialogueDensity !== undefined) setStyleDialogueDensity(patch.dialogueDensity);
      if (patch.emotionStyle !== undefined) setStyleEmotionStyle(patch.emotionStyle);
      if (patch.narrativeDistance !== undefined) setStyleNarrativeDistance(patch.narrativeDistance);
      void upsertWorkStyleCard(workId, patch);
    },
    [workId],
  );

  const aiPanelWorkStyle: AiPanelWorkStyle = useMemo(
    () => ({
      pov: stylePov,
      tone: styleTone,
      bannedPhrases: styleBanned,
      styleAnchor,
      extraRules: styleExtra,
      sentenceRhythm: styleSentenceRhythm,
      punctuationStyle: stylePunctuationStyle,
      dialogueDensity: styleDialogueDensity,
      emotionStyle: styleEmotionStyle,
      narrativeDistance: styleNarrativeDistance,
    }),
    [
      stylePov,
      styleTone,
      styleBanned,
      styleAnchor,
      styleExtra,
      styleSentenceRhythm,
      stylePunctuationStyle,
      styleDialogueDensity,
      styleEmotionStyle,
      styleNarrativeDistance,
    ],
  );

  useEffect(() => {
    if (!workId) return;
    const t = window.setTimeout(() => persistWorkAiWritingVars(workId, workAiWritingVars), 400);
    return () => clearTimeout(t);
  }, [workId, workAiWritingVars]);

  const patchWorkAiWritingVars = useCallback((patch: AiPanelWorkWritingVarsPatch) => {
    setWorkAiWritingVars((prev) => ({ ...prev, ...patch }));
  }, []);

  useEffect(() => {
    if (!workId) return;
    const t = window.setTimeout(() => persistWorkAiRagInjectDefaults(workId, workAiRagInjectDefaults), 400);
    return () => clearTimeout(t);
  }, [workId, workAiRagInjectDefaults]);

  const patchWorkAiRagInjectDefaults = useCallback((patch: AiPanelWorkRagInjectDefaultsPatch) => {
    setWorkAiRagInjectDefaults((prev) => ({ ...prev, ...patch }));
  }, []);

  const syncNeighborSummaryIncludeByIds = useCallback((ids: string[]) => {
    setWorkAiRagInjectDefaults((prev) => {
      const next: Record<string, boolean> = {};
      for (const id of ids) {
        next[id] = prev.neighborSummaryIncludeById[id] !== false;
      }
      const prevKeys = Object.keys(prev.neighborSummaryIncludeById);
      if (
        prevKeys.length === ids.length &&
        ids.every((id) => prev.neighborSummaryIncludeById[id] === next[id])
      ) {
        return prev;
      }
      return { ...prev, neighborSummaryIncludeById: next };
    });
  }, []);

  const refreshStudyLibrary = useCallback(async () => {
    if (!workId) return;
    const [chars, gloss] = await Promise.all([listBibleCharacters(workId), listBibleGlossaryTerms(workId)]);
    setBibleCharacters(chars);
    setGlossaryTerms(gloss);
  }, [workId]);

  useEffect(() => {
    if (!workId) return;
    let cancelled = false;
    void (async () => {
      const [chars, gloss, samples, styleRow, writingVars, ragInjectDefaults] = await Promise.all([
        listBibleCharacters(workId),
        listBibleGlossaryTerms(workId),
        listWritingStyleSamples(workId),
        getWorkStyleCard(workId),
        Promise.resolve(loadWorkAiWritingVars(workId)),
        Promise.resolve(loadWorkAiRagInjectDefaults(workId)),
      ]);
      if (cancelled) return;
      setBibleCharacters(chars);
      setGlossaryTerms(gloss);
      setWritingStyleSamples(samples);
      setWorkAiWritingVars(writingVars);
      setWorkAiRagInjectDefaults(ragInjectDefaults);
      setStylePov(styleRow?.pov ?? "");
      setStyleTone(styleRow?.tone ?? "");
      setStyleBanned(styleRow?.bannedPhrases ?? "");
      setStyleAnchor(styleRow?.styleAnchor ?? "");
      setStyleExtra(styleRow?.extraRules ?? "");
      setStyleSentenceRhythm(styleRow?.sentenceRhythm);
      setStylePunctuationStyle(styleRow?.punctuationStyle);
      setStyleDialogueDensity(styleRow?.dialogueDensity);
      setStyleEmotionStyle(styleRow?.emotionStyle);
      setStyleNarrativeDistance(styleRow?.narrativeDistance);
    })();
    return () => {
      cancelled = true;
    };
  }, [workId]);

  const styleSampleSlices: WritingStyleSampleSlice[] = useMemo(
    () => writingStyleSamples.map((s) => ({ title: s.title, body: s.body })),
    [writingStyleSamples],
  );

  return {
    glossaryTerms,
    bibleCharacters,
    styleSampleSlices,
    aiPanelWorkStyle,
    updateWorkStyleFromPanel,
    workAiWritingVars,
    patchWorkAiWritingVars,
    workAiRagInjectDefaults,
    patchWorkAiRagInjectDefaults,
    syncNeighborSummaryIncludeByIds,
    refreshStudyLibrary,
  };
}
