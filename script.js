(function () {
  var input = document.getElementById('q');
  var status = document.getElementById('status');
  var bands = Array.prototype.slice.call(document.querySelectorAll('.band'));
  var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lowercase, drop accents and punctuation, and fold katakana into hiragana,
  // so that "Investigación", "investigacion", "ブログ" and "ぶろぐ" all match.
  function norm(s) {
    return s.normalize('NFKC').toLowerCase()
      .replace(/[\u30a1-\u30f6]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0x60); })
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
      .replace(/[^\p{L}\p{N}\p{M}_]+/gu, ' ').trim();
  }

  var JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;

  // Filler words in the four languages, ignored in phrases like "show me your blog".
  var FILLER = {};
  ('a al an and are at can con de del did do does el els en es et find for from have how i ' +
   'in is la las les los me mi mis my of on que quiero sobre show see te tell the to tu tus ' +
   'un una vull veure ver want what where with y you your about el meu teu dame muestrame ' +
   'ensename ensenya mostra look give como com').split(' ').forEach(function (w) { FILLER[norm(w)] = true; });

  var sections = bands.map(function (band, i) {
    return {
      band: band,
      button: band.querySelector('button'),
      panel: band.querySelector('.panel'),
      number: i + 1,
      title: norm(band.dataset.title),
      aliases: norm(band.dataset.aliases).split(' ').map(function (a) { return a.replace(/_/g, ' '); }),
      text: norm(band.textContent),
      items: Array.prototype.map.call(band.querySelectorAll('[data-item]'), function (el) {
        var title = el.querySelector('.it');
        return {
          el: el,
          name: title.textContent,
          title: norm(title.textContent),
          keys: norm(el.dataset.keys || ''),
          text: norm(el.textContent)
        };
      })
    };
  });

  // Japanese has no spaces, so any substring counts. Elsewhere, match from the start of a word.
  function contains(text, q) {
    return JAPANESE.test(q) ? text.indexOf(q) !== -1 : (' ' + text).indexOf(' ' + q) !== -1;
  }

  // Edit distance that also counts swapped neighbours as one typo ("wirting").
  function distance(a, b) {
    var d = [];
    for (var i = 0; i <= a.length; i++) { d[i] = [i]; }
    for (var j = 0; j <= b.length; j++) { d[0][j] = j; }
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }

  function first(test) {
    for (var i = 0; i < sections.length; i++) if (test(sections[i])) return { section: sections[i] };
    return null;
  }

  function firstItem(test) {
    for (var i = 0; i < sections.length; i++) {
      for (var j = 0; j < sections[i].items.length; j++) {
        var item = sections[i].items[j];
        if (test(item)) return { section: sections[i], item: item };
      }
    }
    return null;
  }

  function matchSection(q) {
    return first(function (s) { return s.title === q || s.aliases.indexOf(q) !== -1; })
      || first(function (s) { return s.title.indexOf(q) === 0; })
      || (q.length >= 2 && first(function (s) {
        return s.aliases.some(function (a) { return a.indexOf(q) === 0; });
      })) || null;
  }

  function matchItem(q) {
    return firstItem(function (it) { return contains(it.title, q); })
      || firstItem(function (it) { return contains(it.keys, q); });
  }

  // Japanese sentences: find a known word inside what was typed ("ブログを読みたい").
  function matchInside(q) {
    function within(word) { return word.length >= 2 && JAPANESE.test(word) && q.indexOf(word) !== -1; }
    return firstItem(function (it) { return it.keys.split(' ').some(within); })
      || first(function (s) { return s.aliases.some(within); });
  }

  function matchTypo(q) {
    function close(word) {
      return Math.abs(word.length - q.length) <= 2 && distance(q, word) <= (q.length > 6 ? 2 : 1);
    }
    function closeToWord(text) { return text.split(' ').some(close); }
    return first(function (s) { return close(s.title) || s.aliases.some(close); })
      || firstItem(function (it) { return closeToWord(it.title) || closeToWord(it.keys); });
  }

  function matchWord(q) {
    var long = q.length >= 3 || JAPANESE.test(q);
    var hit = matchSection(q)
      || (long && matchItem(q))
      || (long && firstItem(function (it) { return contains(it.text, q); }))
      || (JAPANESE.test(q) && matchInside(q))
      || ((q.length >= 4 || JAPANESE.test(q)) && first(function (s) { return contains(s.text, q); }))
      || (q.length >= 4 && matchTypo(q));
    return hit || null;
  }

  // Most specific rule wins: the whole query, then a named item, then a section.
  function find(raw) {
    var q = norm(raw);
    if (!q) return null;

    if (/^0?[1-9]$/.test(q)) {
      var numbered = first(function (s) { return s.number === Number(q); });
      return numbered;
    }

    var hit = FILLER[q] ? matchSection(q) : matchWord(q);
    if (hit || q.indexOf(' ') === -1) return hit;

    var all = q.split(' ');
    var words = all.filter(function (w) { return !FILLER[w]; });
    if (!words.length) words = all;
    var i;
    for (i = 0; i < words.length; i++) {
      if (words[i].length >= 3 && (hit = matchItem(words[i]))) return hit;
    }
    for (i = 0; i < words.length; i++) {
      if ((hit = matchSection(words[i]))) return hit;
    }
    for (i = 0; i < words.length; i++) {
      if ((hit = matchWord(words[i]))) return hit;
    }
    return null;
  }

  function clearHit() {
    var old = document.querySelector('.hit');
    if (old) old.classList.remove('hit');
  }

  function keepInView(band, item) {
    window.setTimeout(function () {
      if (item) {
        item.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
        return;
      }
      var line = document.querySelector('.top').getBoundingClientRect().bottom;
      if (band.getBoundingClientRect().top < line) {
        band.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
      }
    }, calm ? 0 : 380);
  }

  function open(section, item) {
    sections.forEach(function (s) {
      var on = s === section;
      s.band.classList.toggle('open', on);
      s.button.setAttribute('aria-expanded', on);
      s.panel.inert = !on;
    });
    keepInView(section.band, item);
    var url = section === sections[0] ? location.pathname + location.search : '#' + section.band.id;
    history.replaceState(null, '', url);
  }

  function respond() {
    clearHit();
    var q = input.value.trim();
    if (!q) { status.textContent = ''; return; }
    var hit = find(q);
    if (!hit) {
      // Short strings are usually a word in progress, so stay quiet.
      status.textContent = q.length < 3 && !JAPANESE.test(q) ? '' : 'nothing for that. try writing, projects, talks or contact.';
      return;
    }
    if (hit.item) hit.item.el.classList.add('hit');
    open(hit.section, hit.item && hit.item.el);
    status.textContent = hit.section.title + (hit.item ? ' ⋅ ' + hit.item.name : '');
  }

  // A short pause, so sections don't flicker mid-sentence.
  var pause;
  function respondSoon() {
    clearTimeout(pause);
    pause = setTimeout(respond, 120);
  }

  input.addEventListener('input', function (e) {
    if (!e.isComposing) respondSoon();   // wait for Japanese input to be committed
  });
  input.addEventListener('compositionend', respondSoon);
  input.addEventListener('keydown', function (e) {
    if (e.isComposing) return;
    if (e.key === 'Escape' || (e.key === 'Enter' && find(input.value))) {
      clearTimeout(pause);
      if (e.key === 'Enter') respond();
      input.value = '';
      status.textContent = '';
      if (e.key === 'Escape') clearHit();
    }
  });

  sections.forEach(function (s) {
    s.button.addEventListener('click', function () {
      clearHit();
      input.value = '';
      status.textContent = '';
      open(s);
    });
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== input && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      input.focus();
    }
  });

  var flags = Array.prototype.slice.call(document.querySelectorAll('.flags button'));
  var bios = Array.prototype.slice.call(document.querySelectorAll('.bio'));
  flags.forEach(function (flag) {
    flag.addEventListener('click', function () {
      flags.forEach(function (f) { f.setAttribute('aria-pressed', f === flag); });
      bios.forEach(function (bio) { bio.hidden = bio.lang !== flag.dataset.lang; });
    });
  });

  function fromHash() {
    var id = location.hash.slice(1);
    open(first(function (s) { return s.band.id === id; }) || sections[0]);
  }
  window.addEventListener('hashchange', fromHash);
  fromHash();

  if (matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true });
})();
