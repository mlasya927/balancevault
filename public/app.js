
let token = null, user = null;
const $ = id => document.getElementById(id);
const rupees = p => 'INR ' + (Number(p) / 100).toFixed(2);

async function api(path, opt = {}) {
  const headers = { ...(opt.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (opt.body) headers['Content-Type'] = 'application/json';

  const r = await fetch(path, { ...opt, headers });
  const b = await r.json().catch(() => ({ error: 'Bad server response' }));
  if (!r.ok) throw Error(b.error || 'Request failed');
  return b;
}

function msg(id, t, ok = false) {
  $(id).textContent = t;
  $(id).className = 'message ' + (ok ? 'ok' : 'error');
}

function esc(x) {
  return String(x).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  }[c]));
}

function render() {
  $('loginPanel').hidden = !!token;
  $('appPanel').hidden = !token;
  $('session').textContent = token
    ? `${user.name} · ${user.role}`
    : 'Not signed in';

  $('auditPanel').hidden =
    !token || !['admin', 'auditor'].includes(user.role);

  $('createAccountPanel')?.setAttribute(
    'hidden',
    token && user.role === 'admin' ? '' : 'hidden'
  );
}

$('loginForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const x = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(e.target)))
    });
    token = x.token;
    user = x.user;
    render();
    await accounts();
  } catch (x) {
    msg('loginMessage', x.message);
  }
};

$('logout').onclick = () => {
  token = null;
  user = null;
  render();
  $('accounts').innerHTML = '';
};

$('refresh').onclick = accounts;

async function accounts() {
  try {
    const a = await api('/api/accounts');
    $('accounts').innerHTML = a.map(x =>
      `<article class="account">
        <b>${esc(x.account_name)}</b>
        <div class="balance">${rupees(x.balance_paise)}</div>
        <small>Account #${x.id}</small>
      </article>`
    ).join('') || 'No accounts';
  } catch (e) {
    msg('moneyMessage', e.message);
  }
}

// Create customer first, then create their account.
$('createAccountForm').onsubmit = async e => {
  e.preventDefault();

  if (user?.role !== 'admin') {
    msg('createAccountMessage', 'Only an admin can create customer accounts.');
    return;
  }

  const x = Object.fromEntries(new FormData(e.target));

  try {
    const customer = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: x.name,
        email: x.email,
        password: x.password
      })
    });

    await api('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        ownerUserId: customer.user.id,
        accountName: x.accountName,
        openingBalancePaise: 0
      })
    });

    msg('createAccountMessage', 'Customer and account created successfully!', true);
    e.target.reset();
    await accounts();
  } catch (err) {
    msg('createAccountMessage', err.message);
  }
};

$('moneyForm').elements.kind.onchange = e => {
  $('toWrap').hidden = e.target.value !== 'transfer';
};

$('moneyForm').onsubmit = async e => {
  e.preventDefault();
  const x = Object.fromEntries(new FormData(e.target));
  const kind = x.kind;
  delete x.kind;
  x.accountId = Number(x.accountId);
  x.amountPaise = Number(x.amountPaise);

  if (x.toAccountId) x.toAccountId = Number(x.toAccountId);
  else delete x.toAccountId;

  try {
    const r = await api('/api/money/' + kind, {
      method: 'POST',
      headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify(x)
    });
    msg('moneyMessage', JSON.stringify(r, null, 2), true);
    await accounts();
  } catch (err) {
    msg('moneyMessage', err.message);
  }
};

function table(rows) {
  return rows.length
    ? `<table><thead><tr>
        <th>Date</th><th>Type</th><th>Amount</th>
        <th>Balance</th><th>Initiator</th><th>Note</th>
      </tr></thead><tbody>
      ${rows.map(r => `<tr>
        <td>${esc(new Date(r.created_at).toLocaleString())}</td>
        <td>${esc(r.entry_type)}</td>
        <td>${rupees(r.amount_paise)}</td>
        <td>${rupees(r.balance_after_paise)}</td>
        <td>${esc(r.initiator_user_id)}</td>
        <td>${esc(r.description)}</td>
      </tr>`).join('')}
      </tbody></table>`
    : '<p>No entries.</p>';
}

$('statementForm').onsubmit = async e => {
  e.preventDefault();
  const id = new FormData(e.target).get('accountId');

  try {
    const x = await api(`/api/accounts/${id}/statement`);
    $('statement').innerHTML =
      `<p><b>Current balance:</b> ${rupees(x.currentBalancePaise)}</p>` +
      table(x.entries);
  } catch (err) {
    $('statement').textContent = err.message;
  }
};

$('loadAudit').onclick = async () => {
  try {
    $('audit').innerHTML = table(await api('/api/audit/ledger'));
  } catch (e) {
    $('audit').textContent = e.message;
  }
};

render();
