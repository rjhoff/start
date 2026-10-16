function render(config) {
  const defaultEngine = config.defaultEngine || 'google';
  return `<div class="search-container">
  <form id="search-form" action="https://www.google.com/search" method="GET">
    <label class="visually-hidden" for="search-input">Search the web</label>
    <input id="search-input" type="search" name="q" autofocus placeholder="Search the web" class="search-input" autocomplete="off" />
    <div class="engine-toggle" role="group" aria-label="Search destination">
      <button type="button" data-engine="google" aria-pressed="true">Google</button>
      <button type="button" data-engine="kagi" aria-pressed="false">Kagi</button>
      <button type="button" data-engine="ddg" aria-pressed="false">DDG</button>
    </div>
  </form>
  <script>
    (function () {
      var engines = {
        google: { action: 'https://www.google.com/search', param: 'q' },
        kagi:   { action: 'https://kagi.com/search',        param: 'q' },
        ddg:    { action: 'https://duckduckgo.com/',         param: 'q' }
      };
      var saved;
      try { saved = localStorage.getItem('search-engine') || '${defaultEngine}'; }
      catch (err) { saved = '${defaultEngine}'; }
      if (!engines[saved]) saved = 'google';
      var form = document.getElementById('search-form');
      var input = document.getElementById('search-input');
      var buttons = document.querySelectorAll('.engine-toggle button');
      function selectEngine(engine) {
        form.action = engines[engine].action;
        input.name = engines[engine].param;
        buttons.forEach(function (btn) {
          var active = btn.dataset.engine === engine;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-pressed', String(active));
        });
      }
      selectEngine(saved);
      buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          selectEngine(btn.dataset.engine);
          try { localStorage.setItem('search-engine', btn.dataset.engine); }
          catch (err) { /* The selection still works for this page. */ }
        });
      });
    })();
  </script>
</div>`;
}

module.exports = { render };
