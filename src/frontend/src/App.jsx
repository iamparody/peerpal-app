import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Heart } from '@phosphor-icons/react';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import BottomNav from './components/BottomNav';
import EmergencyButton from './components/EmergencyButton';
import client from './api/client';
import { registerFCMToken } from './utils/firebase';

// Auth
import LoginScreen from './screens/auth/LoginScreen';
import RegisterScreen from './screens/auth/RegisterScreen';
import RecoverScreen from './screens/auth/RecoverScreen';
import EmailSentScreen from './screens/auth/EmailSentScreen';
import VerifyEmailScreen from './screens/auth/VerifyEmailScreen';
import ResetPasswordScreen from './screens/auth/ResetPasswordScreen';

// Onboarding
import ConsentScreen from './screens/onboarding/ConsentScreen';
import PersonaScreen from './screens/onboarding/PersonaScreen';
import ConditionScreen from './screens/onboarding/ConditionScreen';
import FirstMoodScreen from './screens/onboarding/FirstMoodScreen';

// Welcome
import WelcomeScreen from './screens/WelcomeScreen';
import CalmingSoundsScreen from './screens/CalmingSoundsScreen';
import CalmSpaceScreen from './screens/CalmSpaceScreen';
import PublicEmergencyScreen from './screens/PublicEmergencyScreen';

// Legal
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import TermsScreen from './screens/TermsScreen';
import DataComplianceScreen from './screens/DataComplianceScreen';

// Main screens
import DashboardScreen from './screens/DashboardScreen';
import MoodCheckinScreen from './screens/MoodCheckinScreen';
import AIChatScreen from './screens/AIChatScreen';
import JournalScreen from './screens/JournalScreen';
import GroupsScreen from './screens/GroupsScreen';
import GroupDetailScreen from './screens/GroupDetailScreen';
import GroupAgreementScreen from './screens/GroupAgreementScreen';
import GroupChatScreen from './screens/GroupChatScreen';
import EmergencyScreen from './screens/EmergencyScreen';
import SafetyPlanScreen from './screens/SafetyPlanScreen';
import ReferralScreen from './screens/ReferralScreen';
import TherapistIntakeScreen  from './screens/therapist/TherapistIntakeScreen';
import TherapistListScreen    from './screens/therapist/TherapistListScreen';
import TherapistConfirmScreen from './screens/therapist/TherapistConfirmScreen';
import TherapistStatusScreen  from './screens/therapist/TherapistStatusScreen';
import ResourcesScreen from './screens/ResourcesScreen';
import ArticleScreen from './screens/ArticleScreen';
import BreathingScreen from './screens/BreathingScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import SessionHistoryScreen from './screens/SessionHistoryScreen';
import ProfileScreen from './screens/ProfileScreen';
import EditPersonaScreen from './screens/EditPersonaScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import CreditsScreen from './screens/CreditsScreen';

// Peer
import PeerRequestScreen    from './screens/peer/PeerRequestScreen';
import PeerConnectingScreen from './screens/peer/PeerConnectingScreen';
import PeerWaitingScreen    from './screens/peer/PeerWaitingScreen';
import PeerTextChatScreen from './screens/peer/PeerTextChatScreen';
import PeerVoiceCallScreen from './screens/peer/PeerVoiceCallScreen';

// Training
import TrainingHomeScreen   from './screens/training/TrainingHomeScreen';
import SkillDetailScreen    from './screens/training/SkillDetailScreen';
import ScenarioScreen       from './screens/training/ScenarioScreen';
import MyPermissionsScreen  from './screens/training/MyPermissionsScreen';

const HIDE_NAV_ON = [
  '/login', '/register', '/recover', '/email-sent', '/verify-email', '/reset-password',
  '/onboarding', '/welcome', '/ai-chat', '/peer/session', '/peer/waiting', '/peer/connecting',
  '/emergency', '/emergency-public',
  '/privacy-policy', '/terms-of-service', '/data-compliance',
  '/therapists',
  '/persona/edit',
  '/credits',
  '/training/scenario',
];

// Paths where the unverified banner should not appear
const BANNER_HIDE_ON = [
  '/login', '/register', '/recover', '/email-sent', '/verify-email', '/reset-password',
  '/emergency-public', '/privacy-policy', '/terms-of-service', '/data-compliance',
];

function VerificationBanner() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [resendStatus, setResendStatus] = useState('idle'); // idle | sending | sent
  const [dismissed, setDismissed] = useState(false);

  // Reappear when any API call returns 403 (unverified gate hit)
  useEffect(() => {
    function handleVerificationRequired() { setDismissed(false); }
    window.addEventListener('verification-required', handleVerificationRequired);
    return () => window.removeEventListener('verification-required', handleVerificationRequired);
  }, []);

  if (!user || user.email_verified) return null;
  if (BANNER_HIDE_ON.some((p) => pathname.startsWith(p))) return null;
  if (dismissed) return null;

  async function handleResend() {
    if (resendStatus !== 'idle') return;
    setResendStatus('sending');
    try {
      await client.post('/api/auth/resend-verification');
      setResendStatus('sent');
    } catch {
      setResendStatus('idle');
    }
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
      background: 'var(--color-warning, #E88B3F)', color: '#fff',
      padding: '10px 16px', fontSize: 13, lineHeight: 1.4,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 12, flexWrap: 'wrap', textAlign: 'center',
    }}>
      <span>Please verify your email to access all features.</span>
      <button
        onClick={handleResend}
        disabled={resendStatus !== 'idle'}
        style={{
          background: 'none', border: '1px solid rgba(255,255,255,0.6)',
          color: '#fff', padding: '3px 12px', borderRadius: 4,
          cursor: resendStatus === 'idle' ? 'pointer' : 'default',
          fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
        }}
      >
        {resendStatus === 'sending' ? 'Sending…' : resendStatus === 'sent' ? 'Sent!' : 'Resend email'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: '#fff',
          fontSize: 18, lineHeight: 1, cursor: 'pointer', padding: '4px 6px',
          opacity: 0.8,
        }}
      >
        ×
      </button>
    </div>
  );
}

const PEER_BANNER_HIDE_ON = [
  '/login', '/register', '/recover', '/email-sent', '/verify-email', '/reset-password',
  '/onboarding', '/emergency', '/emergency-public',
  '/privacy-policy', '/terms-of-service', '/data-compliance',
  '/peer',
];

function PeerRequestBanner() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [openRequests, setOpenRequests] = useState([]);
  const [bannerVisible, setBannerVisible] = useState(false);
  const dismissedIds = useRef(new Set());

  useEffect(() => {
    if (!token) return;
    async function fetchOpen() {
      try {
        const { data } = await client.get('/api/peer/requests/open');
        setOpenRequests(data.requests ?? data ?? []);
      } catch { /* non-fatal */ }
    }
    fetchOpen();
    const interval = setInterval(fetchOpen, 10000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    const hasNew = openRequests.some(r => !dismissedIds.current.has(r.id));
    setBannerVisible(hasNew);
  }, [openRequests]);

  if (!token) return null;
  if (PEER_BANNER_HIDE_ON.some(p => pathname.startsWith(p))) return null;
  if (!bannerVisible) return null;

  function dismiss(e) {
    e.stopPropagation();
    openRequests.forEach(r => dismissedIds.current.add(r.id));
    setBannerVisible(false);
  }

  return (
    <div
      onClick={() => navigate('/peer')}
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 990,
        background: 'var(--color-calm)',
        color: '#fff',
        padding: '12px 44px 12px 16px',
        display: 'flex', alignItems: 'center', gap: 10,
        cursor: 'pointer',
        animation: 'peerBannerSlideDown 300ms ease, peerBannerPulse 2s ease-in-out 300ms infinite',
        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
      }}
    >
      <Heart size={20} weight="fill" color="#fff" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, fontSize: '0.88rem', lineHeight: 1.3 }}>
          Someone needs support
        </div>
        <div style={{ fontSize: '0.75rem', opacity: 0.85, marginTop: 1 }}>
          Tap to help — be a peer
        </div>
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', color: '#fff',
          fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '4px 8px', opacity: 0.8,
        }}
      >
        ×
      </button>
    </div>
  );
}

function Layout() {
  const { pathname } = useLocation();
  const { token } = useAuth();
  const hideNav = !token || HIDE_NAV_ON.some((p) => pathname.startsWith(p));

  // Register FCM token once after login — silently, never blocks the UI
  useEffect(() => {
    if (!token) return;
    registerFCMToken();
  }, [token]);

  return (
    <>
      <VerificationBanner />
      <PeerRequestBanner />
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        <Route path="/recover" element={<RecoverScreen />} />
        <Route path="/email-sent" element={<EmailSentScreen />} />
        <Route path="/verify-email" element={<VerifyEmailScreen />} />
        <Route path="/reset-password" element={<ResetPasswordScreen />} />
        <Route path="/emergency-public" element={<PublicEmergencyScreen />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyScreen />} />
        <Route path="/terms-of-service" element={<TermsScreen />} />
        <Route path="/data-compliance" element={<DataComplianceScreen />} />

        {/* Onboarding */}
        <Route path="/onboarding/consent"    element={<ProtectedRoute><ConsentScreen /></ProtectedRoute>} />
        <Route path="/onboarding/persona"    element={<ProtectedRoute><PersonaScreen /></ProtectedRoute>} />
        <Route path="/onboarding/condition"  element={<ProtectedRoute><ConditionScreen /></ProtectedRoute>} />
        <Route path="/onboarding/first-mood" element={<ProtectedRoute><FirstMoodScreen /></ProtectedRoute>} />

        {/* Welcome */}
        <Route path="/welcome"     element={<ProtectedRoute><WelcomeScreen /></ProtectedRoute>} />

        {/* Main app */}
        <Route path="/dashboard"   element={<ProtectedRoute><DashboardScreen /></ProtectedRoute>} />
        <Route path="/mood"        element={<ProtectedRoute><MoodCheckinScreen /></ProtectedRoute>} />
        <Route path="/ai-chat"     element={<ProtectedRoute><AIChatScreen /></ProtectedRoute>} />
        <Route path="/journal"     element={<ProtectedRoute><JournalScreen /></ProtectedRoute>} />
        <Route path="/groups"      element={<ProtectedRoute><GroupsScreen /></ProtectedRoute>} />
        <Route path="/groups/:id"  element={<ProtectedRoute><GroupDetailScreen /></ProtectedRoute>} />
        <Route path="/groups/:id/agree" element={<ProtectedRoute><GroupAgreementScreen /></ProtectedRoute>} />
        <Route path="/groups/:id/chat"  element={<ProtectedRoute><GroupChatScreen /></ProtectedRoute>} />
        <Route path="/emergency"   element={<ProtectedRoute><EmergencyScreen /></ProtectedRoute>} />
        <Route path="/safety-plan" element={<ProtectedRoute><SafetyPlanScreen /></ProtectedRoute>} />
        <Route path="/referral"           element={<ProtectedRoute><ReferralScreen /></ProtectedRoute>} />
        <Route path="/therapists"         element={<ProtectedRoute><TherapistIntakeScreen /></ProtectedRoute>} />
        <Route path="/therapists/browse"  element={<ProtectedRoute><TherapistListScreen /></ProtectedRoute>} />
        <Route path="/therapists/confirm" element={<ProtectedRoute><TherapistConfirmScreen /></ProtectedRoute>} />
        <Route path="/therapists/status"  element={<ProtectedRoute><TherapistStatusScreen /></ProtectedRoute>} />
        <Route path="/resources"   element={<ProtectedRoute><ResourcesScreen /></ProtectedRoute>} />
        <Route path="/resources/:id" element={<ProtectedRoute><ArticleScreen /></ProtectedRoute>} />
        <Route path="/sounds"      element={<ProtectedRoute><CalmingSoundsScreen /></ProtectedRoute>} />
        <Route path="/calm-space"  element={<ProtectedRoute><CalmSpaceScreen /></ProtectedRoute>} />
        <Route path="/breathing"   element={<BreathingScreen />} />
        <Route path="/analytics"   element={<ProtectedRoute><AnalyticsScreen /></ProtectedRoute>} />
        <Route path="/sessions"    element={<ProtectedRoute><SessionHistoryScreen /></ProtectedRoute>} />
        <Route path="/profile"        element={<ProtectedRoute><ProfileScreen /></ProtectedRoute>} />
        <Route path="/notifications"  element={<ProtectedRoute><NotificationsScreen /></ProtectedRoute>} />
        <Route path="/credits"        element={<ProtectedRoute><CreditsScreen /></ProtectedRoute>} />
        <Route path="/persona/edit"   element={<ProtectedRoute><EditPersonaScreen /></ProtectedRoute>} />

        {/* Training */}
        <Route path="/training"                     element={<ProtectedRoute><TrainingHomeScreen /></ProtectedRoute>} />
        <Route path="/training/permissions"         element={<ProtectedRoute><MyPermissionsScreen /></ProtectedRoute>} />
        <Route path="/training/:slug"               element={<ProtectedRoute><SkillDetailScreen /></ProtectedRoute>} />
        <Route path="/training/scenario/:attemptId" element={<ProtectedRoute><ScenarioScreen /></ProtectedRoute>} />

        {/* Peer support */}
        <Route path="/peer"              element={<ProtectedRoute><PeerRequestScreen /></ProtectedRoute>} />
        <Route path="/peer/connecting"   element={<ProtectedRoute><PeerConnectingScreen /></ProtectedRoute>} />
        <Route path="/peer/waiting/:id"  element={<ProtectedRoute><PeerWaitingScreen /></ProtectedRoute>} />
        <Route path="/peer/session/:id/text"  element={<ProtectedRoute><PeerTextChatScreen /></ProtectedRoute>} />
        <Route path="/peer/session/:id/voice" element={<ProtectedRoute><PeerVoiceCallScreen /></ProtectedRoute>} />

        {/* Admin */}

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/welcome" replace />} />
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>

      {!hideNav && <BottomNav />}
      {token && <EmergencyButton />}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </AuthProvider>
  );
}
