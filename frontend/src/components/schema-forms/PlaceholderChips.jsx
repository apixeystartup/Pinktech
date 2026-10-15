import { PLACEHOLDER_TAGS, placeholderTag } from "../../lib/placeholders";

/**
 * Insert-at-cursor placeholder chips. The parent owns the textarea: onInsert
 * receives the raw tag (e.g. "{{doctor.name}}") and splices it in.
 */
function PlaceholderChips({ onInsert, disabled = false }) {
  return (
    <div className="ph-chips" role="group" aria-label="Insert personalization placeholder">
      <span className="ph-chips-label">Insert:</span>
      {PLACEHOLDER_TAGS.map((tag) => (
        <button
          key={tag.key}
          type="button"
          className="ph-chip"
          title={`${tag.label} (${placeholderTag(tag.key)}) — fills per doctor on their link`}
          disabled={disabled}
          onClick={() => onInsert(placeholderTag(tag.key))}
        >
          {tag.label}
        </button>
      ))}
    </div>
  );
}

export default PlaceholderChips;
