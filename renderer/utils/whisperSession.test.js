import { describe, it, expect } from 'vitest';
import {
  buildTranscriptionConfig, buildSessionConfig, shouldForceCommit, SOFT_COMMIT_MS, HARD_COMMIT_MS,
} from './whisperSession';

const base = { langA: 'en', langB: 'ko', customInstruction: '', recentTranscripts: [] };

describe('buildTranscriptionConfig', () => {
  it('pins the source language for fixed directions', () => {
    expect(buildTranscriptionConfig({ ...base, direction: 'a-to-b' }).language).toBe('en');
    expect(buildTranscriptionConfig({ ...base, direction: 'b-to-a' }).language).toBe('ko');
  });

  it('omits language in auto mode', () => {
    expect(buildTranscriptionConfig({ ...base, direction: 'auto' })).not.toHaveProperty('language');
  });

  it('keeps the custom instruction in the prompt when recent context is added', () => {
    const cfg = buildTranscriptionConfig({
      ...base, direction: 'a-to-b',
      customInstruction: 'Terms: Kubernetes, Overdare',
      recentTranscripts: ['We deploy on Kubernetes.', 'Then we scale.'],
    });
    expect(cfg.language).toBe('en');
    expect(cfg.prompt).toBe('Terms: Kubernetes, Overdare\nWe deploy on Kubernetes. Then we scale.');
  });

  it('omits prompt when there is nothing to say', () => {
    expect(buildTranscriptionConfig({ ...base, direction: 'auto' })).not.toHaveProperty('prompt');
  });

  it('always names the transcription model', () => {
    expect(buildTranscriptionConfig({ ...base, direction: 'auto' }).model).toBe('gpt-4o-transcribe');
  });
});

describe('buildSessionConfig', () => {
  it('wraps the transcription config in a GA transcription session with VAD and noise reduction', () => {
    const transcription = { model: 'gpt-4o-transcribe', language: 'ko' };
    expect(buildSessionConfig(transcription)).toEqual({
      type: 'transcription',
      audio: {
        input: {
          format: { type: 'audio/pcm', rate: 24000 },
          transcription,
          turn_detection: { type: 'semantic_vad', eagerness: 'high' },
          noise_reduction: { type: 'near_field' },
        },
      },
    });
  });
});

describe('buildTranscriptionConfig context size', () => {
  it('keeps only the tail of long context, starting at a word', () => {
    const long = Array.from({ length: 40 }, (_, i) => `sentence number ${i}.`);
    const cfg = buildTranscriptionConfig({ ...base, direction: 'auto', recentTranscripts: long });
    expect(cfg.prompt.length).toBeLessThanOrEqual(240);
    expect(cfg.prompt.endsWith('sentence number 39.')).toBe(true);
    expect(cfg.prompt).not.toContain('sentence number 0.');
  });
});

describe('shouldForceCommit', () => {
  it('never commits a buffer without speech', () => {
    expect(shouldForceCommit({ sinceCommitMs: 60000, hadSpeech: false, isQuiet: true })).toBe(false);
  });

  it('waits for a short pause after the soft limit', () => {
    expect(shouldForceCommit({ sinceCommitMs: SOFT_COMMIT_MS - 1, hadSpeech: true, isQuiet: true })).toBe(false);
    expect(shouldForceCommit({ sinceCommitMs: SOFT_COMMIT_MS, hadSpeech: true, isQuiet: false })).toBe(false);
    expect(shouldForceCommit({ sinceCommitMs: SOFT_COMMIT_MS, hadSpeech: true, isQuiet: true })).toBe(true);
  });

  it('commits run-on speech at the hard limit even without a pause', () => {
    expect(shouldForceCommit({ sinceCommitMs: HARD_COMMIT_MS, hadSpeech: true, isQuiet: false })).toBe(true);
  });
});
