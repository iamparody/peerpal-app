import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CloudRain, Tree, Waves, SpeakerHigh, MusicNotes, Fire, Drop, Wind, Play, Pause } from '@phosphor-icons/react';
import { getAmbient } from '../utils/ambientAudio';

const SOUNDS = [
  { id: 'rain',          label: 'Rain',          icon: CloudRain   },
  { id: 'forest',        label: 'Forest',        icon: Tree        },
  { id: 'ocean',         label: 'Ocean',         icon: Waves       },
  { id: 'white-noise',   label: 'White Noise',   icon: SpeakerHigh },
  { id: 'tibetan-bowls', label: 'Tibetan Bowls', icon: MusicNotes  },
  { id: 'fireplace',     label: 'Fireplace',     icon: Fire        },
  { id: 'stream',        label: 'Stream',        icon: Drop        },
  { id: 'wind',          label: 'Wind',          icon: Wind        },
];

export default function CalmingSoundsScreen() {
  const navigate  = useNavigate();
  const ambient   = useRef(getAmbient()).current;

  // Initialise UI state from the singleton (handles remounting while audio plays)
  const [currentId, setCurrentId] = useState(ambient.currentType);
  const [isPlaying, setIsPlaying] = useState(ambient.isRunning);
  const [volume,    setVolume]    = useState(0.7);

  // Stop audio when the screen is closed only if navigating away completely
  // (Audio intentionally continues while navigating between screens — user can
  //  tap the tile again to stop. This matches the original behaviour.)

  function handleSelect(sound) {
    if (currentId === sound.id) {
      if (isPlaying) {
        ambient.pause();
        setIsPlaying(false);
      } else {
        ambient.resume();
        setIsPlaying(true);
      }
      return;
    }
    ambient.play(sound.id, volume);
    setCurrentId(sound.id);
    setIsPlaying(true);
  }

  function handleStop() {
    ambient.stop();
    setCurrentId(null);
    setIsPlaying(false);
  }

  function handleVolumeChange(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    ambient.setVolume(v);
  }

  return (
    <div className="screen">
      <div className="page-header">
        <button className="page-header__back" onClick={() => navigate(-1)} aria-label="Back">‹</button>
        <h2 className="page-header__title">Calming Sounds</h2>
        {currentId && (
          <button
            onClick={handleStop}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 12,
              color: 'var(--color-text-muted)', cursor: 'pointer', padding: '4px 8px' }}
          >
            Stop
          </button>
        )}
      </div>

      {currentId && (
        <div
          style={{
            margin: 'var(--space-md) var(--space-md) 0',
            padding: 'var(--space-sm) var(--space-md)',
            background: 'var(--color-surface-card)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-md)',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)', flexShrink: 0 }}>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={handleVolumeChange}
            aria-label="Volume"
            style={{ flex: 1, accentColor: 'var(--color-accent)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', width: 32, textAlign: 'right' }}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}

      <div style={{ padding: 'var(--space-md)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
        {SOUNDS.map((sound) => {
          const Icon    = sound.icon;
          const active  = currentId === sound.id;
          const playing = active && isPlaying;
          return (
            <button
              key={sound.id}
              type="button"
              onClick={() => handleSelect(sound)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: 'var(--space-md)',
                background: active ? 'rgba(194,164,138,0.14)' : 'var(--color-surface-card)',
                border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                minHeight: 100,
                transition: 'background 200ms ease, border-color 200ms ease',
              }}
              aria-pressed={active}
              aria-label={`${sound.label}${active ? (playing ? ', playing' : ', paused') : ''}`}
            >
              <Icon
                size={32}
                weight={active ? 'fill' : 'duotone'}
                color={active ? 'var(--color-accent)' : 'var(--color-text-muted)'}
              />
              <span style={{ fontSize: 13, color: active ? '#F5EDE4' : 'var(--color-text-muted)', fontWeight: active ? 600 : 400 }}>
                {sound.label}
              </span>
              <span style={{ color: active ? 'var(--color-accent)' : 'var(--color-text-muted)', display: 'flex', alignItems: 'center' }}>
                {playing
                  ? <Pause size={16} weight="fill" />
                  : <Play  size={16} weight={active ? 'fill' : 'regular'} />}
              </span>
            </button>
          );
        })}
      </div>

      <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-muted)', padding: '0 var(--space-md)', lineHeight: 1.5 }}>
        Audio continues when you navigate away. Tap a playing sound to pause it.
      </p>
    </div>
  );
}
