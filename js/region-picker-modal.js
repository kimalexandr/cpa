/**
 * Модальное окно «Выбор региона»: дерево локаций с чекбоксами, поиск, счётчики, indeterminate.
 * Использование: RealCPA.openRegionPicker({ offerId?: string, initialLocationIds?: string[], onConfirm: function(ids) {} })
 */
(function () {
  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  /** Собрать все id узлов дерева (рекурсивно) */
  function collectIds(nodes) {
    var ids = [];
    function walk(ns) {
      if (!ns || !ns.length) return;
      for (var i = 0; i < ns.length; i++) {
        ids.push(ns[i].id);
        walk(ns[i].children);
      }
    }
    walk(nodes);
    return ids;
  }

  /** Количество выбранных среди потомков (рекурсивно). selectedSet = Set of id. */
  function countSelectedInChildren(node, selectedSet) {
    if (!node.children || !node.children.length) {
      return selectedSet.has(node.id) ? 1 : 0;
    }
    var n = 0;
    for (var i = 0; i < node.children.length; i++) {
      n += countSelectedInChildren(node.children[i], selectedSet);
    }
    return n;
  }

  /** Общее число потомков (для indeterminate: частичный выбор) */
  function countDescendants(node) {
    if (!node.children || !node.children.length) return 1;
    var n = 0;
    for (var i = 0; i < node.children.length; i++) {
      n += countDescendants(node.children[i]);
    }
    return n;
  }

  /** Получить выбранные id из дерева (все отмеченные узлы = selectedSet) */
  function getSelectedIdsFromSet() {
    return Array.from(selectedSet);
  }

  /** Поставить чекбокс в indeterminate если частично выбраны дети */
  function updateParentIndeterminate(node, selectedSet) {
    if (!node.children || !node.children.length) return;
    var total = node.children.length;
    var selected = 0;
    for (var i = 0; i < node.children.length; i++) {
      selected += selectedSet.has(node.children[i].id) ? 1 : 0;
      updateParentIndeterminate(node.children[i], selectedSet);
    }
    if (!node._checkbox) return;
    if (selected === 0) {
      node._checkbox.checked = false;
      node._checkbox.indeterminate = false;
    } else if (selected === total) {
      node._checkbox.checked = true;
      node._checkbox.indeterminate = false;
    } else {
      node._checkbox.checked = false;
      node._checkbox.indeterminate = true;
    }
  }

  /** Рекурсивно обновить выбранность родителя по детям (все дети выбраны -> родитель отмечен; иначе indeterminate или снят) */
  function syncParentFromChildren(node, selectedSet) {
    if (!node.children || !node.children.length) return;
    for (var i = 0; i < node.children.length; i++) {
      syncParentFromChildren(node.children[i], selectedSet);
    }
    var total = node.children.length;
    var selected = 0;
    for (var j = 0; j < node.children.length; j++) {
      if (selectedSet.has(node.children[j].id)) selected++;
    }
    if (selected > 0) selectedSet.add(node.id);
    if (!node._checkbox) return;
    if (selected === 0) {
      node._checkbox.checked = false;
      node._checkbox.indeterminate = false;
    } else if (selected === total) {
      node._checkbox.checked = true;
      node._checkbox.indeterminate = false;
    } else {
      node._checkbox.checked = false;
      node._checkbox.indeterminate = true;
    }
  }

  function openRegionPicker(options) {
    options = options || {};
    var offerId = options.offerId || null;
    var initialLocationIds = options.initialLocationIds || [];
    var onConfirm = options.onConfirm || function () {};

    var tree = null;
    var selectedSet = new Set(initialLocationIds);
    var searchQuery = '';

    var overlay = document.getElementById('region-picker-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'region-picker-overlay';
      overlay.className = 'region-picker-overlay';
      overlay.innerHTML =
        '<div class="region-picker-modal">' +
        '  <div class="region-picker-header">' +
        '    <h2>Выбор региона</h2>' +
        '    <button type="button" class="region-picker-close" aria-label="Закрыть">&times;</button>' +
        '  </div>' +
        '  <div class="region-picker-search-wrap">' +
        '    <input type="text" class="region-picker-search" placeholder="Поиск по названию региона или города" id="regionPickerSearch">' +
        '  </div>' +
        '  <div class="region-picker-tree-wrap">' +
        '    <div class="region-picker-tree" id="regionPickerTree"></div>' +
        '  </div>' +
        '  <div class="region-picker-footer">' +
        '    <button type="button" class="btn btn-primary" id="regionPickerConfirm">Выбрать</button>' +
        '  </div>' +
        '</div>';
      document.body.appendChild(overlay);

      overlay.querySelector('.region-picker-close').addEventListener('click', function () {
        overlay.classList.remove('region-picker-open');
      });
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) overlay.classList.remove('region-picker-open');
      });
    }

    var treeEl = document.getElementById('regionPickerTree');
    var searchInput = document.getElementById('regionPickerSearch');
    var confirmBtn = document.getElementById('regionPickerConfirm');

    function matchNode(node, q) {
      if (!q) return true;
      var name = (node.name || '').toLowerCase();
      var full = (node.fullName || '').toLowerCase();
      return name.indexOf(q) !== -1 || full.indexOf(q) !== -1;
    }

    function matchTree(node, q) {
      if (!node) return false;
      if (matchNode(node, q)) return true;
      if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
          if (matchTree(node.children[i], q)) return true;
        }
      }
      return false;
    }

    function renderNode(node, level, parentExpanded) {
      var q = searchQuery.trim().toLowerCase();
      var hasMatch = matchTree(node, q);
      if (q && !hasMatch) return '';

      var paddingLeft = (level || 0) * 16 + 8;
      var isLeaf = !node.children || node.children.length === 0;
      var expandable = !isLeaf;
      var expanded = expandable && (parentExpanded || (q && hasMatch));
      var label = node.name || '';
      var count = countSelectedInChildren(node, selectedSet);
      if (count > 0) label += ' (' + count + ')';
      var displayName = node.type === 'city' && node.fullName ? node.fullName : node.name;
      if (node.type === 'city' && node.fullName) label = (node.fullName || node.name) + (count > 0 ? ' (' + count + ')' : '');

      var row =
        '<div class="region-picker-row" data-id="' + escapeHtml(node.id) + '" data-level="' + level + '" style="padding-left:' + paddingLeft + 'px">' +
        (expandable
          ? '<button type="button" class="region-picker-expand' + (expanded ? ' expanded' : '') + '" aria-expanded="' + expanded + '" data-id="' + escapeHtml(node.id) + '"></button>'
          : '<span class="region-picker-expand-placeholder"></span>') +
        '<label class="region-picker-label">' +
        '<input type="checkbox" class="region-picker-cb" data-id="' + escapeHtml(node.id) + '"' + (selectedSet.has(node.id) ? ' checked' : '') + '> ' +
        '<span class="region-picker-name">' + escapeHtml(displayName) + (count > 0 ? ' <span class="region-picker-count">(' + count + ')</span>' : '') + '</span>' +
        '</label>' +
        '</div>';

      var childRows = '';
      if (node.children && node.children.length && expanded) {
        for (var i = 0; i < node.children.length; i++) {
          childRows += renderNode(node.children[i], level + 1, expanded);
        }
      }
      return row + (childRows ? '<div class="region-picker-children' + (expanded ? ' region-picker-children-open' : '') + '" data-parent="' + escapeHtml(node.id) + '">' + childRows + '</div>' : '');
    }

    function renderTree() {
      if (!tree || !tree.length) {
        treeEl.innerHTML = '<p class="region-picker-empty">Загрузка дерева...</p>';
        return;
      }
      var html = '';
      for (var i = 0; i < tree.length; i++) {
        html += renderNode(tree[i], 0, true);
      }
      if (!html) html = '<p class="region-picker-empty">Нет совпадений</p>';
      treeEl.innerHTML = html;

      // Bind refs and events
      treeEl.querySelectorAll('.region-picker-cb').forEach(function (cb) {
        var id = cb.getAttribute('data-id');
        var node = findNodeById(tree, id);
        if (node) node._checkbox = cb;
        if (node && node.children && node.children.length) {
          var total = countSelectedInChildren(node, selectedSet);
          var totalDesc = countDescendants(node);
          if (total > 0 && total < totalDesc) cb.indeterminate = true;
        }
        cb.addEventListener('change', function () {
          setNodeAndChildren(id, this.checked);
          updateCountsAndIndeterminate();
          renderTree();
        });
      });
      treeEl.querySelectorAll('.region-picker-expand').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = this.getAttribute('data-id');
          var row = this.closest('.region-picker-row');
          var children = row && row.nextElementSibling;
          if (children && children.classList.contains('region-picker-children')) {
            children.classList.toggle('region-picker-children-open');
            this.classList.toggle('expanded');
            this.setAttribute('aria-expanded', this.classList.contains('expanded'));
          }
        });
      });
    }

    function findNodeById(nodes, id) {
      if (!nodes) return null;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].id === id) return nodes[i];
        var found = findNodeById(nodes[i].children, id);
        if (found) return found;
      }
      return null;
    }

    function setNodeAndChildren(nodeId, checked) {
      var node = findNodeById(tree, nodeId);
      if (!node) return;
      if (checked) selectedSet.add(nodeId);
      else selectedSet.delete(nodeId);
      if (node.children) {
        for (var i = 0; i < node.children.length; i++) {
          setNodeAndChildren(node.children[i].id, checked);
        }
      }
    }

    function updateCountsAndIndeterminate() {
      if (!tree) return;
      for (var i = 0; i < tree.length; i++) {
        syncParentFromChildren(tree[i], selectedSet);
      }
    }

    function loadInitialAndShow() {
      var promise = Promise.resolve();
      if (offerId && initialLocationIds.length === 0) {
        promise = (typeof window.RealCPA !== 'undefined' && window.RealCPA.getOfferLocations
          ? window.RealCPA.getOfferLocations(offerId)
          : fetch((window.RealCPA && window.RealCPA.getBase ? window.RealCPA.getBase() : '') + '/api/offers/' + encodeURIComponent(offerId) + '/locations', { credentials: 'include', headers: { Authorization: 'Bearer ' + (window.RealCPA && window.RealCPA.getToken ? window.RealCPA.getToken() : '') } }).then(function (r) { return r.json(); })
        ).then(function (list) {
          initialLocationIds = (list || []).map(function (l) { return l.id; });
          selectedSet = new Set(initialLocationIds);
        }).catch(function () {});
      } else if (initialLocationIds.length > 0) {
        selectedSet = new Set(initialLocationIds);
      }
      promise.then(function () {
        updateCountsAndIndeterminate();
        renderTree();
        overlay.classList.add('region-picker-open');
        if (searchInput) searchInput.value = '';
        searchQuery = '';
        if (searchInput) searchInput.focus();
      });
    }

    (typeof window.RealCPA !== 'undefined' && window.RealCPA.getLocationsTree
      ? window.RealCPA.getLocationsTree()
      : fetch((window.RealCPA && window.RealCPA.getBase ? window.RealCPA.getBase() : '') + '/api/locations/tree', { credentials: 'include' }).then(function (r) { return r.json(); })
    ).then(function (data) {
      tree = Array.isArray(data) ? data : [];
      loadInitialAndShow();
    }).catch(function (err) {
      treeEl.innerHTML = '<p class="region-picker-empty">Ошибка загрузки: ' + escapeHtml(err.message || 'сеть') + '</p>';
      overlay.classList.add('region-picker-open');
    });

    if (searchInput) {
      searchInput.oninput = function () {
        searchQuery = this.value;
        renderTree();
      };
    }

    confirmBtn.onclick = function () {
      var ids = getSelectedIdsFromSet();
      onConfirm(ids);
      overlay.classList.remove('region-picker-open');
    };
  }

  if (typeof window.RealCPA !== 'undefined') {
    window.RealCPA.openRegionPicker = openRegionPicker;
  } else {
    window.RealCPA = { openRegionPicker: openRegionPicker };
  }
})();
