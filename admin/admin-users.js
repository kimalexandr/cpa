(function() {
    if (!window.RealCPA || !window.RealCPA.isLoggedIn() || window.RealCPA.getRole() !== 'admin') {
        window.location.href = '../login.html?redirect=' + encodeURIComponent('admin/users.html');
        return;
    }
    var u = window.RealCPA.getUser();
    document.getElementById('adminUserName').textContent = (u && (u.name || u.email)) || 'Админ';
    document.getElementById('adminLogout').addEventListener('click', function(e) {
        e.preventDefault();
        window.RealCPA.clearAuth();
        window.location.href = '../index.html';
    });
    function load() {
        var role = document.getElementById('userRoleFilter').value;
        var status = document.getElementById('userStatusFilter').value;
        var search = document.getElementById('userSearch').value.trim();
        var params = {};
        if (role) params.role = role;
        if (status) params.status = status;
        if (search) params.search = search;
        window.RealCPA.admin.users(params).then(function(list) {
            var tbody = document.getElementById('usersTableBody');
            if (!list.length) {
                tbody.innerHTML = '<tr><td colspan="6">Нет пользователей</td></tr>';
                return;
            }
            var roleLabels = { affiliate: 'Аффилиат', supplier: 'Поставщик', admin: 'Admin' };
            var statusLabels = { active: 'Активен', blocked: 'Заблокирован' };
            tbody.innerHTML = list.map(function(user) {
                var created = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru') : '—';
                var statusCl = user.status === 'active' ? 'admin-badge-active' : 'admin-badge-blocked';
                return '<tr><td>' + (user.id || '').slice(0, 8) + '</td><td>' + (user.name || '—') + '</td><td>' + (user.email || '') + '</td><td><span class="admin-badge">' + (roleLabels[user.role] || user.role) + '</span></td><td><span class="admin-badge ' + statusCl + '">' + (statusLabels[user.status] || user.status) + '</span></td><td>' + created + '</td></tr>';
            }).join('');
        }).catch(function(err) {
            document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="6">Ошибка: ' + (err.message || '') + '</td></tr>';
        });
    }
    document.getElementById('userApplyFilters').addEventListener('click', load);
    load();
})();
