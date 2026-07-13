import React from 'react';
import ModalPortal from './ModalPortal';
import './DetailModal.css';

/**
 * Reusable read-only detail view modal.
 *
 * Props:
 * - title: string heading for the modal
 * - fields: array of { label, value, full? } — `full` makes the field span the full width
 * - sections: optional array of { heading, fields } for grouped layouts
 * - children: optional custom content rendered below fields (e.g. line-item tables)
 * - onClose, onEdit, onDelete: callbacks. Edit/Delete buttons only render when provided.
 */
function DetailModal({ title, fields = [], sections = [], children, headerActions, onClose, onEdit, onDelete }) {
  const renderValue = (value) => {
    if (value === undefined || value === null || value === '') return '—';
    return value;
  };

  const renderFields = (fieldList) => (
    <div className="detail-view-grid">
      {fieldList.map((f, i) => (
        <div
          key={i}
          className={`detail-view-field${f.full ? ' detail-view-field-full' : ''}`}
        >
          <span className="detail-view-label">{f.label}</span>
          <span className="detail-view-value">{renderValue(f.value)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <ModalPortal>
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content detail-view-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="detail-view-header">
          <h2>{title}</h2>
          <div className="detail-view-header-actions">
            {headerActions}
            {onEdit && (
              <button className="btn-primary" onClick={onEdit}>
                ✏️ Edit
              </button>
            )}
            {onDelete && (
              <button className="detail-view-delete-btn" onClick={onDelete}>
                🗑️ Delete
              </button>
            )}
            <button className="detail-view-close-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        {fields.length > 0 && renderFields(fields)}

        {sections.map((section, idx) => (
          <div className="detail-view-section" key={idx}>
            {section.heading && <h3>{section.heading}</h3>}
            {renderFields(section.fields || [])}
          </div>
        ))}

        {children}
      </div>
    </div>
    </ModalPortal>
  );
}

export default DetailModal;
