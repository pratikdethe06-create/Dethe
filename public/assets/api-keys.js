(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  async function request(route, data) {
    const response = await fetch('/api/keys/' + route, data === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.message || 'Request failed.');
    return result;
  }
  function button(label, action) {
    const element = document.createElement('button');
    element.className = 'btn btn-sm'; element.textContent = label;
    element.onclick = async () => { element.disabled = true; try { await action(); } catch (error) { $('issueMsg').textContent = error.message; } finally { element.disabled = false; } };
    return element;
  }
  async function render() {
    for (const state of ['loading', 'login', 'free', 'paid']) $('state-' + state).classList.add('hidden');
    const user = await window.detheAuth.loadSession();
    if (!user) { $('state-login').classList.remove('hidden'); return; }
    if (user.plan === 'Free') { $('state-free').classList.remove('hidden'); return; }
    $('state-paid').classList.remove('hidden');
    $('welcome').textContent = 'Your API keys — ' + user.plan;
    const data = await request('list');
    // Include old device-saved keys so existing paying customers can revoke them.
    let legacy = [];
    try { legacy = JSON.parse(localStorage.getItem('dethe_api_keys') || '[]'); } catch (_) {}
    const keys = [...data.keys];
    if (Array.isArray(legacy)) for (const item of legacy) if (/^dth_live_[a-f0-9]{36,48}$/.test(item.key) && !keys.some(k => k.key === item.key)) keys.push(item);
    $('keyList').replaceChildren();
    if (!keys.length) $('keyList').textContent = 'No API keys yet.';
    keys.forEach(item => {
      const row = document.createElement('div'); row.className = 'row';
      const info = document.createElement('span'); info.textContent = item.key.slice(0, 16) + '…';
      row.append(info, button('Copy', () => navigator.clipboard.writeText(item.key)), button('Refresh', async () => {
        const result = await request('info', { apiKey: item.key });
        info.textContent = result.valid ? result.plan + ' · ' + result.creditsLeft + ' credits' : 'Expired or revoked';
      }), button('Revoke', async () => {
        if (!confirm('Revoke this API key? Apps using it will stop working.')) return;
        await request('revoke', { apiKey: item.key });
        if (Array.isArray(legacy)) localStorage.setItem('dethe_api_keys', JSON.stringify(legacy.filter(k => k.key !== item.key)));
        await render();
      }));
      $('keyList').append(row);
    });
  }
  window.copyNew = async function () {
    try { await navigator.clipboard.writeText($('newKeyValue').textContent); }
    catch (_) { $('issueMsg').textContent = 'Select and copy the key manually.'; }
  };
  $('issueBtn').onclick = async function () {
    this.disabled = true; $('issueMsg').textContent = 'Creating your key…';
    try {
      const result = await request('issue', {});
      $('newKeyValue').textContent = result.apiKey; $('curlKey').textContent = result.apiKey;
      $('newKey').classList.remove('hidden'); $('issueMsg').textContent = '';
      await render();
    } catch (error) { $('issueMsg').textContent = error.message; }
    finally { this.disabled = false; }
  };
  render().catch(error => { $('state-loading').classList.remove('hidden'); $('state-loading').textContent = error.message; });
})();
