(function() {
  function ensureErrorEl(input) {
    if (!input) return null;
    var next = input.nextElementSibling;
    if (next && next.classList && next.classList.contains('field-inline-error')) return next;
    var el = document.createElement('div');
    el.className = 'field-inline-error';
    input.insertAdjacentElement('afterend', el);
    return el;
  }
  function clear(input) {
    if (!input) return;
    input.classList.remove('input-invalid');
    var next = input.nextElementSibling;
    if (next && next.classList && next.classList.contains('field-inline-error')) next.textContent = '';
  }
  function set(input, msg) {
    if (!input) return;
    input.classList.add('input-invalid');
    var el = ensureErrorEl(input);
    if (el) el.textContent = msg || 'Проверьте значение';
  }
  function validate(input, test, msg) {
    clear(input);
    var ok = typeof test === 'function' ? !!test(input && input.value) : true;
    if (!ok) set(input, msg);
    return ok;
  }
  window.FormValidation = { clear: clear, set: set, validate: validate };
})();
