// src/adapters/conceptAdapter.js
// Adapter between Detective Map Semantic Model (Concepts & Edges) and Excalidraw Elements

let seedCounter = 1000;
const getSeed = () => ++seedCounter;

/**
 * Converts Detective Map Concepts and Edges into Excalidraw Elements
 * @param {Array} concepts - Array of Concept objects
 * @param {Array} edges - Array of Edge objects
 * @returns {Array} Array of Excalidraw Elements
 */
export function convertConceptsToExcalidraw(concepts = [], edges = []) {
  const elements = [];
  const conceptToShapeId = new Map();

  // 1. Convert Concepts to Rounded Rectangles with Bound Text
  concepts.forEach(concept => {
    const shapeId = `node_${concept.id}`;
    const textId = `text_${concept.id}`;
    conceptToShapeId.set(concept.id, shapeId);

    const width = 190;
    const height = 64;
    const x = typeof concept.x === 'number' ? concept.x : 200;
    const y = typeof concept.y === 'number' ? concept.y : 200;

    // Node Box Element
    const rectElement = {
      id: shapeId,
      type: "rectangle",
      x,
      y,
      width,
      height,
      angle: 0,
      strokeColor: "#2563eb",
      backgroundColor: "#eff6ff",
      fillStyle: "solid",
      strokeWidth: 1.5,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 3 }, // Rounded corners
      seed: getSeed(),
      version: 1,
      versionNonce: getSeed(),
      isDeleted: false,
      boundElements: [{ id: textId, type: "text" }],
      updated: Date.now(),
      link: null,
      locked: false,
      customData: {
        conceptId: concept.id,
        isConceptNode: true,
        label: concept.label,
        sourceRefs: concept.sourceRefs || []
      }
    };

    // Bound Text Element inside Box
    const textElement = {
      id: textId,
      type: "text",
      x: x + 10,
      y: y + 16,
      width: width - 20,
      height: height - 32,
      angle: 0,
      strokeColor: "#1e3a8a",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: null,
      seed: getSeed(),
      version: 1,
      versionNonce: getSeed(),
      isDeleted: false,
      boundElements: null,
      updated: Date.now(),
      link: null,
      locked: false,
      text: concept.label,
      fontSize: 16,
      fontFamily: 1, // Excalifont / Virgil
      textAlign: "center",
      verticalAlign: "middle",
      baseline: 14,
      containerId: shapeId,
      originalText: concept.label,
      lineHeight: 1.25,
      customData: {
        conceptId: concept.id,
        isConceptText: true
      }
    };

    elements.push(rectElement, textElement);
  });

  // 2. Convert Edges to Bound Arrows with Labels
  edges.forEach(edge => {
    const fromShapeId = conceptToShapeId.get(edge.fromId || edge.from);
    const toShapeId = conceptToShapeId.get(edge.toId || edge.to);

    if (!fromShapeId || !toShapeId) return;

    const fromConcept = concepts.find(c => c.id === (edge.fromId || edge.from));
    const toConcept = concepts.find(c => c.id === (edge.toId || edge.to));
    if (!fromConcept || !toConcept) return;

    const startX = fromConcept.x + 95;
    const startY = fromConcept.y + 32;
    const endX = toConcept.x + 95;
    const endY = toConcept.y + 32;

    const dx = endX - startX;
    const dy = endY - startY;

    const arrowId = `edge_${edge.id}`;
    const arrowTextId = `edge_label_${edge.id}`;

    // Register bound arrows on source and target shapes
    const fromRect = elements.find(el => el.id === fromShapeId);
    if (fromRect) {
      fromRect.boundElements = fromRect.boundElements || [];
      fromRect.boundElements.push({ id: arrowId, type: "arrow" });
    }
    const toRect = elements.find(el => el.id === toShapeId);
    if (toRect) {
      toRect.boundElements = toRect.boundElements || [];
      toRect.boundElements.push({ id: arrowId, type: "arrow" });
    }

    const boundEls = edge.label ? [{ id: arrowTextId, type: "text" }] : [];

    const arrowElement = {
      id: arrowId,
      type: "arrow",
      x: startX,
      y: startY,
      width: Math.abs(dx) || 20,
      height: Math.abs(dy) || 20,
      angle: 0,
      strokeColor: "#475569",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1.5,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [],
      frameId: null,
      roundness: { type: 2 },
      seed: getSeed(),
      version: 1,
      versionNonce: getSeed(),
      isDeleted: false,
      boundElements: boundEls,
      updated: Date.now(),
      link: null,
      locked: false,
      points: [[0, 0], [dx, dy]],
      lastCommittedPoint: null,
      startBinding: {
        elementId: fromShapeId,
        focus: 0,
        gap: 6
      },
      endBinding: {
        elementId: toShapeId,
        focus: 0,
        gap: 6
      },
      startArrowhead: null,
      endArrowhead: "arrow",
      customData: {
        edgeId: edge.id,
        relation: edge.relation,
        label: edge.label,
        fromId: edge.fromId || edge.from,
        toId: edge.toId || edge.to
      }
    };

    elements.push(arrowElement);

    if (edge.label) {
      const midX = startX + dx / 2;
      const midY = startY + dy / 2;

      const labelTextElement = {
        id: arrowTextId,
        type: "text",
        x: midX - 60,
        y: midY - 14,
        width: 120,
        height: 25,
        angle: 0,
        strokeColor: "#334155",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        roundness: null,
        seed: getSeed(),
        version: 1,
        versionNonce: getSeed(),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
        text: edge.label,
        fontSize: 13,
        fontFamily: 1,
        textAlign: "center",
        verticalAlign: "middle",
        baseline: 11,
        containerId: arrowId,
        originalText: edge.label,
        lineHeight: 1.2,
        customData: {
          edgeId: edge.id,
          isEdgeLabel: true
        }
      };
      elements.push(labelTextElement);
    }
  });

  return elements;
}

/**
 * Detects coordinate shifts from Excalidraw elements and writes them back to Concepts
 * @param {Array} excalidrawElements - Current elements from Excalidraw scene
 * @param {Array} currentConcepts - Detective Map Concept array
 * @returns {{ updatedConcepts: Array, changes: Array }}
 */
export function extractConceptPositions(excalidrawElements = [], currentConcepts = []) {
  const changes = [];
  const conceptMap = new Map(currentConcepts.map(c => [c.id, { ...c }]));

  excalidrawElements.forEach(el => {
    if (el.customData && el.customData.conceptId && el.type === 'rectangle' && !el.isDeleted) {
      const cId = el.customData.conceptId;
      const existing = conceptMap.get(cId);
      if (existing) {
        const roundX = Math.round(el.x);
        const roundY = Math.round(el.y);
        if (existing.x !== roundX || existing.y !== roundY) {
          changes.push({
            id: cId,
            label: existing.label,
            old: { x: existing.x, y: existing.y },
            new: { x: roundX, y: roundY }
          });
          existing.x = roundX;
          existing.y = roundY;
          existing.updatedAt = new Date().toISOString();
        }
      }
    }
  });

  return {
    updatedConcepts: Array.from(conceptMap.values()),
    changes
  };
}

/**
 * Resolves a Concept from an Excalidraw selected element
 * @param {string} elementId - ID of selected element
 * @param {Array} excalidrawElements - Current Excalidraw elements
 * @param {Array} concepts - Detective Map Concepts
 * @returns {Object|null}
 */
export function findConceptByElementId(elementId, excalidrawElements = [], concepts = []) {
  if (!elementId) return null;
  const el = excalidrawElements.find(e => e.id === elementId);
  if (!el) return null;

  const conceptId = el.customData?.conceptId;
  if (conceptId) {
    return concepts.find(c => c.id === conceptId) || null;
  }

  // If containerId points to parent rectangle
  if (el.containerId) {
    const parent = excalidrawElements.find(e => e.id === el.containerId);
    if (parent?.customData?.conceptId) {
      return concepts.find(c => c.id === parent.customData.conceptId) || null;
    }
  }

  return null;
}
