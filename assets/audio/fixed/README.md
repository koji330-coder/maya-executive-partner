# Fixed MAYA voice clips

Rendered offline with OmniVoice Studio, per `docs/ASSET_PIPELINE.md` §4.

Expected files:

```text
greeting_morning_01.m4a
greeting_general_01.m4a
strong_disagree_01.m4a
wait_01.m4a
numbers_01.m4a
praise_01.m4a
```

All six are rendered, from the `MAYA v2` clone (profile `58d6907b`).

`src/services/audio/clipManifest.ts` is the manifest, and every duration and
envelope in it was measured from its own render by `tools/measure_envelope.py`.
Lip sync reads the envelope, not the audio stream, so the track must ship with
the clip — and an estimated one closes her mouth mid-word.

To re-render a line, change the text in the manifest, render it through the same
profile, and re-measure. Do not hand-edit a duration. The playback engine is swapped from `EnvelopeAudioEngine` to an
expo-audio implementation in Phase 6; nothing outside `src/services/audio/`
changes.
