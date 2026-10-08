(function () {
  'use strict';
  var popup = null, dialog = null, closeCallback = null, loading = null;
  function publish(user) {
    if (user) localStorage.setItem('dethe_auth_user', JSON.stringify(user));
    else localStorage.removeItem('dethe_auth_user');
    window.dispatchEvent(new CustomEvent('dethe-session', { detail: user }));
    return user;
  }
  async function loadSession() {
    if (loading) return loading;
    loading = (async function () {
      var response = await fetch('/api/auth/session', { cache: 'no-store' });
      var data = await response.json();
      var user = response.ok ? data.user : null;
      if (user) {
        var stored = localStorage.getItem('dethe_pending_payment') || localStorage.getItem('dethe_billing');
        if (stored) {
          try {
            var proof = JSON.parse(stored);
            var verified = await fetch('/api/billing/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proof) });
            var result = await verified.json();
            if (verified.ok && result.ok) {
              user = result.user;
              localStorage.removeItem('dethe_pending_payment'); localStorage.removeItem('dethe_billing');
            }
          } catch (_) { /* Keep payment proof available for a later retry. */ }
        }
      }
      return publish(user);
    })().catch(function () { return publish(null); }).finally(function () { loading = null; });
    return loading;
  }
  function close() {
    if (!dialog) return;
    var current = dialog, callback = closeCallback;
    dialog = null; closeCallback = null;
    current.close(); current.remove();
    if (callback) callback();
  }
  async function beginGoogle(status) {
    popup = window.open('', 'dethe_google', 'width=500,height=650');
    status.textContent = 'Opening Google sign-in…';
    try {
      var response = await fetch('/api/auth/google/url', { cache: 'no-store' });
      var data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.message || 'Google sign-in is unavailable.');
      if (popup) popup.location.replace(data.url);
      else location.assign(data.url);
    } catch (error) {
      if (popup) popup.close(); popup = null;
      status.textContent = error.message;
    }
  }
  function open(onClose) {
    if (dialog) return;
    closeCallback = onClose;
    dialog = document.createElement('dialog');
    dialog.className = 'account-dialog';
    dialog.setAttribute('aria-labelledby', 'account-title');
    dialog.innerHTML = '<button class="account-close" type="button" aria-label="Close sign-in">×</button><h2 id="account-title">Sign in to DetheAI</h2><p>Use your verified Google account to keep your plan and credits with your account.</p><button class="account-google" type="button">Continue with Google</button><p class="account-status" role="status" aria-live="polite"></p><p class="account-note">Email/password sign-in is unavailable. Google sign-in does not share your password with DetheAI.</p>';
    document.body.appendChild(dialog);
    dialog.querySelector('.account-close').onclick = close;
    dialog.querySelector('.account-google').onclick = function () { beginGoogle(dialog.querySelector('.account-status')); };
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    dialog.showModal();
  }
  async function logout() {
    const response = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (!response.ok) throw new Error('Could not sign out. Please try again.');
    publish(null);
  }
  window.addEventListener('message', async function (event) {
    if (event.origin !== location.origin || event.source !== popup || event.data?.type !== 'OAUTH_AUTH_SUCCESS') return;
    popup = null;
    if (await loadSession()) close();
  });
  window.detheAuth = { loadSession: loadSession, open: open, close: close, logout: logout };
})();
