(function() {
    var placeholder = document.getElementById('footer-placeholder');
    if (!placeholder) return;
    var pathname = window.location.pathname || '';
    var isAdmin = pathname.indexOf('admin') !== -1 || pathname.indexOf('admin\\') !== -1;
    var url = isAdmin ? '../partials/footer.html' : 'partials/footer.html';
    fetch(url)
        .then(function(r) { return r.text(); })
        .then(function(html) {
            var wrap = document.createElement('div');
            wrap.innerHTML = html.trim();
            var footer = wrap.firstChild;
            if (isAdmin && footer) {
                footer.querySelectorAll('a[href]').forEach(function(a) {
                    var h = a.getAttribute('href');
                    if (h && h.indexOf('http') !== 0 && h.indexOf('//') !== 0 && h.indexOf('#') !== 0 && h.indexOf('../') !== 0)
                        a.setAttribute('href', '../' + h);
                });
            }
            placeholder.insertAdjacentElement('afterend', footer);
            placeholder.remove();
        })
        .catch(function() {
            placeholder.innerHTML = '<footer class="footer"><div class="container"><p>&copy; 2026 RealCPA Hub.</p></div></footer>';
        });
})();
