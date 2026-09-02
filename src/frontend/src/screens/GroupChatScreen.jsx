import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import {
  CalendarBlank,
  ChartBar,
  ChatsCircle,
  MegaphoneSimple,
  Plus,
} from '@phosphor-icons/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import PageHeader from '../components/PageHeader';
import { groupMeta } from '../utils/groupMeta';

const REPORT_REASONS = [
  { value: 'harmful_content', label: 'Harmful content' },
  { value: 'abuse',           label: 'Abuse' },
  { value: 'spam',            label: 'Spam' },
  { value: 'other',           label: 'Other' },
];

const EMOJIS = [
  { key: 'heart',  symbol: '💙' },
  { key: 'hug',    symbol: '🫂' },
  { key: 'strong', symbol: '💪' },
  { key: 'spark',  symbol: '✨' },
  { key: 'relate', symbol: '🤝' },
];

// ── AliasAvatar ───────────────────────────────────────────────────────────────
function AliasAvatar({ alias }) {
  const idx = (alias?.charCodeAt(0) ?? 0) % 5 + 1;
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: `var(--color-avatar-${idx})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '0.65rem', fontWeight: 700, color: '#fff',
    }}>
      {(alias ?? '??').slice(0, 2).toUpperCase()}
    </div>
  );
}

// ── Time helper ───────────────────────────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const mins = Math.floor((Date.now() - new Date(ts)) / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)    return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── ReactionBar ───────────────────────────────────────────────────────────────
function ReactionBar({ messageId, groupId, reactions: initReactions = {}, myReaction: initMine }) {
  const [reactions, setReactions] = useState(initReactions);
  const [mine, setMine]           = useState(initMine ?? null);

  // Sync when the message itself changes (different post loaded)
  useEffect(() => {
    setReactions(initReactions);
    setMine(initMine ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId]);

  async function toggle(key) {
    const prevR = reactions;
    const prevM = mine;

    const next = { ...reactions };
    if (mine === key) {
      next[key] = Math.max(0, (next[key] || 1) - 1);
      if (!next[key]) delete next[key];
      setMine(null);
    } else {
      if (mine) {
        next[mine] = Math.max(0, (next[mine] || 1) - 1);
        if (!next[mine]) delete next[mine];
      }
      next[key] = (next[key] || 0) + 1;
      setMine(key);
    }
    setReactions(next);

    try {
      await client.post(`/api/groups/${groupId}/react`, { message_id: messageId, emoji: key });
    } catch {
      setReactions(prevR);
      setMine(prevM);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
      {EMOJIS.map(({ key, symbol }) => {
        const count  = reactions[key] || 0;
        const active = mine === key;
        return (
          <button
            key={key}
            onClick={() => toggle(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: active ? 'var(--color-calm-bg)' : 'var(--color-surface-secondary)',
              border: `1px solid ${active ? 'var(--color-calm)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-full)',
              padding: '3px 10px', cursor: 'pointer',
              fontSize: '0.85rem',
              color: active ? 'var(--color-calm)' : 'var(--color-text-secondary)',
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {symbol}{count > 0 ? <span style={{ fontSize: '0.75rem', fontWeight: 600, marginLeft: 2 }}>{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ── PollCard ──────────────────────────────────────────────────────────────────
function PollCard({ poll: initPoll, groupId, onVoted }) {
  const [poll, setPoll]       = useState(initPoll);
  const [selected, setSelected] = useState(initPoll.my_vote_option_id ?? null);
  const [voting, setVoting]   = useState(false);
  const { showToast }         = useToast();

  const showResults = poll.has_voted || poll.total_votes >= poll.min_votes_to_show;

  async function handleVote() {
    if (!selected || voting || poll.has_voted) return;
    setVoting(true);
    try {
      await client.post(`/api/groups/${groupId}/polls/${poll.id}/vote`, { option_id: selected });
      setPoll(prev => ({
        ...prev,
        has_voted: true,
        my_vote_option_id: selected,
        total_votes: prev.total_votes + 1,
        options: prev.options.map(o =>
          o.id === selected ? { ...o, votes: o.votes + 1 } : o
        ),
      }));
      onVoted?.();
    } catch (err) {
      const code = err.response?.data?.code;
      if (code === 'ALREADY_VOTED') {
        setPoll(prev => ({ ...prev, has_voted: true }));
      } else {
        showToast('Failed to submit vote.', 'error');
      }
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className="card" style={{ padding: 'var(--space-sm) var(--space-md)', margin: '0 var(--space-md) var(--space-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <ChartBar size={14} weight="duotone" color="var(--color-accent)" />
        <span className="label" style={{ fontSize: '0.7rem' }}>Poll</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {poll.total_votes} {poll.total_votes === 1 ? 'vote' : 'votes'}
          {!showResults && poll.total_votes < poll.min_votes_to_show && (
            <> · results after {poll.min_votes_to_show}</>
          )}
        </span>
      </div>

      <p style={{ fontFamily: 'var(--font-editorial)', fontSize: '0.95rem', lineHeight: 'var(--leading-relaxed)', margin: '0 0 12px' }}>
        {poll.question}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {poll.options.map((opt) => {
          const pct      = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0;
          const isMyVote = poll.my_vote_option_id === opt.id;

          if (!poll.has_voted) {
            const isSelected = selected === opt.id;
            return (
              <label
                key={opt.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isSelected ? 'var(--color-calm)' : 'var(--color-border)'}`,
                  background: isSelected ? 'var(--color-calm-bg)' : 'var(--color-surface-secondary)',
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <input
                  type="radio"
                  name={`poll-${poll.id}`}
                  value={opt.id}
                  checked={isSelected}
                  onChange={() => setSelected(opt.id)}
                  style={{ accentColor: 'var(--color-calm)' }}
                />
                <span style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>{opt.label}</span>
              </label>
            );
          }

          if (showResults) {
            return (
              <div key={opt.id} style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${pct}%`,
                  background: isMyVote ? 'var(--color-calm-bg)' : 'var(--color-surface-secondary)',
                  transition: 'width 0.4s ease',
                }} />
                <div style={{
                  position: 'relative',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 12px',
                  border: `1px solid ${isMyVote ? 'var(--color-calm)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <span style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)', fontWeight: isMyVote ? 600 : 400 }}>
                    {opt.label}{isMyVote ? ' ✓' : ''}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{pct}%</span>
                </div>
              </div>
            );
          }

          // Voted but threshold not yet met
          return (
            <div key={opt.id} style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${isMyVote ? 'var(--color-calm)' : 'var(--color-border)'}`,
              background: isMyVote ? 'var(--color-calm-bg)' : 'var(--color-surface-secondary)',
              fontSize: '0.9rem', fontWeight: isMyVote ? 600 : 400,
              color: 'var(--color-text-primary)',
            }}>
              {opt.label}{isMyVote ? ' ✓' : ''}
            </div>
          );
        })}
      </div>

      {!poll.has_voted && (
        <button
          className="btn btn--primary btn--sm"
          style={{ marginTop: 12, width: 'auto', padding: '0 20px' }}
          onClick={handleVote}
          disabled={!selected || voting}
        >
          {voting ? 'Submitting…' : 'Submit vote'}
        </button>
      )}
    </div>
  );
}

// ── PostTypeSheet (admin) ─────────────────────────────────────────────────────
function PostTypeSheet({ onClose, onPrompt, onAnnounce, onPoll }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <span className="label">What would you like to post?</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button
            className="btn btn--secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={onAnnounce}
          >
            <MegaphoneSimple size={16} /> Announcement
          </button>
          <button
            className="btn btn--secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={onPrompt}
          >
            <CalendarBlank size={16} /> Weekly Prompt
          </button>
          <button
            className="btn btn--secondary"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            onClick={onPoll}
          >
            <ChartBar size={16} /> Poll
          </button>
        </div>
        <button className="btn btn--ghost" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── PromptSheet (admin) ───────────────────────────────────────────────────────
function PromptSheet({ groupId, onClose, onSuccess }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { showToast }   = useToast();

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await client.post(`/api/groups/${groupId}/prompt`, { content: text.trim() });
      showToast('Prompt posted.', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to post prompt.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <span className="label">New weekly prompt</span>
        <textarea
          className="textarea"
          style={{ marginTop: 'var(--space-sm)', minHeight: 100 }}
          placeholder="What question will guide this week's discussion?"
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="char-counter">{text.length}/500</div>
        <button className="btn btn--primary" onClick={submit} disabled={!text.trim() || busy}>
          {busy ? 'Posting…' : 'Post prompt'}
        </button>
        <button className="btn btn--ghost" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── AnnounceSheet (admin) ─────────────────────────────────────────────────────
function AnnounceSheet({ groupId, onClose, onSuccess }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const { showToast }   = useToast();

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await client.post(`/api/groups/${groupId}/announce`, { content: text.trim() });
      showToast('Announcement posted.', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to post announcement.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <span className="label">New announcement</span>
        <textarea
          className="textarea"
          style={{ marginTop: 'var(--space-sm)', minHeight: 100 }}
          placeholder="Share an update with the group…"
          maxLength={1000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoFocus
        />
        <div className="char-counter">{text.length}/1000</div>
        <button className="btn btn--primary" onClick={submit} disabled={!text.trim() || busy}>
          {busy ? 'Posting…' : 'Post announcement'}
        </button>
        <button className="btn btn--ghost" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── PollSheet (admin) ─────────────────────────────────────────────────────────
function PollSheet({ groupId, onClose, onSuccess }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions]   = useState(['', '']);
  const [busy, setBusy]         = useState(false);
  const { showToast }           = useToast();

  function updateOption(i, val) {
    setOptions(prev => prev.map((o, idx) => (idx === i ? val : o)));
  }
  function addOption() {
    if (options.length < 5) setOptions(prev => [...prev, '']);
  }
  function removeOption(i) {
    if (options.length <= 2) return;
    setOptions(prev => prev.filter((_, idx) => idx !== i));
  }

  const validOptions = options.filter(o => o.trim());
  const canSubmit    = question.trim() && validOptions.length >= 2;

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    try {
      await client.post(`/api/groups/${groupId}/polls`, {
        question: question.trim(),
        options: validOptions,
      });
      showToast('Poll posted.', 'success');
      onSuccess();
      onClose();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to post poll.', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <span className="label">New poll</span>
        <input
          className="input"
          style={{ marginTop: 'var(--space-sm)' }}
          placeholder="Ask a question…"
          maxLength={200}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          autoFocus
        />
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((opt, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                className="input"
                style={{ flex: 1 }}
                placeholder={`Option ${i + 1}`}
                maxLength={100}
                value={opt}
                onChange={(e) => updateOption(i, e.target.value)}
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: 20, padding: '0 4px', lineHeight: 1 }}
                >×</button>
              )}
            </div>
          ))}
          {options.length < 5 && (
            <button className="btn btn--ghost btn--sm" onClick={addOption} style={{ alignSelf: 'flex-start' }}>
              + Add option
            </button>
          )}
        </div>
        <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={submit} disabled={!canSubmit || busy}>
          {busy ? 'Posting…' : 'Post poll'}
        </button>
        <button className="btn btn--ghost" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

// ── ReportSheet ───────────────────────────────────────────────────────────────
function ReportSheet({ groupId, message, onClose }) {
  const [reason, setReason]   = useState('');
  const [busy, setBusy]       = useState(false);
  const [success, setSuccess] = useState(false);
  const { showToast }         = useToast();

  async function submit() {
    if (!reason || busy) return;
    setBusy(true);
    try {
      await client.post(`/api/groups/${groupId}/messages/${message.id}/report`, { reason });
      setSuccess(true);
      setTimeout(() => { onClose(); }, 1800);
    } catch {
      showToast('Failed to submit report.', 'error');
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        {success ? (
          <div style={{ textAlign: 'center', padding: 'var(--space-md)' }}>
            <p style={{ fontWeight: 600, marginBottom: 4 }}>Report submitted</p>
            <p style={{ fontSize: '0.85rem' }}>Thank you for keeping the community safe.</p>
          </div>
        ) : (
          <>
            <h3 style={{ marginBottom: 12 }}>Report response</h3>
            <div style={{
              background: 'var(--color-surface-secondary)',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-sm) var(--space-md)',
              marginBottom: 16, fontSize: '0.85rem',
              color: 'var(--color-text-secondary)',
            }}>
              "{message.content?.slice(0, 120)}{message.content?.length > 120 ? '…' : ''}"
            </div>
            <span className="label">Reason</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, marginBottom: 16 }}>
              {REPORT_REASONS.map((r) => (
                <label key={r.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.9rem' }}>
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            <button className="btn btn--danger" onClick={submit} disabled={!reason || busy}>
              {busy ? 'Submitting…' : 'Submit report'}
            </button>
            <button className="btn btn--ghost" style={{ marginTop: 8 }} onClick={onClose}>Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── RemoveDialog (admin) ──────────────────────────────────────────────────────
function RemoveDialog({ groupId, message, open, onOpenChange, onRemoved }) {
  const [busy, setBusy] = useState(false);
  const { showToast }   = useToast();

  async function confirm() {
    if (busy) return;
    setBusy(true);
    try {
      await client.delete(`/api/groups/${groupId}/responses/${message.id}`);
      showToast('Response removed.', 'success');
      onRemoved(message.id);
      onOpenChange(false);
    } catch {
      showToast('Failed to remove response.', 'error');
      setBusy(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay style={{ position: 'fixed', inset: 0, background: 'var(--color-overlay)', zIndex: 50 }} />
        <AlertDialog.Content style={{
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--color-surface-card)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-lg)',
          width: 'min(90vw, 340px)', zIndex: 51,
        }}>
          <AlertDialog.Title style={{ fontWeight: 600, marginBottom: 8 }}>Remove response?</AlertDialog.Title>
          <AlertDialog.Description style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', marginBottom: 20, lineHeight: 'var(--leading-normal)' }}>
            This response will be removed from the group feed. This action cannot be undone.
          </AlertDialog.Description>
          <div style={{ display: 'flex', gap: 8 }}>
            <AlertDialog.Cancel asChild>
              <button className="btn btn--ghost" style={{ flex: 1 }}>Cancel</button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button className="btn btn--danger" style={{ flex: 1 }} onClick={confirm} disabled={busy}>
                {busy ? 'Removing…' : 'Remove'}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

// ── ResponseRow ───────────────────────────────────────────────────────────────
function ResponseRow({ response, isAdmin, groupId, onReport, onRemoveConfirm }) {
  const pressTimer = useRef(null);

  function startPress() { pressTimer.current = setTimeout(() => onReport(response), 500); }
  function cancelPress() { clearTimeout(pressTimer.current); }

  return (
    <div
      onMouseDown={startPress} onMouseUp={cancelPress}
      onTouchStart={startPress} onTouchEnd={cancelPress}
      style={{
        padding: 'var(--space-sm) var(--space-md)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--color-surface-secondary)',
        border: '1px solid var(--color-border)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <AliasAvatar alias={response.alias} />
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {response.alias}
        </span>
        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {timeAgo(response.created_at)}
        </span>
        {isAdmin && (
          <button
            onClick={() => onRemoveConfirm(response)}
            style={{ marginLeft: 4, background: 'none', border: 'none', color: 'var(--color-danger)', fontSize: '0.75rem', cursor: 'pointer', padding: '2px 4px', borderRadius: 4 }}
          >
            Remove
          </button>
        )}
      </div>
      <p style={{ fontSize: '0.9rem', lineHeight: 'var(--leading-normal)', margin: 0, color: 'var(--color-text-primary)' }}>
        {response.content}
      </p>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function GroupChatScreen() {
  const { id: groupId } = useParams();
  const navigate        = useNavigate();
  const { user }        = useAuth();
  const queryClient     = useQueryClient();
  const { showToast }   = useToast();
  const isAdmin         = user?.role === 'admin';

  const [responseText,     setResponseText]     = useState('');
  const [page,             setPage]             = useState(1);
  const [allResponses,     setAllResponses]     = useState([]);
  const [reportTarget,     setReportTarget]     = useState(null);
  const [removeTarget,     setRemoveTarget]     = useState(null);
  const [removeOpen,       setRemoveOpen]       = useState(false);
  const [showPostType,     setShowPostType]     = useState(false);
  const [showPromptSheet,  setShowPromptSheet]  = useState(false);
  const [showAnnounceSheet, setShowAnnounceSheet] = useState(false);
  const [showPollSheet,    setShowPollSheet]    = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['group-feed', groupId, page],
    queryFn: () => client.get(`/api/groups/${groupId}/feed?page=${page}`).then(r => r.data),
    staleTime: 8_000,
    refetchInterval: 8_000,
  });

  useEffect(() => {
    if (!data?.responses) return;
    if (page === 1) {
      setAllResponses(data.responses);
    } else {
      setAllResponses((prev) => {
        const ids = new Set(prev.map(r => r.id));
        return [...prev, ...data.responses.filter(r => !ids.has(r.id))];
      });
    }
  }, [data, page]);

  const { mutate: submitResponse, isPending: submitting } = useMutation({
    mutationFn: (content) => client.post(`/api/groups/${groupId}/respond`, { content }),
    onSuccess: () => {
      setResponseText('');
      showToast('Your response has been received.', 'success');
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ['group-feed', groupId] });
    },
    onError: (err) => {
      const code = err.response?.data?.code;
      if (code === 'ALREADY_RESPONDED') {
        showToast("You've already shared a response for this prompt.", 'info');
        queryClient.invalidateQueries({ queryKey: ['group-feed', groupId] });
        return;
      }
      showToast(err.response?.data?.error || 'Failed to submit response.', 'error');
    },
  });

  function handleRemoved(msgId) {
    setAllResponses((prev) => prev.filter(r => r.id !== msgId));
  }

  function invalidateFeed() {
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ['group-feed', groupId] });
  }

  const group      = data?.group;
  const announcement = data?.announcement;
  const prompt     = data?.prompt;
  const poll       = data?.poll;
  const totalPages = data?.pages ?? 1;
  const meta       = group ? groupMeta(group.condition_category) : null;

  useEffect(() => {
    if (isError) navigate(`/groups/${groupId}`, { replace: true });
  }, [isError, groupId, navigate]);

  if (isLoading && page === 1) return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div style={{ padding: '12px 16px', background: 'var(--color-surface-card)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div className="skeleton" style={{ height: 20, width: '40%', borderRadius: 4 }} />
      </div>
      <div style={{ flex: 1, padding: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
        <div className="skeleton" style={{ height: 90, borderRadius: 'var(--radius-lg)' }} />
        {[1,2,3,4].map((i) => (
          <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-sm)' }} />
        ))}
      </div>
    </div>
  );

  return (
    <div className="screen screen--no-nav" style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>

      {/* Header */}
      <div style={{ flexShrink: 0 }}>
        <PageHeader
          title={group?.name ?? 'Group'}
          onBack={() => navigate(-1)}
          right={isAdmin ? (
            <button
              onClick={() => setShowPostType(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-sm)',
                padding: '5px 10px', cursor: 'pointer',
                fontSize: '0.82rem', color: 'var(--color-text-primary)',
              }}
            >
              <Plus size={14} weight="bold" /> Post
            </button>
          ) : null}
        />
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Sticky region — announcement + prompt */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 10,
          background: 'var(--color-bg-primary)',
          padding: 'var(--space-sm) var(--space-md) 0',
          borderBottom: '1px solid var(--color-divider)',
          paddingBottom: 'var(--space-sm)',
        }}>
          {announcement && (
            <div className="card" style={{ marginBottom: 'var(--space-xs)', padding: 'var(--space-sm) var(--space-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <MegaphoneSimple size={14} weight="duotone" color="var(--color-accent)" />
                <span className="label" style={{ fontSize: '0.7rem' }}>From the team</span>
              </div>
              <p style={{ fontSize: '0.85rem', margin: 0, color: 'var(--color-text-primary)' }}>
                {announcement.content}
              </p>
              <ReactionBar
                messageId={announcement.id}
                groupId={groupId}
                reactions={announcement.reactions || {}}
                myReaction={announcement.my_reaction}
              />
            </div>
          )}

          {prompt ? (
            <div className="card" style={{ padding: 'var(--space-sm) var(--space-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="label" style={{ fontSize: '0.7rem' }}>This week's prompt</span>
                <span style={{
                  fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--color-calm-bg)', color: 'var(--color-calm)',
                }}>
                  {prompt.response_count} {Number(prompt.response_count) === 1 ? 'response' : 'responses'}
                </span>
              </div>
              <p style={{ fontFamily: 'var(--font-editorial)', fontSize: '1rem', lineHeight: 'var(--leading-relaxed)', margin: 0, color: 'var(--color-text-primary)' }}>
                {prompt.content}
              </p>
              <ReactionBar
                messageId={prompt.id}
                groupId={groupId}
                reactions={prompt.reactions || {}}
                myReaction={prompt.my_reaction}
              />
            </div>
          ) : (
            <div style={{ padding: 'var(--space-xs) 0' }}>
              <div style={{
                background: 'var(--color-surface-secondary)',
                borderRadius: 'var(--radius-sm)',
                padding: 'var(--space-sm) var(--space-md)',
                fontSize: '0.85rem', color: 'var(--color-text-muted)',
              }}>
                No prompt this week yet. Check back soon.
              </div>
            </div>
          )}
        </div>

        {/* Active poll */}
        {poll && (
          <div style={{ paddingTop: 'var(--space-sm)' }}>
            <PollCard poll={poll} groupId={groupId} onVoted={invalidateFeed} />
          </div>
        )}

        {/* Response composer (members, when there's a prompt) */}
        {prompt && !isAdmin && (
          <div style={{ padding: 'var(--space-sm) var(--space-md)', borderBottom: '1px solid var(--color-divider)' }}>
            {prompt.has_responded ? (
              <div style={{
                padding: 'var(--space-sm) var(--space-md)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-secondary)',
                fontSize: '0.85rem', color: 'var(--color-text-muted)', textAlign: 'center',
              }}>
                You've shared your response for this prompt. New prompt coming soon.
              </div>
            ) : (
              <>
                <textarea
                  className="textarea"
                  style={{ minHeight: 72 }}
                  placeholder="Share your response…"
                  maxLength={500}
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
                  <span className="char-counter" style={{ margin: 0 }}>{responseText.length}/500</span>
                  <button
                    className="btn btn--primary btn--sm"
                    style={{ width: 'auto', padding: '0 20px' }}
                    onClick={() => submitResponse(responseText)}
                    disabled={!responseText.trim() || submitting}
                  >
                    {submitting ? 'Sharing…' : 'Share'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Responses */}
        <div style={{ flex: 1, padding: 'var(--space-sm) var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
          {!prompt ? (
            <div style={{ padding: 'var(--space-xl) 0', textAlign: 'center' }}>
              <CalendarBlank size={40} weight="duotone" color="var(--color-accent)" />
              <p style={{ marginTop: 'var(--space-sm)', fontWeight: 500 }}>No prompt this week yet</p>
              <p style={{ fontSize: '0.85rem' }}>A new prompt will be posted soon.</p>
            </div>
          ) : allResponses.length === 0 ? (
            <div style={{ padding: 'var(--space-xl) 0', textAlign: 'center' }}>
              <ChatsCircle size={40} weight="duotone" color="var(--color-accent)" />
              <p style={{ marginTop: 'var(--space-sm)', fontWeight: 500 }}>No responses yet</p>
              <p style={{ fontSize: '0.85rem' }}>Be the first to share your experience.</p>
            </div>
          ) : (
            allResponses.map((r) => (
              <ResponseRow
                key={r.id}
                response={r}
                isAdmin={isAdmin}
                groupId={groupId}
                onReport={setReportTarget}
                onRemoveConfirm={(msg) => { setRemoveTarget(msg); setRemoveOpen(true); }}
              />
            ))
          )}

          {page < totalPages && (
            <button
              className="btn btn--ghost btn--sm"
              style={{ alignSelf: 'center', marginTop: 'var(--space-sm)' }}
              onClick={() => setPage((p) => p + 1)}
              disabled={isLoading}
            >
              {isLoading ? 'Loading…' : 'Load more responses'}
            </button>
          )}
        </div>
      </div>

      {/* Overlays */}
      {reportTarget && (
        <ReportSheet groupId={groupId} message={reportTarget} onClose={() => setReportTarget(null)} />
      )}
      {removeTarget && (
        <RemoveDialog
          groupId={groupId}
          message={removeTarget}
          open={removeOpen}
          onOpenChange={setRemoveOpen}
          onRemoved={handleRemoved}
        />
      )}
      {showPostType && (
        <PostTypeSheet
          onClose={() => setShowPostType(false)}
          onPrompt={() => { setShowPostType(false); setShowPromptSheet(true); }}
          onAnnounce={() => { setShowPostType(false); setShowAnnounceSheet(true); }}
          onPoll={() => { setShowPostType(false); setShowPollSheet(true); }}
        />
      )}
      {showPromptSheet && (
        <PromptSheet groupId={groupId} onClose={() => setShowPromptSheet(false)} onSuccess={invalidateFeed} />
      )}
      {showAnnounceSheet && (
        <AnnounceSheet groupId={groupId} onClose={() => setShowAnnounceSheet(false)} onSuccess={invalidateFeed} />
      )}
      {showPollSheet && (
        <PollSheet groupId={groupId} onClose={() => setShowPollSheet(false)} onSuccess={invalidateFeed} />
      )}
    </div>
  );
}
