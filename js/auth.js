// ============================================================
// AUTH — connexion / protection des pages
// ============================================================

const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.textContent = '';

    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = 'Identifiants incorrects.';
      return;
    }
    window.location.href = 'index.html';
  });
}

async function requireAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = 'login.html';
}

supabaseClient.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && !window.location.href.includes('login.html')) {
    window.location.href = 'login.html';
  }
});
