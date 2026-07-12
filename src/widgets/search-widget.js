function render(config) {
  const defaultEngine = config.defaultEngine || 'google';
  return `<div class="search-container">
  <form id="search-form" action="https://www.google.com/search" method="GET">
    <input type="search" name="q" autofocus placeholder="search..." class="search-input" autocomplete="off" />
    <div class="engine-toggle">
      <button type="button" data-engine="google">Google</button>
      <button type="button" data-engine="kagi">Kagi</button>
      <button type="button" data-engine="ddg">DDG</button>
    </div>
  </form>
  <script>
    (function () {
      var engines = {
        google: { action: 'https://www.google.com/search', param: 'q' },
        kagi:   { action: 'https://kagi.com/search',        param: 'q' },
        ddg:    { action: 'https://duckduckgo.com/',         param: 'q' }
      };
      var saved = localStorage.getItem('search-engine') || '${defaultEngine}';
      var form = document.getElementById('search-form');
      form.action = engines[saved].action;
      form.querySelector('input[type=search]').name = engines[saved].param;
      document.querySelectorAll('.engine-toggle button').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.engine === saved);
        btn.addEventListener('click', function () {
          localStorage.setItem('search-engine', btn.dataset.engine);
          form.action = engines[btn.dataset.engine].action;
          form.querySelector('input[type=search]').name = engines[btn.dataset.engine].param;
          document.querySelectorAll('.engine-toggle button').forEach(function (b) {
            b.classList.toggle('active', b.dataset.engine === btn.dataset.engine);
          });
        });
      });
    })();
  </script>
</div>`;
}

module.exports = { render };
