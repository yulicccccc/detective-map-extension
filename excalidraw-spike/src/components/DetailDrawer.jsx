// src/components/DetailDrawer.jsx
import React from 'react';

export default function DetailDrawer({ concept, onClose }) {
  if (!concept) return null;

  return (
    <aside className="evidence-drawer open">
      <div className="drawer-header">
        <div className="drawer-title-row">
          <span className="drawer-icon">🔍</span>
          <h2 className="drawer-title">{concept.label}</h2>
          <button className="btn-drawer-close" onClick={onClose} title="Close Drawer (Esc)">✕</button>
        </div>
        <div className="drawer-meta">
          <span className="meta-pill">ID: {concept.id}</span>
          <span className="meta-pill">Coords: ({concept.x}, {concept.y})</span>
          <span className="meta-pill">Author: {concept.createdBy || 'ai'}</span>
        </div>
      </div>

      <div className="drawer-body">
        <section className="drawer-section">
          <h3 className="section-label">Abstracted Understanding</h3>
          <div className="drawer-description">
            {concept.description || <span className="empty-hint">No description available.</span>}
          </div>
        </section>

        <section className="drawer-section">
          <h3 className="section-label">
            Grounding Evidence ({concept.sourceRefs?.length || 0})
          </h3>
          {concept.sourceRefs && concept.sourceRefs.length > 0 ? (
            <ul className="source-ref-list">
              {concept.sourceRefs.map((srcId, index) => (
                <li key={srcId} className="source-ref-item">
                  <span className="ref-index">📚 Source #{index + 1}</span>
                  <code className="ref-id">{srcId}</code>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-hint">No direct source links recorded.</p>
          )}
        </section>

        <section className="drawer-section tech-note">
          <div className="spike-note-box">
            <strong>✅ Spike Verification Gate 5 Passed:</strong>
            <p>
              Excalidraw node click successfully resolved <code>customData.conceptId: "{concept.id}"</code> and invoked our native HTML Detail Drawer overlay!
            </p>
          </div>
        </section>
      </div>
    </aside>
  );
}
