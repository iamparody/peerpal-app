import {
  Brain,
  CloudRain,
  ArrowsClockwise,
  Lightning,
  Flower,
  Wind,
  Waves,
  HandHeart,
  UsersThree,
} from '@phosphor-icons/react';

export const GROUP_META = {
  anxiety:         { Icon: Brain,           color: '#7FA9D4', bg: 'rgba(127,169,212,0.15)', label: 'Anxiety' },
  depression:      { Icon: CloudRain,       color: '#8A9BB5', bg: 'rgba(138,155,181,0.15)', label: 'Depression' },
  ocd:             { Icon: ArrowsClockwise, color: '#5BBCAD', bg: 'rgba(91,188,173,0.15)',  label: 'OCD' },
  adhd:            { Icon: Lightning,       color: '#E8A838', bg: 'rgba(232,168,56,0.15)',  label: 'ADHD' },
  grief:           { Icon: Flower,          color: '#B0A090', bg: 'rgba(176,160,144,0.15)', label: 'Grief & Loss' },
  loneliness:      { Icon: Wind,            color: '#7BBD82', bg: 'rgba(123,189,130,0.15)', label: 'Loneliness' },
  stress:          { Icon: Waves,           color: '#5B9BD5', bg: 'rgba(91,155,213,0.15)',  label: 'Stress' },
  general_support: { Icon: HandHeart,       color: '#4A90D9', bg: 'rgba(74,144,217,0.15)',  label: 'General Support' },
};

export function groupMeta(category) {
  return GROUP_META[category] ?? {
    Icon: UsersThree,
    color: 'var(--color-accent)',
    bg: 'rgba(194,164,138,0.12)',
    label: category ?? 'Group',
  };
}
