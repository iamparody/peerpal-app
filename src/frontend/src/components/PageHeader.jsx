import { useNavigate } from 'react-router-dom';

/**
 * Reusable screen header with back button, title, and optional right action.
 * Matches the existing .page-header CSS.
 *
 * Props:
 *   title        — string shown as h2
 *   onBack       — custom handler; defaults to navigate(-1)
 *   backTo       — explicit path for navigate() instead of -1
 *   backLabel    — accessible label for back button (default "Back")
 *   right        — React node rendered at the right edge
 */
export default function PageHeader({ title, onBack, backTo, backLabel = 'Back', right }) {
  const navigate = useNavigate();

  function handleBack() {
    if (onBack) { onBack(); return; }
    if (backTo)  { navigate(backTo); return; }
    navigate(-1);
  }

  return (
    <div className="page-header">
      <button className="page-header__back" onClick={handleBack} aria-label={backLabel}>‹</button>
      {title && <h2 className="page-header__title">{title}</h2>}
      {right && (
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          {right}
        </div>
      )}
    </div>
  );
}
