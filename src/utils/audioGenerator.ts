/**
 * In-browser synthesized audio generator
 * Generates self-contained, 100% reliable 16-bit PCM WAV Data URLs.
 * Prevents network 404s, CORS blocks, and browser MediaError / NotSupportedError.
 */

export function generateSynthesizedTrackAudio(melodyType: number = 1): string {
  const sampleRate = 22050; // 22.05 kHz is lightweight and clear for ambient synth
  const durationSeconds = 6;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // Helper to write string to DataView
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // RIFF chunk descriptor
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');

  // fmt sub-chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1 = Mono)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16 bits)

  // data sub-chunk
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Musical scales for procedural lofi / ambient melodies
  // F frequencies in Hz
  const scales: number[][] = [
    [261.63, 329.63, 392.00, 523.25, 659.25], // C Major / Ambient Chime (C4, E4, G4, C5, E5)
    [220.00, 261.63, 329.63, 440.00, 523.25], // A Minor / Lofi Chill (A3, C4, E4, A4, C5)
    [174.61, 220.00, 261.63, 349.23, 440.00], // F Major / Sunset Vibes (F3, A3, C4, F4, A4)
  ];

  const scale = scales[(melodyType - 1) % scales.length] || scales[0];
  const noteDuration = sampleRate * 1.2; // ~1.2s per chord/note

  // Synthesize soft ambient tones with harmonic overtones and envelope
  for (let i = 0; i < numSamples; i++) {
    const time = i / sampleRate;
    const noteIdx = Math.floor((i / noteDuration)) % scale.length;
    const baseFreq = scale[noteIdx];
    const nextFreq = scale[(noteIdx + 2) % scale.length];

    // Note envelope (Attack-Decay)
    const notePos = (i % noteDuration) / noteDuration;
    const envelope = Math.sin(Math.PI * Math.min(1, Math.max(0, notePos)));

    // Fundamental + 2nd Harmonic + Soft sub-harmonic
    const osc1 = Math.sin(2 * Math.PI * baseFreq * time);
    const osc2 = 0.35 * Math.sin(2 * Math.PI * nextFreq * time);
    const osc3 = 0.2 * Math.sin(2 * Math.PI * (baseFreq * 0.5) * time);

    // Warm tremolo effect
    const lfo = 0.85 + 0.15 * Math.sin(2 * Math.PI * 2.5 * time);

    let sample = (osc1 + osc2 + osc3) * envelope * lfo * 0.45;

    // Soft clipper to prevent distortion
    sample = Math.max(-1, Math.min(1, sample));

    // Convert to 16-bit integer
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(44 + i * 2, Math.floor(intSample), true);
  }

  // Convert buffer to base64 Data URL
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:audio/wav;base64,${base64}`;
}
