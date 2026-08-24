import 'dotenv/config';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import app from '../app.js';
import { connectDB } from '../config/db.js';
import User from '../models/User.js';

const AUTH_EMAIL = 'authtest@lifeadmin.local';
const DELETED_EMAIL = 'deletedauth@lifeadmin.local';
const validRegistration = {
  fullName: 'Auth Test User',
  email: 'AUTHTEST@LIFEADMIN.LOCAL',
  password: 'TestPassword123',
};

function check(condition, label) {
  if (!condition) throw new Error(`${label} failed`);
  console.log(`${label.padEnd(31, '.')} PASS`);
}

async function run() {
  let httpServer;
  try {
    await connectDB();
    await User.init();
    await User.deleteMany({ email: { $in: [AUTH_EMAIL, DELETED_EMAIL] } });

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

    const registration = await post('/api/auth/register', validRegistration);
    check(registration.status === 201 && registration.body.success && registration.body.token, 'Register valid');
    check(registration.body.user.email === AUTH_EMAIL, 'Register normalized email');
    check(!('password' in registration.body.user), 'Register safe response');

    check((await post('/api/auth/register', { email: 'name@lifeadmin.local', password: 'TestPassword123' })).status === 400, 'Register missing name');
    check((await post('/api/auth/register', { fullName: 'Test', password: 'TestPassword123' })).status === 400, 'Register missing email');
    check((await post('/api/auth/register', { fullName: 'Test', email: 'missing@lifeadmin.local' })).status === 400, 'Register missing password');
    check((await post('/api/auth/register', { fullName: 'Test', email: 'short@lifeadmin.local', password: 'short' })).status === 400, 'Register short password');
    check((await post('/api/auth/register', { fullName: 'Test', email: 'invalid-email', password: 'TestPassword123' })).status === 400, 'Register invalid email');
    const duplicate = await post('/api/auth/register', { ...validRegistration, email: AUTH_EMAIL });
    check(duplicate.status === 409 && duplicate.body.success === false, 'Register duplicate email');

    const login = await post('/api/auth/login', { email: AUTH_EMAIL, password: validRegistration.password });
    check(login.status === 200 && login.body.success && login.body.token, 'Login valid');
    check(!('password' in login.body.user), 'Login safe response');
    const badPassword = await post('/api/auth/login', { email: AUTH_EMAIL, password: 'IncorrectPassword' });
    const unknownEmail = await post('/api/auth/login', { email: 'unknown@lifeadmin.local', password: 'IncorrectPassword' });
    check(badPassword.status === 401 && badPassword.body.message === 'Invalid email or password', 'Login incorrect password');
    check(unknownEmail.status === 401 && unknownEmail.body.message === badPassword.body.message, 'Login unknown email');
    check((await post('/api/auth/login', { email: 'AUTHTEST@LIFEADMIN.LOCAL', password: validRegistration.password })).status === 200, 'Login uppercase email');
    check((await post('/api/auth/login', { email: AUTH_EMAIL })).status === 400, 'Login missing password');

    check((await request('/api/auth/me')).status === 401, 'Me without token');
    check((await request('/api/auth/me', { headers: { authorization: 'Bearer abc123' } })).status === 401, 'Me malformed token');
    const me = await request('/api/auth/me', { headers: { authorization: `Bearer ${login.body.token}` } });
    check(me.status === 200 && me.body.user.email === AUTH_EMAIL, 'Me valid token');
    check(!('password' in me.body.user), 'Me safe response');

    const payload = jwt.decode(login.body.token);
    const payloadKeys = Object.keys(payload).sort();
    check(payloadKeys.join(',') === 'exp,iat,userId' && payload.exp > payload.iat, 'JWT minimal payload and expiry');

    const deletedRegistration = await post('/api/auth/register', { fullName: 'Deleted Auth User', email: DELETED_EMAIL, password: 'TestPassword123' });
    await User.deleteOne({ email: DELETED_EMAIL });
    check((await request('/api/auth/me', { headers: { authorization: `Bearer ${deletedRegistration.body.token}` } })).status === 401, 'Me deleted user token');

    const storedUser = await User.findOne({ email: AUTH_EMAIL }).select('+password');
    check(Boolean(storedUser) && storedUser.password.startsWith('$2'), 'MongoDB user and hash');
    console.log('Authentication API verification completed successfully.');
  } catch (error) {
    console.error(`Authentication API verification failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    await mongoose.connection.close();
  }
}

run();
