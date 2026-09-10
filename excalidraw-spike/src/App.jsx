// src/App.jsx
import React, { useState, useMemo, useCallback } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import { initialConcepts, initialEdges } from './fixtures/sample-map';
import { convertConceptsToExcalidraw, extractConceptPositions, findConceptByElementId } from './adapters/conceptAdapter';
import DetailDrawer from './components/DetailDrawer';

export default function App() {
  const [concepts, setConcepts] = useState(initialConcepts);
  const [edges] = useState(initialEdges);
  const [activeConcept, setActiveConcept] = useState(null);
  const [lastMoveEvent, setLastMoveEvent] = useState(null);
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);

  // Generate Excalidraw elements once from our Concept + Edge semantic model
  const initialElements = useMemo(() => {
    return convertConceptsToExcalidraw(concepts, edges);
  }, []);

  // Handle scene updates (drag move, selection, draw strokes)
  const handleChange = useCallback((elements, appState) => {
    // 1. Two-way Coordinate Writeback (Gate 3)
    const { updatedConcepts, changes } = extractConceptPositions(elements, concepts);
    if (changes.length > 0) {
      setConcepts(updatedConcepts);
      const last = changes[changes.length - 1];
      setLastMoveEvent(`${last.label} → (${last.new.x}, ${last.new.y})`);
      console.log('[Spike Writeback] Concept moved:', last);
    }

    // 2. Click / Selection to Detail Drawer (Gate 5)
    const selectedIds = Object.keys(appState.selectedElementIds || {}).filter(
      id => appState.selectedElementIds[id]
    );

    if (selectedIds.length === 1) {
      const selectedElId = selectedIds[0];
      const matchedConcept = findConceptByElementId(selectedElId, elements, concepts);
      if (matchedConcept && matchedConcept.id !== activeConcept?.id) {
        setActiveConcept(matchedConcept);
      }
    }
  }, [concepts, activeConcept]);

  return (
    <div className="spike-container">
      {/* Top Floating Status Bar */}
      <header className="spike-header">
        <div className="brand-section">
          <span className="logo-badge">🔍</span>
          <span className="brand-title">Detective Map</span>
          <span className="version-pill">Excalidraw Spike</span>
        </div>

        <div className="gate-checklist">
          <span className="gate-badge passed" title="8 production concepts rendered as shapes">
            ✅ 1. Nodes (8)
          </span>
          <span className="gate-badge passed" title="5 relationships rendered as bound arrows">
            ✅ 2. Arrows (5)
          </span>
          <span className={`gate-badge ${lastMoveEvent ? 'passed' : 'testing'}`} title="Drag node updates concept (x, y)">
            {lastMoveEvent ? '✅ 3. Writeback Active' : '⏳ 3. Drag to Writeback'}
          </span>
          <span className="gate-badge testing" title="Use Wacom pen on freedraw tool (P)">
            ✒️ 4. Wacom Ink Ready
          </span>
          <span className={`gate-badge ${activeConcept ? 'passed' : 'testing'}`} title="Click node to open Drawer">
            {activeConcept ? '✅ 5. Drawer Open' : '👆 5. Click Node for Drawer'}
          </span>
        </div>

        <div className="header-actions">
          {lastMoveEvent && (
            <div className="coord-feedback" title="Last coordinate written back to Concept state">
              📍 {lastMoveEvent}
            </div>
          )}
        </div>
      </header>

      {/* Excalidraw Engine */}
      <div className="excalidraw-wrapper">
        <Excalidraw
          excalidrawAPI={(api) => setExcalidrawAPI(api)}
          initialData={{
            elements: initialElements,
            appState: {
              viewBackgroundColor: "#f8fafc",
              currentItemFontFamily: 1, // Excalifont
              gridSize: 20
            }
          }}
          onChange={handleChange}
          UIOptions={{
            canvasActions: {
              changeViewBackgroundColor: false,
              clearCanvas: false
            }
          }}
        />
      </div>

      {/* Native Detail Drawer Overlay (Preserved Brain UI) */}
      {activeConcept && (
        <DetailDrawer
          concept={activeConcept}
          onClose={() => setActiveConcept(null)}
        />
      )}
    </div>
  );
}
