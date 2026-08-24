const LOCAL_TOKEN_KEY = 'la_token';
const SESSION_TOKEN_KEY = 'la_session_token';

export function getToken() {
  return localStorage.getItem(LOCAL_TOKEN_KEY) || sessionStorage.getItem(SESSION_TOKEN_KEY);
}

export function setToken(token, remember = true) {
  removeToken();
  (remember ? localStorage : sessionStorage).setItem(
    remember ? LOCAL_TOKEN_KEY : SESSION_TOKEN_KEY,
    token,
  );
}

export function removeToken() {
  localStorage.removeItem(LOCAL_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  localStorage.removeItem('la_auth');
}
