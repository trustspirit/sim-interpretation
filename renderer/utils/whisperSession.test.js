import { describe, it, expect } from 'vitest';
import { buildTranscriptionConfig, buildSessionConfig } from './whisperSession';

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
