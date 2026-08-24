import { OAuth2Client } from 'google-auth-library';

let testVerifier;

export class GoogleCredentialError extends Error {}

async function verifyWithGoogle(credential) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const isDevelopment = process.env.NODE_ENV === 'development';
  if (!clientId) {
    const error = new Error('GOOGLE_CLIENT_ID is not configured');
    error.code = 'GOOGLE_CONFIG_ERROR';
    throw error;
  }

  if (isDevelopment) {
    console.info('[Google Auth] Client ID configured: yes');
    console.info(`[Google Auth] Expected audience: ${clientId}`);
    console.info(`[Google Auth] Credential received: yes; length: ${credential.length}`);
    console.info('[Google Auth] Starting verifyIdToken');
  }

  try {
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (isDevelopment) {
      console.info(`[Google Auth] Token verified; email_verified: ${payload?.email_verified === true}`);
    }
    return payload;
  } catch (error) {
    if (isDevelopment) {
      console.error(`[Google Auth] Verification failed (${error?.name || 'Error'}): ${error?.message || 'Unknown verification error'}`);
    }
    const verificationError = new GoogleCredentialError('Google authentication failed');
    verificationError.code = 'GOOGLE_TOKEN_VERIFICATION_FAILED';
    throw verificationError;
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
