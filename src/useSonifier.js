import { useEffect, useRef, useCallback } from 'react';

// Sonification: the world becomes audible, so emergence needs no extra UI.
// A low drone tracks population density, a second layer mutates during
// ruleset storms, and gardener interventions fire a sub-bass thump.
export const useSonifier = ({ enabled, density, isStorming, event }) => {
  const ctxRef = useRef(null);
  const nodesRef = useRef(null);
  const densityRef = useRef(density);
  const stormRef = useRef(isStorming);
  const enabledRef = useRef(enabled);

  const updateParams = useCallback(() => {
    const ctx = ctxRef.current;
    const nodes = nodesRef.current;
    if (!ctx || !nodes) return;
    const t = ctx.currentTime;
    if (!enabledRef.current) {
      nodes.droneGain.gain.setTargetAtTime(0, t, 0.15);
      nodes.stormGain.gain.setTargetAtTime(0, t, 0.15);
      return;
    }
    const d = Math.max(0, Math.min(1, densityRef.current));
    nodes.drone.frequency.setTargetAtTime(28 + d * 110, t, 0.25);
    nodes.droneGain.gain.setTargetAtTime(0.04 + d * 0.10, t, 0.25);
    nodes.stormGain.gain.setTargetAtTime(stormRef.current ? 0.035 : 0.0, t, 0.4);
  }, []);

  // Audio needs a user gesture first (autoplay policy); call from any click/key.
  const unlock = useCallback(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctxRef.current) {
      const ctx = new AC();
      const drone = ctx.createOscillator();
      drone.type = 'sine';
      drone.frequency.value = 40;
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0;
      drone.connect(droneGain);
      droneGain.connect(ctx.destination);
      drone.start();

      const storm = ctx.createOscillator();
      storm.type = 'sawtooth';
      storm.frequency.value = 66;
      const stormGain = ctx.createGain();
      stormGain.gain.value = 0;
      storm.connect(stormGain);
      stormGain.connect(ctx.destination);
      storm.start();

      const thumpOsc = ctx.createOscillator();
      thumpOsc.type = 'sine';
      thumpOsc.frequency.value = 55;
      const thumpGain = ctx.createGain();
      thumpGain.gain.value = 0;
      thumpOsc.connect(thumpGain);
      thumpGain.connect(ctx.destination);
      thumpOsc.start();

      ctxRef.current = ctx;
      nodesRef.current = { drone, droneGain, storm, stormGain, thumpGain };
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume();
    updateParams();
  }, [updateParams]);

  // Keep the live knob values in refs and retune whenever they change
  useEffect(() => {
    densityRef.current = density;
    stormRef.current = isStorming;
    enabledRef.current = enabled;
    updateParams();
  }, [updateParams, density, isStorming, enabled]);

  // Thump on each gardener event
  useEffect(() => {
    if (!enabled || event === 0 || !ctxRef.current || !nodesRef.current) return;
    const ctx = ctxRef.current;
    const t = ctx.currentTime;
    const g = nodesRef.current.thumpGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.20, t);
    g.exponentialRampToValueAtTime(0.0001, t + 0.12);
  }, [event, enabled]);

  return { unlock };
};