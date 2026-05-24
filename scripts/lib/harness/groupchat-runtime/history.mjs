import { normalizeHandoffPayload } from '../handoff.mjs';
import { normalizeModelRouting } from '../../model-router.mjs';
import { normalizeText } from './shared.mjs';

export class ConversationHistory {
  constructor() {
    this.entries = [];
  }

  get length() {
    return this.entries.length;
  }

  get lastRound() {
    if (this.entries.length === 0) return 0;
    return Math.max(...this.entries.map((entry) => entry.roundNumber));
  }

  get lastEntry() {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  addEntry({ speaker, role, roundNumber, handoff, rawOutput = '', elapsedMs = 0, modelRouting = null }) {
    const normalizedModelRouting = normalizeModelRouting(modelRouting);
    const entry = {
      turnNumber: this.entries.length + 1,
      roundNumber: Number.isFinite(roundNumber) ? Math.max(1, Math.floor(roundNumber)) : 1,
      speaker: normalizeText(speaker),
      role: normalizeText(role) || normalizeText(speaker),
      handoff: handoff && typeof handoff === 'object' ? normalizeHandoffPayload(handoff) : normalizeHandoffPayload({}),
      rawOutput: normalizeText(rawOutput),
      elapsedMs: Number.isFinite(elapsedMs) ? Math.floor(elapsedMs) : 0,
      ...(normalizedModelRouting ? { modelRouting: normalizedModelRouting } : {}),
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    return entry;
  }

  getEntriesByRound(roundNumber) {
    return this.entries.filter((entry) => entry.roundNumber === roundNumber);
  }

  speakersByRound(roundNumber) {
    return [...new Set(this.getEntriesByRound(roundNumber).map((entry) => entry.speaker))];
  }

  lastEntriesByRole(role) {
    const normalized = normalizeText(role).toLowerCase();
    return this.entries.filter((entry) => entry.role.toLowerCase() === normalized);
  }

  toJSON() {
    return this.entries.map((entry) => ({ ...entry }));
  }
}
