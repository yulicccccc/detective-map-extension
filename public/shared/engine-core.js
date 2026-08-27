// shared/engine-core.js - Deterministic AI Chunking and Schema Validation Core
// Shared between Cloudflare Worker, Browser Client, and Verification Test Suite

function chunkSourceText(text, maxChunkSize = 2800, overlap = 250) {
  if (!text || text.length <= maxChunkSize) return [text || ''];
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    let end = start + maxChunkSize;
    if (end < text.length) {
      const lastBreak = text.lastIndexOf('\n', end);
      const lastPeriod = text.lastIndexOf('. ', end);
      if (lastBreak > start + maxChunkSize * 0.7) {
        end = lastBreak + 1;
      } else if (lastPeriod > start + maxChunkSize * 0.7) {
        end = lastPeriod + 2;
      }
    } else {
      end = text.length;
    }
    chunks.push(text.slice(start, end));
    start = end > start ? end - overlap : end;
    if (end >= text.length) break;
  }
  return chunks;
}

function validateAndSanitizeOperations(rawOps, existingConcepts, existingEdges, sourceId) {
  if (!Array.isArray(rawOps)) return [];
  const conceptIds = new Set((existingConcepts || []).map(c => c.id));
  const seenLabels = new Set((existingConcepts || []).map(c => (c.label || '').toLowerCase()));
  const tempIds = new Set();
  const validOps = [];

  for (const op of rawOps) {
    if (!op || typeof op !== 'object') continue;

    if (op.op === 'add_concept') {
      const label = typeof op.label === 'string' ? op.label.trim() : '';
      if (label.length >= 2 && label.length <= 120) {
        if (seenLabels.has(label.toLowerCase())) {
          const match = existingConcepts.find(c => (c.label || '').toLowerCase() === label.toLowerCase());
          if (match && op.description) {
            validOps.push({
              op: 'enrich_concept',
              conceptId: match.id,
              addition: op.description.trim(),
              sourceRefs: [sourceId]
            });
          }
        } else {
          const tempId = op.tempId || 'tmp_' + Math.random().toString(36).slice(2, 8);
          tempIds.add(tempId);
          seenLabels.add(label.toLowerCase());
          validOps.push({
            op: 'add_concept',
            tempId,
            label,
            description: typeof op.description === 'string' ? op.description.trim() : '',
            sourceRefs: [sourceId]
          });
        }
      }
    } else if (op.op === 'enrich_concept') {
      if (op.conceptId && conceptIds.has(op.conceptId) && typeof op.addition === 'string' && op.addition.trim().length > 0) {
        validOps.push({
          op: 'enrich_concept',
          conceptId: op.conceptId,
          addition: op.addition.trim(),
          sourceRefs: [sourceId]
        });
      }
    } else if (op.op === 'add_edge') {
      const fromValid = conceptIds.has(op.from) || tempIds.has(op.from);
      const toValid = conceptIds.has(op.to) || tempIds.has(op.to);
      if (fromValid && toValid && op.from !== op.to) {
        validOps.push({
          op: 'add_edge',
          from: op.from,
          to: op.to,
          relation: typeof op.relation === 'string' ? op.relation : 'relates',
          label: typeof op.label === 'string' ? op.label.trim() : '',
          sourceRefs: [sourceId]
        });
      }
    } else if (op.op === 'flag_conflict') {
      if (op.conceptId && conceptIds.has(op.conceptId)) {
        validOps.push({
          op: 'flag_conflict',
          conceptId: op.conceptId,
          note: typeof op.note === 'string' ? op.note.trim() : 'Contradiction noted'
        });
      }
    } else if (op.op === 'suggest_merge') {
      if (op.conceptA && op.conceptB && conceptIds.has(op.conceptA) && conceptIds.has(op.conceptB) && op.conceptA !== op.conceptB) {
        validOps.push({
          op: 'suggest_merge',
          conceptA: op.conceptA,
          conceptB: op.conceptB,
          mergedLabel: typeof op.mergedLabel === 'string' ? op.mergedLabel.trim() : '',
          reason: typeof op.reason === 'string' ? op.reason.trim() : ''
        });
      }
    }
  }

  return validOps;
}

// CRITICAL 4: Validates a selected subset of operations to prevent dangling edges
function validateProposalSubset(selectedOps, existingConcepts) {
  if (!Array.isArray(selectedOps)) return [];
  const conceptIds = new Set((existingConcepts || []).map(c => c.id));
  const selectedTempIds = new Set();

  for (const op of selectedOps) {
    if (op && op.op === 'add_concept' && op.tempId) {
      selectedTempIds.add(op.tempId);
    }
  }

  const validOps = [];
  for (const op of selectedOps) {
    if (!op || typeof op !== 'object') continue;
    if (op.op === 'add_edge') {
      const fromValid = conceptIds.has(op.from) || selectedTempIds.has(op.from);
      const toValid = conceptIds.has(op.to) || selectedTempIds.has(op.to);
      if (fromValid && toValid && op.from !== op.to) {
        validOps.push(op);
      }
    } else {
      validOps.push(op);
    }
  }
  return validOps;
}

// Resolves a concept ID or tempId to a human-readable concept label
function resolveConceptLabel(id, existingConcepts = [], proposalOps = []) {
  if (!id || typeof id !== 'string') return 'Unknown Concept';
  const cleanId = id.trim();

  // 1. Check if it's a tempId from an add_concept operation in the same proposal
  if (Array.isArray(proposalOps)) {
    const addOp = proposalOps.find(op => op && op.op === 'add_concept' && op.tempId === cleanId);
    if (addOp && typeof addOp.label === 'string' && addOp.label.trim().length > 0) {
      return addOp.label.trim();
    }
  }

  // 2. Check if it's an existing concept ID in the current workspace
  if (Array.isArray(existingConcepts)) {
    const existing = existingConcepts.find(c => c && c.id === cleanId);
    if (existing && typeof existing.label === 'string' && existing.label.trim().length > 0) {
      return existing.label.trim();
    }
  }

  // 3. Fallback: return raw ID if unresolved
  return cleanId;
}

// Resolves human-readable labels and formatted description for an add_edge operation in Review UI
function formatEdgeReview(edgeOp, existingConcepts = [], proposalOps = []) {
  if (!edgeOp || typeof edgeOp !== 'object') {
    return {
      fromLabel: 'Unknown',
      toLabel: 'Unknown',
      displayTitle: 'Unknown → Unknown',
      relationText: 'relates',
      labelText: '',
      descText: 'Relation: relates'
    };
  }

  const fromLabel = resolveConceptLabel(edgeOp.from, existingConcepts, proposalOps);
  const toLabel = resolveConceptLabel(edgeOp.to, existingConcepts, proposalOps);
  const relationText = (typeof edgeOp.relation === 'string' && edgeOp.relation.trim().length > 0) ? edgeOp.relation.trim() : 'relates';
  const labelText = (typeof edgeOp.label === 'string' && edgeOp.label.trim().length > 0) ? edgeOp.label.trim() : '';

  const displayTitle = `${fromLabel} → ${toLabel}`;
  
  let descText = `Relation: ${relationText}`;
  if (labelText) {
    descText += ` — "${labelText}"`;
  }

  return {
    fromLabel,
    toLabel,
    displayTitle,
    relationText,
    labelText,
    descText
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    chunkSourceText,
    validateAndSanitizeOperations,
    validateProposalSubset,
    resolveConceptLabel,
    formatEdgeReview
  };
}
