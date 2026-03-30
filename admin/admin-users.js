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
                tbody.innerHTML = '<tr><td colspan="7">Нет пользователей</td></tr>';
                return;
            }
            var roleLabels = { affiliate: 'Аффилиат', supplier: 'Поставщик', admin: 'Admin' };
            var statusLabels = { active: 'Активен', blocked: 'Заблокирован', pending_email_confirmation: 'Ожидает подтверждения' };
            tbody.innerHTML = list.map(function(user) {
                var created = user.createdAt ? new Date(user.createdAt).toLocaleDateString('ru') : '—';
                var statusCl = user.status === 'active' ? 'admin-badge-active' : 'admin-badge-blocked';
                var disableReset = user.role === 'admin';
                var btnTitle = disableReset ? 'Для админов сброс отключён' : 'Сбросить пароль и отправить временный пароль на email';
                var actionHtml = '<button type="button" class="btn btn-sm btn-outline user-reset-pass-btn" data-user-id="' + user.id + '" data-user-email="' + (user.email || '') + '" ' + (disableReset ? 'disabled' : '') + ' title="' + btnTitle + '">Сбросить пароль</button> ' +
                    '<button type="button" class="btn btn-sm btn-secondary user-delete-btn" data-user-id="' + user.id + '" data-user-email="' + (user.email || '') + '" ' + (disableReset ? 'disabled' : '') + ' title="' + (disableReset ? 'Удаление админов запрещено' : 'Удалить аккаунт и связанные данные') + '">Удалить</button>';
                return '<tr><td>' + (user.id || '').slice(0, 8) + '</td><td>' + (user.name || '—') + '</td><td>' + (user.email || '') + '</td><td><span class="admin-badge">' + (roleLabels[user.role] || user.role) + '</span></td><td><span class="admin-badge ' + statusCl + '">' + (statusLabels[user.status] || user.status) + '</span></td><td>' + created + '</td><td>' + actionHtml + '</td></tr>';
            }).join('');
            bindResetButtons();
            bindDeleteButtons();
        }).catch(function(err) {
            document.getElementById('usersTableBody').innerHTML = '<tr><td colspan="7">Ошибка: ' + (err.message || '') + '</td></tr>';
        });
    }
    function bindDeleteButtons() {
        var buttons = document.querySelectorAll('.user-delete-btn');
        buttons.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var userId = btn.getAttribute('data-user-id');
                var userEmail = btn.getAttribute('data-user-email') || '';
                if (!userId) return;
                var confirmText = window.prompt('Для подтверждения удаления введите email пользователя:\n' + userEmail, '');
                if (confirmText === null) return;
                if (String(confirmText).trim().toLowerCase() !== String(userEmail).trim().toLowerCase()) {
                    alert('Email не совпадает. Удаление отменено.');
                    return;
                }
                var oldText = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Удаление...';
                window.RealCPA.admin.deleteUser(userId).then(function(resp) {
                    alert((resp && resp.message) ? resp.message : 'Пользователь удалён.');
                    load();
                }).catch(function(err) {
                    alert('Ошибка удаления: ' + (err.message || 'неизвестная ошибка'));
                }).finally(function() {
                    btn.disabled = false;
                    btn.textContent = oldText || 'Удалить';
                });
            });
        });
    }

    function bindResetButtons() {
        var buttons = document.querySelectorAll('.user-reset-pass-btn');
        buttons.forEach(function(btn) {
            btn.addEventListener('click', function() {
                var userId = btn.getAttribute('data-user-id');
                var userEmail = btn.getAttribute('data-user-email') || '';
                if (!userId) return;
                var ok = window.confirm('Сбросить пароль для ' + userEmail + '?\nПользователю будет отправлен временный пароль.');
                if (!ok) return;
                var oldText = btn.textContent;
                btn.disabled = true;
                btn.textContent = 'Сброс...';
                window.RealCPA.admin.resetUserPassword(userId).then(function(resp) {
                    window.alert((resp && resp.message) ? resp.message : 'Пароль сброшен.');
                }).catch(function(err) {
                    window.alert('Ошибка сброса пароля: ' + (err.message || 'неизвестная ошибка'));
                }).finally(function() {
                    btn.disabled = false;
                    btn.textContent = oldText || 'Сбросить пароль';
                });
            });
        });
    }
    document.getElementById('userApplyFilters').addEventListener('click', load);
    load();
})();
