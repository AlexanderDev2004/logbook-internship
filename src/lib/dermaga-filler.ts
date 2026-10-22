/**
 * "DERMAGA Filler" bookmarklet source.
 *
 * DERMAGA JTI (jti.polinema.ac.id/dermaga) has no public API, so the export
 * flow runs in the student's own browser: the app copies the week's entries
 * as JSON to the clipboard, the student opens DERMAGA (already logged in)
 * and runs this snippet as a bookmark. It opens a small panel, reads the
 * pasted data, finds the page's activity form by field shape (tanggal,
 * jam masuk/keluar, kegiatan) and submits it once per entry, keeping the
 * form's own hidden inputs (CSRF etc.) intact.
 *
 * The field mapping is heuristic because the form markup may change; the
 * panel logs every mapped field and every HTTP response so a mismatch is
 * visible immediately.
 */
export const DERMAGA_FILLER_CODE = String.raw`
async function dfMain() {
  var PID = 'dermaga-filler';
  var old = document.getElementById(PID);
  if (old) old.remove();
  var panel = document.createElement('div');
  panel.id = PID;
  panel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99999;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);width:360px;max-height:85vh;overflow:auto;font:13px/1.45 system-ui,sans-serif;color:#0f172a;padding:12px;';
  panel.innerHTML = '<b>DERMAGA Filler</b> <span style="color:#64748b">(dari Logbook Magang)</span>'
    + '<p style="margin:6px 0">Buka form tambah kegiatan DERMAGA (kalau bentuknya modal, klik dulu tombol tambahnya), tempel data di bawah, lalu klik <b>Muat data</b> dan <b>Isi semua</b>.</p>'
    + '<textarea id="df-data" rows="4" style="width:100%;box-sizing:border-box;font:11px monospace" placeholder="Tempel data dari Logbook di sini (Ctrl+V)"></textarea>'
    + '<div style="margin:8px 0"><button id="df-load">Muat data</button> <button id="df-run" disabled>Isi semua</button> <button id="df-close" style="float:right">Tutup</button></div>'
    + '<div id="df-log" style="white-space:pre-wrap;border-top:1px solid #e2e8f0;padding-top:6px;max-height:220px;overflow:auto;font-size:12px"></div>';
  document.body.appendChild(panel);
  var logEl = document.getElementById('df-log');
  function log(msg, ok) {
    var p = document.createElement('div');
    p.textContent = msg;
    p.style.color = ok === false ? '#b91c1c' : ok === true ? '#15803d' : '#334155';
    logEl.appendChild(p);
    logEl.scrollTop = logEl.scrollHeight;
  }
  document.getElementById('df-close').onclick = function () { panel.remove(); };
  var ENTRIES = null;
  document.getElementById('df-load').onclick = function () {
    var txt = document.getElementById('df-data').value;
    var m = txt.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) { log('Tidak ada JSON ditemukan. Klik "Salin data untuk DERMAGA" di Logbook dulu.', false); return; }
    try {
      var j = JSON.parse(m[0]);
      ENTRIES = Array.isArray(j) ? j : j.entries;
      if (!ENTRIES || !ENTRIES.length) throw new Error('entries kosong');
      document.getElementById('df-run').disabled = false;
      logEl.innerHTML = '';
      log('OK: ' + ENTRIES.length + ' entri dimuat.', true);
      ENTRIES.forEach(function (en, i) {
        log((i + 1) + '. ' + en.date + ' ' + (en.clockIn || '?') + '-' + (en.clockOut || '?') + ' ' + String(en.activity || '').slice(0, 48));
      });
    } catch (e) { log('Gagal parse: ' + e.message, false); }
  };
  /* Best-effort clipboard prefill, never blocking the handlers above. Keep
     this a block comment: the bookmarklet collapses newlines, and a line
     comment would then swallow the rest of the code. */
  navigator.clipboard.readText().then(function (t) {
    if (t && !document.getElementById('df-data').value) document.getElementById('df-data').value = t;
  }).catch(function () { /* permission denied: manual paste is fine */ });
  function findForm() {
    var forms = [].slice.call(document.querySelectorAll('form'));
    var scored = forms.map(function (f) {
      var s = 0;
      [].slice.call(f.querySelectorAll('input,select,textarea')).forEach(function (el) {
        var k = (el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '');
        if (el.type === 'date' || /tanggal|tgl|date/i.test(k)) s += 2;
        if (el.type === 'time' || /jam|masuk|keluar|pulang/i.test(k)) s += 2;
        if (/kegiatan|aktivitas|activity|uraian/i.test(k)) s += 2;
      });
      return { f: f, s: s };
    }).filter(function (x) { return x.s >= 4; })
      .sort(function (a, b) { return b.s - a.s; });
    return scored.length ? scored[0].f : null;
  }
  function pick(form, re) {
    var els = [].slice.call(form.querySelectorAll('input,select,textarea'));
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.type === 'hidden') continue;
      var k = (el.name || '') + ' ' + (el.id || '') + ' ' + (el.placeholder || '');
      if (re.test(k)) return el;
    }
    return null;
  }
  document.getElementById('df-run').onclick = async function () {
    if (!ENTRIES) return;
    var form = findForm();
    if (!form) {
      log('Form isian tidak ditemukan di halaman ini. Buka dulu form tambah kegiatan DERMAGA (klik tombol tambah / modalnya), lalu klik "Isi semua" lagi.', false);
      return;
    }
    var fDate = form.querySelector('input[type=date]') || pick(form, /tanggal|tgl|date/i);
    var times = [].slice.call(form.querySelectorAll('input[type=time]'));
    var fIn = times[0] || pick(form, /jam[\s_-]*masuk|masuk|start/i);
    var fOut = times[1] || pick(form, /jam[\s_-]*keluar|keluar|pulang|end/i);
    var fAct = form.querySelector('textarea') || pick(form, /kegiatan|aktivitas|activity|uraian|desc/i);
    log('Form: ' + (form.action || location.href));
    log('Field: tanggal=' + (fDate && (fDate.name || fDate.id)) + ' masuk=' + (fIn && (fIn.name || fIn.id)) + ' keluar=' + (fOut && (fOut.name || fOut.id)) + ' kegiatan=' + (fAct && (fAct.name || fAct.id)));
    if (!fAct) { log('Kolom kegiatan tidak ditemukan di form itu — kirim HTML form ini ke developer Logbook.', false); return; }
    var btn = this;
    btn.disabled = true;
    var okN = 0, failN = 0;
    for (var i = 0; i < ENTRIES.length; i++) {
      var en = ENTRIES[i];
      try {
        if (fDate) fDate.value = en.date || '';
        if (fIn) fIn.value = en.clockIn || '';
        if (fOut) fOut.value = en.clockOut || '';
        fAct.value = en.activity || '';
        var fd = new FormData(form);
        var pairs = [];
        fd.forEach(function (v, k) { if (typeof v === 'string') pairs.push(k + '=' + String(v).slice(0, 40)); });
        log('Kirim: ' + pairs.join(' | '));
        var res = await fetch(form.action || location.href, {
          method: form.method || 'POST',
          body: fd,
          credentials: 'same-origin',
          headers: { 'X-Requested-With': 'XMLHttpRequest' }
        });
        log((i + 1) + '. ' + en.date + ' -> HTTP ' + res.status, res.ok);
        if (res.ok) okN++; else failN++;
      } catch (e) {
        log((i + 1) + '. ' + en.date + ' -> GAGAL: ' + e.message, false);
        failN++;
      }
    }
    log('Selesai. OK=' + okN + ' GAGAL=' + failN + '. Cek tabel monitoring; muat ulang halaman bila perlu.', true);
    btn.disabled = false;
  };
}
dfMain();
`;

export const DERMAGA_FILLER_BOOKMARKLET =
  "javascript:" + DERMAGA_FILLER_CODE.replace(/\s*\n\s*/g, " ").trim();
