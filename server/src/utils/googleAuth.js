import { OAuth2Client } from 'google-auth-library';

let testVerifier;

export class GoogleCredentialError extends Error {}

async function verifyWithGoogle(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    const error = new Error('GOOGLE_CLIENT_ID is not configured');
    error.code = 'GOOGLE_CONFIG_ERROR';
    throw error;
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    return ticket.getPayload();
  } catch {
    throw new GoogleCredentialError('Google authentication failed');
  }
}

export function verifyGoogleCredential(credential) {
  if (process.env.NODE_ENV === 'test' && testVerifier) return testVerifier(credential);
  return verifyWithGoogle(credential);
}

export function setGoogleVerifierForTests(verifier) {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Google verifier can only be replaced in the test environment');
  }
  testVerifier = verifier;
}
