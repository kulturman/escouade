// « Dictée » (ESC-96): one dictation at a time (one microphone), for the composer or the Claude Code terminal of an
// agent, fixed when it starts. The text goes to that agent even if another is shown by the time it is transcribed.

import { getDraft, setDraft } from './drafts';
import { t } from './i18n';
import { api } from './ipc';
import { IS_MAC } from './platform';
import { app } from './state.svelte';
import type { VoiceEvent, VoiceProgress } from './types';
import { appendDictation } from './voice-text';

export interface VoiceTarget {
  kind: 'composer' | 'terminal';
  agentId: string;
}

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'transcribing';

/** The models offered, smallest first (the backend's catalog, `voice::models`). */
export const VOICE_MODELS = ['tiny', 'base', 'small-q5_1', 'large-v3-turbo-q5_0'] as const;
export type VoiceModelId = (typeof VOICE_MODELS)[number];
/** The key of a model's texts (`voice.model.<key>`): the catalog's keys are camelCase. */
export const MODEL_KEY = { tiny: 'tiny', base: 'base', 'small-q5_1': 'small', 'large-v3-turbo-q5_0': 'largeTurbo' } as const;

const modelKey = (id: string) => (MODEL_KEY as Record<string, (typeof MODEL_KEY)[VoiceModelId]>)[id];
/** A model's name (« Small »); an id the window does not know, as it is. */
export const modelName = (id: string) => (modelKey(id) ? t(`voice.model.${modelKey(id)}.name`) : id);
/** What a model is worth (« juste et rapide »). */
export const modelDesc = (id: string) => (modelKey(id) ? t(`voice.model.${modelKey(id)}.desc`) : '');
export const RECOMMENDED_MODEL = 'small-q5_1';
/** « Langue parlée »: the interface's, detected, or one of these. */
export const VOICE_LANGUAGES = ['ui', 'auto', 'fr', 'en', 'es', 'de', 'it', 'pt', 'nl'] as const;

type Inserter = (text: string) => void;

class Voice {
  phase = $state<VoicePhase>('idle');
  /** The microphone's level, 0 to 1, while listening. */
  level = $state(0);
  target = $state<VoiceTarget | null>(null);
  /** The models downloading: bytes received and total. */
  downloads = $state<Record<string, VoiceProgress>>({});
  #inserters = new Map<string, Inserter>();
  #cancelled = new Set<string>();

  /** True while `target` is listened to or transcribed. */
  isFor(target: VoiceTarget): boolean {
    return this.phase !== 'idle' && this.target?.kind === target.kind && this.target.agentId === target.agentId;
  }

  /** The composer shown for `agentId` takes the text at its caret; the returned function lets go. */
  registerInserter(agentId: string, insert: Inserter): () => void {
    this.#inserters.set(agentId, insert);
    return () => {
      if (this.#inserters.get(agentId) === insert) this.#inserters.delete(agentId);
    };
  }

  /** The microphone button and the shortcut: stops the dictation under way, whoever it is for, else starts one. */
  async toggle(target: VoiceTarget) {
    if (this.phase === 'recording') return this.stop();
    if (this.phase === 'idle') return this.start(target);
  }

  async start(target: VoiceTarget) {
    if (this.phase !== 'idle') return;
    this.phase = 'starting';
    this.target = target;
    try {
      const models = await api.voiceModels();
      if (!models.find((m) => m.id === app.settings.voiceModel)?.installed) {
        this.reset();
        app.modal = { kind: 'voiceSetup', target };
        return;
      }
      await api.voiceStart((e) => this.#onEvent(e));
      this.phase = 'recording';
    } catch (e) {
      this.reset();
      app.toast(String(e), 'error');
    }
  }

  async stop() {
    if (this.phase !== 'recording' || !this.target) return;
    const target = this.target;
    this.phase = 'transcribing';
    this.level = 0;
    try {
      await this.#deliver(target, await api.voiceStop());
    } catch (e) {
      app.toast(String(e), 'error');
    } finally {
      this.reset();
    }
  }

  async cancel() {
    if (this.phase !== 'recording') return;
    this.reset();
    await api.voiceCancel().catch((e) => app.toast(String(e), 'error'));
  }

  /** Downloads `model`, its progress in `downloads`. False when it was downloading already or got cancelled. */
  async download(model: string): Promise<boolean> {
    if (this.downloads[model]) return false;
    this.downloads[model] = { received: 0, total: 0 };
    try {
      await api.voiceDownload(model, (p) => (this.downloads[model] = p));
      return true;
    } catch (e) {
      if (this.#cancelled.has(model)) return false;
      throw e;
    } finally {
      delete this.downloads[model];
      this.#cancelled.delete(model);
    }
  }

  async cancelDownload(model: string) {
    this.#cancelled.add(model);
    await api.voiceCancelDownload(model);
  }

  /** Back to rest (tests start from it too). */
  reset() {
    this.phase = 'idle';
    this.level = 0;
    this.target = null;
  }

  #onEvent(e: VoiceEvent) {
    if (this.phase !== 'recording') return;
    if (e.type === 'level') {
      this.level = e.value;
      return;
    }
    if (e.reason === 'muted') {
      this.reset();
      api.voiceCancel().catch(() => {});
      app.toast(
        t('voice.muted'),
        'error',
        IS_MAC ? { label: t('voice.openPrivacy'), onClick: () => void api.voiceOpenPrivacy().catch(() => {}) } : undefined,
      );
      return;
    }
    if (e.reason === 'limit') app.toast(t('voice.limit'));
    void this.stop();
  }

  async #deliver(target: VoiceTarget, text: string) {
    if (!text.trim()) {
      app.toast(t('voice.nothingHeard'));
      return;
    }
    if (target.kind === 'terminal') {
      const id = app.agents[target.agentId]?.terminalId;
      // Loaded on demand: xterm.js has no business in the composer's way.
      const { getXTerm } = await import('./terminals');
      const xterm = id ? getXTerm(id) : undefined;
      if (xterm) {
        xterm.term.paste(text);
        xterm.term.focus();
        return;
      }
      // Its terminal closed meanwhile: the text is not lost.
      navigator.clipboard.writeText(text).then(
        () => app.toast(t('voice.copied')),
        (e) => app.toast(String(e), 'error'),
      );
      return;
    }
    const insert = this.#inserters.get(target.agentId);
    if (insert) insert(text);
    else {
      const draft = getDraft(target.agentId);
      setDraft(target.agentId, { ...draft, text: appendDictation(draft.text, text) });
    }
  }
}

export const voice = new Voice();
