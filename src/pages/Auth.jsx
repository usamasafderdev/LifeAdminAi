import { ArrowRight, Check, Eye, EyeOff, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field } from '../components/UI';
import { useApp } from '../context/AppContext';

export function Login() {
  return <Auth mode="login" />;
}
export function Register() {
  return <Auth mode="register" />;
}
function Auth({ mode }) {
  const [show, setShow] = useState(false),
    [errors, setErrors] = useState({});
  const nav = useNavigate();
  const { login } = useApp();
  const submit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget),
      next = {};
    if (!String(fd.get('email')).includes('@')) next.email = 'Enter a valid email address.';
    if (String(fd.get('password')).length < 6) next.password = 'Use at least 6 characters.';
    if (mode === 'register' && fd.get('password') !== fd.get('confirm'))
      next.confirm = 'Passwords do not match.';
    setErrors(next);
    if (!Object.keys(next).length) {
      login();
      nav('/app/dashboard');
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="auth-brand">
          <span>
            <Sparkles />
          </span>
          LifeAdmin AI
        </div>
        <div>
          <p className="eyebrow">YOUR PERSONAL OPERATIONS SYSTEM</p>
          <h1>Keep life’s important details from slipping through.</h1>
          <p>Turn scattered documents, deadlines and reminders into one clear plan of action.</p>
          <ul>
            <li>
              <Check />
              Know what needs attention today
            </li>
            <li>
              <Check />
              Connect documents to real actions
            </li>
            <li>
              <Check />
              Review AI insights before saving
            </li>
          </ul>
        </div>
        <small>Private by design · Human-reviewed AI</small>
      </section>
      <main className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="mobile-auth-brand">
            <Sparkles />
            LifeAdmin AI
          </div>
          <h2>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p>
            {mode === 'login'
              ? 'Sign in to see what needs your attention.'
              : 'Start organizing the details that keep life moving.'}
          </p>
          {mode === 'register' && (
            <Field label="Full name">
              <input name="name" placeholder="Haris Amjad" required />
            </Field>
          )}
          <Field label="Email address">
            <input
              name="email"
              type="email"
              defaultValue={mode === 'login' ? 'haris@example.com' : ''}
              placeholder="you@example.com"
            />
            <span className="error">{errors.email}</span>
          </Field>
          <Field label="Password">
            <div className="password">
              <input
                name="password"
                type={show ? 'text' : 'password'}
                defaultValue={mode === 'login' ? 'demo123' : ''}
                placeholder="At least 6 characters"
              />
              <button type="button" onClick={() => setShow(!show)}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
            <span className="error">{errors.password}</span>
          </Field>
          {mode === 'register' && (
            <Field label="Confirm password">
              <input name="confirm" type="password" />
              <span className="error">{errors.confirm}</span>
            </Field>
          )}
          {mode === 'login' ? (
            <div className="auth-options">
              <label>
                <input type="checkbox" />
                Remember me
              </label>
              <button type="button">Forgot password?</button>
            </div>
          ) : (
            <label className="checkbox">
              <input type="checkbox" required />I agree to the Terms and Privacy Policy
            </label>
          )}
          <Button className="auth-submit">
            {mode === 'login' ? 'Sign in' : 'Create account'}
            <ArrowRight />
          </Button>
          <p className="auth-switch">
            {mode === 'login' ? (
              <>
                New to LifeAdmin? <Link to="/register">Create account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link to="/login">Sign in</Link>
              </>
            )}
          </p>
        </form>
      </main>
    </div>
  );
}
