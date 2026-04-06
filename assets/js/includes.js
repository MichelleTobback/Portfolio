(function () {
  "use strict";

  // Helper: load text from URL
  function loadText(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Failed to load ' + url + ': ' + r.status);
      return r.text();
    });
  }

  // Insert HTML fragment into the DOM and execute any scripts in it (preserve order)
  function insertFragment(targetParent, fragment, beforeNode) {
    // Extract scripts
    var scripts = Array.from(fragment.querySelectorAll('script'));
    scripts.forEach(function (s) { s.parentNode && s.parentNode.removeChild(s); });

    // Move non-script nodes into a DocumentFragment for insertion
    var insertFrag = document.createDocumentFragment();
    Array.from(fragment.childNodes).forEach(function (node) { insertFrag.appendChild(node); });

    if (beforeNode) targetParent.insertBefore(insertFrag, beforeNode);
    else targetParent.appendChild(insertFrag);

    // Helper to load/execute scripts sequentially
    return scripts.reduce(function (p, script) {
      return p.then(function () {
        return new Promise(function (resolve, reject) {
          var s = document.createElement('script');
          if (script.src) {
            s.src = script.src;
            s.onload = resolve;
            s.onerror = function () { resolve(); };
            document.body.appendChild(s);
          } else {
            s.textContent = script.textContent;
            document.body.appendChild(s);
            // Inline scripts execute immediately
            resolve();
          }
        });
      });
    }, Promise.resolve());
  }

  // Load and replace a single include placeholder element with the fetched HTML
  function processIncludeElement(el) {
    var url = el.getAttribute('data-include');
    if (!url) return Promise.resolve();
    return loadText(url).then(function (text) {
      var tpl = document.createElement('template');
      tpl.innerHTML = text;
      // Replace the placeholder element with the content
      var parent = el.parentNode;
      if (!parent) return Promise.resolve();
      return insertFragment(parent, tpl.content, el).then(function () {
        parent.removeChild(el);
      });
    }).then(function () {
      // After insertion, process nested includes inside the newly inserted nodes
      return processAllIncludes();
    }).catch(function (err) {
      console.error(err);
    });
  }

  // Load list fragments into elements (sets innerHTML)
  function processIncludeList(el) {
    var url = el.getAttribute('data-include-list');
    if (!url) return Promise.resolve();
    return loadText(url).then(function (text) {
      // We expect the fragment to contain <li> items or similar
      var tpl = document.createElement('template');
      tpl.innerHTML = text;
      // Extract scripts if present
      var scripts = Array.from(tpl.content.querySelectorAll('script'));
      scripts.forEach(function (s) { s.parentNode && s.parentNode.removeChild(s); });
      // Set innerHTML
      el.innerHTML = tpl.innerHTML;
      // Execute scripts sequentially
      return scripts.reduce(function (p, script) {
        return p.then(function () {
          return new Promise(function (resolve) {
            var s = document.createElement('script');
            if (script.src) {
              s.src = script.src;
              s.onload = resolve; s.onerror = resolve;
              document.body.appendChild(s);
            } else {
              s.textContent = script.textContent; document.body.appendChild(s); resolve();
            }
          });
        });
      }, Promise.resolve());
    }).then(function () {
      return processAllIncludes();
    }).catch(function (err) { console.error(err); });
  }

  // Find and process all include placeholders. We process one at a time to preserve order/nesting.
  function processAllIncludes() {
    var single = document.querySelector('[data-include], [data-include-list]');
    if (!single) return Promise.resolve();
    if (single.hasAttribute('data-include')) return processIncludeElement(single);
    return processIncludeList(single);
  }

  // Mark active nav link based on current URL
  function markActiveNav() {
    try {
      var path = location.pathname.split('/').pop() || 'index.html';
      var navLinks = document.querySelectorAll('#nav .links a');
      navLinks.forEach(function (a) {
        var href = a.getAttribute('href') || '';
        var hrefName = href.split('/').pop();
        var li = a.parentElement;
        if (!li) return;
        if (hrefName === path) li.classList.add('active'); else li.classList.remove('active');
      });
    } catch (e) { /* ignore */ }
  }

  // Kick off include processing on DOMContentLoaded
  document.addEventListener('DOMContentLoaded', function () {
    // When opened via file:// the browser blocks fetch() for local files.
    // Show a helpful banner and skip includes to avoid console noise.
    if (location.protocol === 'file:') {
      console.warn('Includes disabled when opened via file://. Serve site over http:// to enable partial includes.');
      try {
        var msg = document.createElement('div');
        msg.style.cssText = 'position:fixed;left:0;right:0;top:0;background:#fff3cd;color:#856404;padding:10px;border-bottom:1px solid #ffeeba;z-index:9999;font-family:sans-serif;text-align:center;';
        msg.innerHTML = 'Partial includes are blocked when opening files with <code>file://</code>. Run a local server, for example:<br><code>python3 -m http.server 8000</code> or <code>npx http-server</code>, then open <a href="http://localhost:8000/">http://localhost:8000/</a>.';
        document.body && document.body.insertBefore(msg, document.body.firstChild);
      } catch (e) { /* ignore DOM errors */ }
      return;
    }

    processAllIncludes().then(function () {
      // After all includes are processed, mark active nav
      markActiveNav();
    });
  });

})();
