/**
 * Consistent empty-state display.
 *
 * Props:
 *   icon    — React node (e.g. a Phosphor icon)
 *   title   — heading text
 *   body    — sub-text
 *   action  — React node (e.g. a button)
 */
export default function EmptyState({ icon, title, body, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon" aria-hidden="true">{icon}</div>}
      {title && <p className="empty-state__title">{title}</p>}
      {body  && <p className="empty-state__body">{body}</p>}
      {action && <div style={{ marginTop: 'var(--space-md)' }}>{action}</div>}
    </div>
  );
}
