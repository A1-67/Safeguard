"use client"

import { useRef, useState } from 'react';
import * as Tone from 'tone';

export function useSiren() {
  const [isActive, setIsActive] = useState(false);
  const synthRef = useRef<Tone.Synth | null>(null);
  const lfoRef = useRef<Tone.LFO | null>(null);

  const initSiren = () => {
    if (!synthRef.current) {
      // Using a single Synth for a clear siren sound
      synthRef.current = new Tone.Synth({
        oscillator: { type: 'square' },
        envelope: { attack: 0.1, decay: 0.2, sustain: 1, release: 0.8 }
      }).toDestination();

      // Create an LFO to modulate the frequency for the siren effect
      // This oscillates between 440Hz and 880Hz at 0.5Hz frequency (every 2 seconds)
      lfoRef.current = new Tone.LFO(0.5, 440, 880).start();
      
      // Correctly connect the LFO output to the synth's frequency parameter
      lfoRef.current.connect(synthRef.current.frequency);
    }
  };

  const toggleSiren = async () => {
    try {
      await Tone.start();
      initSiren();

      if (isActive) {
        synthRef.current?.triggerRelease();
        setIsActive(false);
      } else {
        // We trigger a base note, and the LFO handles the "wailing" oscillation
        synthRef.current?.triggerAttack("C4");
        setIsActive(true);
      }
    } catch (err) {
      console.error("Tone.js failed to start:", err);
    }
  };

  const stopSiren = () => {
    if (isActive) {
      synthRef.current?.triggerRelease();
      setIsActive(false);
    }
  };

  return { isActive, toggleSiren, stopSiren };
}
