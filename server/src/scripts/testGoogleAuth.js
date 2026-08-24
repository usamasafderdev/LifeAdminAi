import 'dotenv/config';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';
import { GoogleCredentialError, setGoogleVerifierForTests } from '../utils/googleAuth.js';

process.env.NODE_ENV = 'test';

const NEW_EMAIL = 'googlenew@lifeadmin.local';
const LINKED_EMAIL = 'linked@lifeadmin.local';
const UNVERIFIED_EMAIL = 'unverified@lifeadmin.local';
const payloads = {
  'valid-new': { sub: 'google-test-id-1', email: NEW_EMAIL.toUpperCase(), email_verified: true, name: 'Google Test User', picture: 'https://example.com/avatar.png' },
  'valid-linked': { sub: 'google-linked-id', email: LINKED_EMAIL, email_verified: true, name: 'Linked Google User' },
  unverified: { sub: 'google-unverified-id', email: UNVERIFIED_EMAIL, email_verified: false, name: 'Unverified User' },
};

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(35, '.')} PASS`);
}

async function run() {
  let httpServer;
  try {
    await connectDB();
    await User.init();
    await User.deleteMany({ email: { $in: [NEW_EMAIL, LINKED_EMAIL, UNVERIFIED_EMAIL] } });

    setGoogleVerifierForTests(async (credential) => {
      if (!payloads[credential]) throw new GoogleCredentialError('Rejected test credential');
      return payloads[credential];
    });

    httpServer = app.listen(0);
    await new Promise((resolve) => httpServer.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
    const request = async (path, options = {}) => {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
      return { status: response.status, body: await response.json() };
    };
    const post = (path, body) => request(path, { method: 'POST', body });

    check((await post('/api/auth/google', {})).status === 400, 'Google missing credential');
    check((await post('/api/auth/google', { credential: 'invalid' })).status === 401, 'Google invalid credential');

    const created = await post('/api/auth/google', { credential: 'valid-new' });
    check(created.status === 200 && created.body.success && created.body.token, 'Google new user');
    check(created.body.user.email === NEW_EMAIL, 'Google email normalization');
    const responseText = JSON.stringify(created.body);
    check(!responseText.includes('valid-new') && !('password' in created.body.user) && !('googleId' in created.body.user), 'Google safe response');

    const googleUser = await User.findOne({ email: NEW_EMAIL }).select('+password +googleId');
    check(googleUser.googleId === 'google-test-id-1' && googleUser.password === undefined, 'Google-only user has no password');
    const localAttempt = await post('/api/auth/login', { email: NEW_EMAIL, password: 'ArbitraryPassword123' });
    check(localAttempt.status === 401 && localAttempt.body.message === 'Invalid email or password', 'Google-only local login rejected');

    const repeat = await post('/api/auth/google', { credential: 'valid-new' });
    check(repeat.status === 200 && repeat.body.user._id === created.body.user._id && await User.countDocuments({ email: NEW_EMAIL }) === 1, 'Existing Google user reused');

    const me = await request('/api/auth/me', { headers: { authorization: `Bearer ${created.body.token}` } });
    check(me.status === 200 && me.body.user.email === NEW_EMAIL, 'Google JWT works with me');

    const localRegistration = await post('/api/auth/register', { fullName: 'Linked Local User', email: LINKED_EMAIL, password: 'LocalPassword123' });
    check(localRegistration.status === 201, 'Linked local account created');
    const beforeLink = await User.findOne({ email: LINKED_EMAIL }).select('+password');
    const originalHash = beforeLink.password;
    const linked = await post('/api/auth/google', { credential: 'valid-linked' });
    const afterLink = await User.findOne({ email: LINKED_EMAIL }).select('+password +googleId');
    check(linked.status === 200 && linked.body.user._id === localRegistration.body.user._id && afterLink.googleId === 'google-linked-id', 'Existing local account linked');
    check(afterLink.password === originalHash && await afterLink.comparePassword('LocalPassword123'), 'Linked password preserved');
    check((await post('/api/auth/login', { email: LINKED_EMAIL, password: 'LocalPassword123' })).status === 200, 'Linked local login works');
    check((await post('/api/auth/google', { credential: 'valid-linked' })).status === 200, 'Linked Google login works');

    check((await post('/api/auth/google', { credential: 'unverified' })).status === 401 && !(await User.exists({ email: UNVERIFIED_EMAIL })), 'Unverified Google email rejected');

    let uniqueGoogleId = false;
    try {
      await User.create({ fullName: 'Duplicate Google Identity', email: 'duplicate-google@lifeadmin.local', googleId: 'google-test-id-1' });
    } catch (error) {
      uniqueGoogleId = error?.code === 11000;
      await User.deleteOne({ email: 'duplicate-google@lifeadmin.local' });
    }
    check(uniqueGoogleId, 'Unique Google ID enforced');
    console.log('Google authentication verification completed successfully.');
  } catch (error) {
    console.error(`Google authentication verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.connection.close();
  }
}

run();
