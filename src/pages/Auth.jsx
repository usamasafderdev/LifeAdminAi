import { GoogleLogin } from '@react-oauth/google';
import { motion } from 'framer-motion';
import { AlertCircle, ArrowRight, CalendarClock, Check, Eye, EyeOff, FileCheck2, LockKeyhole, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../services/api';

export function Login() { return <Auth mode="login" />; }
export function Register() { return <Auth mode="register" />; }

const contexts = {
  login: [
    { icon: CalendarClock, eyebrow: 'UPCOMING', title: '3 deadlines this week', meta: 'Everything important, in view', tone: 'blue' },
    { icon: FileCheck2, eyebrow: 'AI REVIEWED', title: 'Registration Notice', meta: 'Deadline and 4 actions extracted', tone: 'green' },
    { icon: AlertCircle, eyebrow: 'NEEDS ATTENTION', title: 'Semester Fee', meta: 'Due tomorrow', tone: 'amber' },
  ],
  register: [
    { icon: FileCheck2, eyebrow: 'ORGANIZE', title: 'Documents understood', meta: 'Important details, automatically', tone: 'green' },
    { icon: Sparkles, eyebrow: 'ACT', title: 'Clear next steps', meta: 'From information to action', tone: 'blue' },
    { icon: CalendarClock, eyebrow: 'REMEMBER', title: 'Deadlines stay visible', meta: 'Before they become urgent', tone: 'amber' },
  ],
};

function AmbientCard({ item, index }) {
  const Icon = item.icon;
  return <motion.div className={`auth-signal signal-${index} ${item.tone}`} initial={{ opacity: 0, y: 16, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ delay: .14 + index * .08, duration: .42 }}><span><Icon /></span><div><small>{item.eyebrow}</small><strong>{item.title}</strong><p>{item.meta}</p></div></motion.div>;
}

function Auth({ mode }) {
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [requestError, setRequestError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [remember, setRemember] = useState(false);
  const nav = useNavigate();
  const { login, register, loginWithGoogle } = useAuth();
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const isLogin = mode === 'login';

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const next = {};
    if (!isLogin && !values.fullName?.trim()) next.fullName = 'Enter your full name.';
    if (!/^\S+@\S+\.\S+$/.test(values.email || '')) next.email = 'Enter a valid email address.';
    if (!isLogin && String(values.password).length < 8) next.password = 'Use at least 8 characters.';
    if (isLogin && !values.password) next.password = 'Enter your password.';
    if (!isLogin && values.password !== values.confirm) next.confirm = 'Passwords do not match.';
    if (!isLogin && !values.terms) next.terms = 'Accept the terms to create an account.';
    setErrors(next); setRequestError('');
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      if (isLogin) await login({ email: values.email, password: values.password }, remember);
      else await register({ fullName: values.fullName.trim(), email: values.email, password: values.password });
      nav('/app/dashboard', { replace: true });
    } catch (error) { setRequestError(getErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const googleSuccess = async (response) => {
    if (!response.credential || googleLoading) return;
    setGoogleLoading(true); setRequestError('');
    try {
      await loginWithGoogle(response.credential, isLogin ? remember : true);
      nav('/app/dashboard', { replace: true });
    } catch (error) { setRequestError(getErrorMessage(error, 'Google sign-in could not be completed. Please try again.')); }
    finally { setGoogleLoading(false); }
  };

  return <div className={`auth-command-page ${isLogin ? 'login-mode' : 'register-mode'}`}>
    <div className="auth-atmosphere" aria-hidden="true"><i /><i /><i /></div>
    <motion.header className="auth-command-header" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .36 }}>
      <Link to="/" className="auth-command-brand"><span><Sparkles /></span><div><strong>LifeAdmin AI</strong><small>PERSONAL INTELLIGENCE SYSTEM</small></div></Link>
      <div className="auth-trust"><LockKeyhole />Private by design</div>
    </motion.header>

    <main className="auth-command-layout">
      <section className="auth-product-context" aria-label="LifeAdmin product overview">
        <motion.div className="auth-context-copy" initial={{ opacity: 0, x: -18 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: .42 }}>
          <span className="auth-kicker"><i />YOUR PERSONAL COMMAND CENTER</span>
          <h1>{isLogin ? 'Everything important, already in motion.' : 'A clearer way to run your life.'}</h1>
          <p>{isLogin ? 'Return to the workspace that turns scattered information into organized action.' : 'Bring documents, deadlines, actions and reminders into one intelligent workspace.'}</p>
        </motion.div>
        <div className="auth-signal-stage">{contexts[mode].map((item, index) => <AmbientCard item={item} index={index} key={item.eyebrow} />)}</div>
      </section>

      <motion.section className="auth-command-panel" key={mode} initial={{ opacity: 0, y: 18, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .4, ease: [0.22, 1, 0.36, 1] }}>
        <div className="auth-panel-intro"><span><Sparkles />SECURE WORKSPACE ACCESS</span><h2>{isLogin ? 'Welcome back' : 'Create your workspace'}</h2><p>{isLogin ? 'Continue to your LifeAdmin command center.' : 'Start organizing what matters in one place.'}</p></div>
        <form className="auth-form" onSubmit={submit} noValidate>
          {requestError && <motion.div className="auth-error" role="alert" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}><AlertCircle />{requestError}</motion.div>}
          {!isLogin && <Field label="Full name"><input name="fullName" placeholder="Enter your full name" autoComplete="name" /><span className="error">{errors.fullName}</span></Field>}
          <Field label="Email address"><input name="email" type="email" placeholder="you@example.com" autoComplete="email" /><span className="error">{errors.email}</span></Field>
          <Field label="Password"><div className="password"><input name="password" type={show ? 'text' : 'password'} placeholder={isLogin ? 'Your password' : 'At least 8 characters'} autoComplete={isLogin ? 'current-password' : 'new-password'} /><button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff /> : <Eye />}</button></div><span className="error">{errors.password}</span></Field>
          {!isLogin && <Field label="Confirm password"><input name="confirm" type="password" placeholder="Repeat your password" autoComplete="new-password" /><span className="error">{errors.confirm}</span></Field>}
          {isLogin ? <div className="auth-options"><label><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Remember me</label><button type="button" disabled title="Password reset is coming soon">Forgot password?</button></div> : <><label className="checkbox auth-terms"><input name="terms" type="checkbox" /><span><Check /></span>I agree to the Terms and Privacy Policy</label><span className="error">{errors.terms}</span></>}
          <Button className="auth-submit" disabled={loading || googleLoading}>{loading ? <><span className="button-spinner" />{isLogin ? 'Signing in...' : 'Creating account...'}</> : <>{isLogin ? 'Enter LifeAdmin' : 'Create account'}<ArrowRight /></>}</Button>
          <div className="auth-divider"><span>or continue with</span></div>
          <div className="google-auth-area">{googleClientId ? <GoogleLogin onSuccess={googleSuccess} onError={() => setRequestError('Google sign-in could not be completed. Please try again.')} text={isLogin ? 'signin_with' : 'signup_with'} shape="rectangular" width="360" /> : <button type="button" disabled className="google-unconfigured">Google Sign-In is not configured</button>}{googleLoading && <small>Verifying your Google account...</small>}</div>
          <p className="auth-switch">{isLogin ? <>New to LifeAdmin? <Link to="/register">Create your workspace</Link></> : <>Already have an account? <Link to="/login">Sign in</Link></>}</p>
        </form>
      </motion.section>
    </main>
    <footer className="auth-command-footer"><span>LifeAdmin AI</span><span>Organize · Understand · Act · Remember</span></footer>
  </div>;
}
