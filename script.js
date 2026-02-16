// Навигация: гости — «Войти», «Регистрация»; авторизованные — блок пользователя с дропдауном (Профиль, Настройки, Выйти)
document.addEventListener('DOMContentLoaded', function() {
    var guestBlocks = document.querySelectorAll('.nav-auth-guest');
    var userBlocks = document.querySelectorAll('.nav-auth-user');
    var nameSpans = document.querySelectorAll('.nav-user-name');
    var shortNameEls = document.querySelectorAll('.nav-user-short, #navUserShortName');
    var roleBadges = document.querySelectorAll('.nav-role-badge, #navRoleBadge');
    var logoutBtns = document.querySelectorAll('.nav-logout-btn');
    var isLoggedIn = typeof window.RealCPA !== 'undefined' && window.RealCPA.isLoggedIn();

    if (isLoggedIn) {
        var user = window.RealCPA.getUser();
        var role = typeof window.RealCPA.getRole === 'function' ? window.RealCPA.getRole() : '';
        var displayName = (user && (user.name || user.email)) || '';
        var profileHref = role === 'supplier' ? 'dashboard-supplier.html' : 'dashboard-affiliate.html';
        guestBlocks.forEach(function(el) { el.style.display = 'none'; });
        userBlocks.forEach(function(el) { el.style.display = 'inline-flex'; });
        nameSpans.forEach(function(el) { el.textContent = displayName; });
        shortNameEls.forEach(function(el) { el.textContent = displayName; });
        roleBadges.forEach(function(el) {
            el.textContent = role === 'admin' ? 'Админ' : (role === 'supplier' ? 'Поставщик' : 'Аффилиат');
            el.className = 'user-role-badge nav-role-badge ' + (role || '');
        });
        // Профиль и Настройки ведут в кабинет (дашборд) по роли
        document.querySelectorAll('.user-dropdown-profile, .user-dropdown-item[href="dashboard.html"]').forEach(function(a) { a.href = profileHref; a.classList.add('user-dropdown-profile'); });
        document.querySelectorAll('.user-dropdown-settings').forEach(function(a) { if (a.tagName === 'A') a.href = 'profile.html'; });
        if (role === 'admin') document.body.classList.add('role-admin');
        else document.body.classList.remove('role-admin');
        document.querySelectorAll('.sidebar-auth-only').forEach(function(s) { s.style.display = ''; });

        // Для поставщика скрыть пункт «Кабинет партнёра» в верхнем меню
        if (role === 'supplier') {
            document.querySelectorAll('.header .nav a[href="dashboard-affiliate.html"]').forEach(function(el) { el.style.display = 'none'; });
        }
        // Для аффилиата скрыть пункт «Кабинет поставщика» в верхнем меню
        if (role === 'affiliate') {
            document.querySelectorAll('.header .nav a[href="dashboard-supplier.html"]').forEach(function(el) { el.style.display = 'none'; });
        }

        // Кабинет аффилиата: верхнее меню заменить на Главная / Каталог офферов, остальное — внизу
        if (role === 'affiliate' && document.querySelector('.dashboard-layout')) {
            document.body.classList.add('affiliate-cabinet');
            var headerNav = document.querySelector('.header .nav');
            var headerNavLinks = document.querySelectorAll('.header .nav > a');
            headerNavLinks.forEach(function(el) { el.style.display = 'none'; });
            if (headerNav && !document.querySelector('.affiliate-top-nav-links')) {
                var topLinks = document.createElement('span');
                topLinks.className = 'affiliate-top-nav-links';
                topLinks.innerHTML = '<a href="dashboard-affiliate.html" class="nav-link">Главная</a><a href="offers.html" class="nav-link">Каталог офферов</a>';
                headerNav.insertBefore(topLinks, headerNav.firstChild);
            }
            var footer = document.querySelector('footer.footer');
            if (footer && !document.querySelector('.affiliate-bottom-nav')) {
                var bottomNav = document.createElement('div');
                bottomNav.className = 'affiliate-bottom-nav';
                bottomNav.innerHTML = '<div class="container"><nav class="affiliate-nav-links"><a href="dashboard-affiliate.html">Главная</a><a href="offers.html">Каталог офферов</a><a href="about.html">О компании</a><a href="contacts.html">Контакты</a></nav></div>';
                footer.parentNode.insertBefore(bottomNav, footer);
            }
        }
    } else {
        guestBlocks.forEach(function(el) { el.style.display = 'inline-flex'; });
        userBlocks.forEach(function(el) { el.style.display = 'none'; });
        document.body.classList.remove('role-admin');
        document.querySelectorAll('.sidebar-auth-only').forEach(function(s) { s.style.display = 'none'; });
    }

    logoutBtns.forEach(function(btn) {
        btn.addEventListener('click', function(e) { e.preventDefault(); if (typeof window.RealCPA !== 'undefined') window.RealCPA.clearAuth(); window.location.href = 'index.html'; });
    });

    // Дропдаун пользователя в хедере
    var trigger = document.getElementById('userBlockDropdownTrigger');
    var dropdown = document.getElementById('userDropdown');
    if (trigger && dropdown) {
        function closeDropdown() { dropdown.classList.remove('is-open'); trigger.setAttribute('aria-expanded', 'false'); }
        function openDropdown() { dropdown.classList.add('is-open'); trigger.setAttribute('aria-expanded', 'true'); }
        trigger.addEventListener('click', function(e) { e.stopPropagation(); if (dropdown.classList.contains('is-open')) closeDropdown(); else openDropdown(); });
        trigger.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); } });
        document.addEventListener('click', function(e) { if (!trigger.contains(e.target) && !dropdown.contains(e.target)) closeDropdown(); });
        var logoutItem = dropdown.querySelector('.user-dropdown-logout');
        if (logoutItem) logoutItem.addEventListener('click', function(e) { e.preventDefault(); if (typeof window.RealCPA !== 'undefined') window.RealCPA.clearAuth(); window.location.href = 'index.html'; });
        var settingsItem = dropdown.querySelector('.user-dropdown-settings');
        if (settingsItem && settingsItem.tagName === 'A') settingsItem.addEventListener('click', function() { closeDropdown(); });
    }

    // Колокольчик уведомлений (только для авторизованных)
    if (isLoggedIn && typeof window.RealCPA !== 'undefined' && window.RealCPA.getNotifications) {
        var navUser = document.querySelector('.nav-auth-user');
        if (navUser && !navUser.querySelector('.notifications-bell-wrap')) {
            var bellWrap = document.createElement('div');
            bellWrap.className = 'notifications-bell-wrap';
            bellWrap.innerHTML = '<button type="button" class="notifications-bell" id="notificationsBellBtn" aria-label="Уведомления" aria-haspopup="true"><i class="fas fa-bell"></i><span class="notifications-badge empty" id="notificationsBadge">0</span></button><div class="notifications-dropdown" id="notificationsDropdown" aria-hidden="true"><div class="notifications-dropdown-header">Уведомления</div><div class="notifications-dropdown-body" id="notificationsDropdownBody"></div><div class="notifications-dropdown-footer"><button type="button" class="btn-link" id="notificationsMarkAllRead">Отметить все прочитанными</button></div></div>';
            navUser.insertBefore(bellWrap, navUser.firstChild);

            var bellBtn = document.getElementById('notificationsBellBtn');
            var notifDropdown = document.getElementById('notificationsDropdown');
            var notifBody = document.getElementById('notificationsDropdownBody');
            var notifBadge = document.getElementById('notificationsBadge');
            var markAllReadBtn = document.getElementById('notificationsMarkAllRead');

            function formatNotificationTime(dateStr) {
                var d = new Date(dateStr);
                var now = new Date();
                var diff = (now - d) / 60000;
                if (diff < 1) return 'только что';
                if (diff < 60) return Math.floor(diff) + ' мин назад';
                if (diff < 1440) return Math.floor(diff / 60) + ' ч назад';
                if (diff < 43200) return Math.floor(diff / 1440) + ' дн назад';
                return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
            }

            function renderNotifications(items) {
                if (!notifBody) return;
                if (!items || items.length === 0) {
                    notifBody.innerHTML = '<div class="notifications-empty">Нет уведомлений</div>';
                    return;
                }
                notifBody.innerHTML = items.map(function(n) {
                    var cls = n.readAt ? '' : ' unread';
                    var href = n.link ? ('href="' + n.link + '"') : '';
                    var tag = n.link ? 'a' : 'div';
                    return '<' + tag + ' class="notification-item' + cls + '" data-id="' + n.id + '" ' + href + '><div class="notification-title">' + (n.title || '') + '</div>' + (n.body ? '<div class="notification-body">' + n.body + '</div>' : '') + '<div class="notification-time">' + formatNotificationTime(n.createdAt) + '</div></' + tag + '>';
                }).join('');
                notifBody.querySelectorAll('.notification-item').forEach(function(el) {
                    el.addEventListener('click', function(e) {
                        var id = el.getAttribute('data-id');
                        if (id && window.RealCPA.markNotificationRead) window.RealCPA.markNotificationRead(id).catch(function() {});
                    });
                });
            }

            function loadNotificationsAndBadge() {
                window.RealCPA.getNotifications({ limit: 15 }).then(function(r) {
                    if (notifBadge) {
                        var c = r.unreadCount || 0;
                        notifBadge.textContent = c > 99 ? '99+' : c;
                        notifBadge.classList.toggle('empty', c === 0);
                    }
                    renderNotifications(r.items || []);
                }).catch(function() {
                    if (notifBadge) { notifBadge.classList.add('empty'); }
                    renderNotifications([]);
                });
            }

            loadNotificationsAndBadge();
            if (bellBtn && notifDropdown) {
                bellBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    notifDropdown.classList.toggle('is-open');
                    bellBtn.setAttribute('aria-expanded', notifDropdown.classList.contains('is-open'));
                    if (notifDropdown.classList.contains('is-open')) loadNotificationsAndBadge();
                });
                document.addEventListener('click', function(e) {
                    if (!bellWrap.contains(e.target)) notifDropdown.classList.remove('is-open');
                });
            }
            if (markAllReadBtn && notifDropdown) {
                markAllReadBtn.addEventListener('click', function() {
                    window.RealCPA.markAllNotificationsRead().then(function() { loadNotificationsAndBadge(); }).catch(function() {});
                });
            }
        }
    }
});

// Мобильное меню и языки
document.addEventListener('DOMContentLoaded', function() {
    const mobileMenuToggle = document.getElementById('mobileMenuToggle');
    const sidebar = document.querySelector('.sidebar');
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function() {
            if (sidebar) {
                sidebar.classList.toggle('active');
            }
        });
    }

    // Закрытие мобильного меню при клике вне его
    document.addEventListener('click', function(event) {
        if (sidebar && sidebar.classList.contains('active')) {
            if (!sidebar.contains(event.target) && !mobileMenuToggle.contains(event.target)) {
                sidebar.classList.remove('active');
            }
        }
    });

});

// Переключение вкладок входа/регистрации
document.addEventListener('DOMContentLoaded', function() {
    const authTabs = document.querySelectorAll('.auth-tab');
    const authForms = document.querySelectorAll('.auth-form');

    authTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // Убираем активный класс со всех вкладок и форм
            authTabs.forEach(t => t.classList.remove('active'));
            authForms.forEach(f => f.classList.remove('active'));
            
            // Добавляем активный класс к выбранной вкладке и форме
            this.classList.add('active');
            document.getElementById(targetTab + 'Form').classList.add('active');
        });
    });

    // Показ/скрытие полей в зависимости от роли
    const registerRole = document.getElementById('registerRole');
    const supplierFields = document.querySelectorAll('.supplier-fields');
    const affiliateFields = document.querySelectorAll('.affiliate-fields');

    function updateRoleFields(role) {
        if (!supplierFields.length && !affiliateFields.length) return;

        if (role === 'supplier') {
            supplierFields.forEach(field => field.style.display = 'block');
            affiliateFields.forEach(field => field.style.display = 'none');
        } else if (role === 'affiliate') {
            supplierFields.forEach(field => field.style.display = 'none');
            affiliateFields.forEach(field => field.style.display = 'block');
        } else {
            supplierFields.forEach(field => field.style.display = 'none');
            affiliateFields.forEach(field => field.style.display = 'none');
        }
    }

    if (registerRole) {
        registerRole.addEventListener('change', function() {
            const role = this.value;
            updateRoleFields(role);
        });
    }

    // Карточки выбора роли
    const roleButtons = document.querySelectorAll('.role-btn');
    if (roleButtons.length && registerRole) {
        roleButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                roleButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const role = btn.dataset.role;
                registerRole.value = role;
                updateRoleFields(role);
            });
        });

        // Роль по умолчанию — affiliate
        registerRole.value = 'affiliate';
        updateRoleFields('affiliate');
    }

    // Обработка формы входа (через API)
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var emailEl = document.getElementById('loginEmail');
            var passEl = document.getElementById('loginPassword');
            var email = emailEl ? emailEl.value.trim() : '';
            var pass = passEl ? passEl.value : '';
            if (!email || !pass) {
                alert('Введите email и пароль');
                return;
            }
            if (typeof window.RealCPA === 'undefined') {
                alert('Подключите api.js и укажите REALCPA_API_URL при необходимости');
                return;
            }
            window.RealCPA.auth.login(email, pass)
                .then(function() {
                    var user = window.RealCPA.getUser();
                    var redirect = (new URLSearchParams(window.location.search)).get('redirect');
                    if (redirect) {
                        window.location.href = redirect;
                    } else if (user && user.role === 'supplier') {
                        window.location.href = 'dashboard-supplier.html';
                    } else {
                        window.location.href = 'dashboard-affiliate.html';
                    }
                })
                .catch(function(err) {
                    alert(err.message || err.payload?.error || 'Ошибка входа');
                });
        });
    }

    // Обработка формы регистрации (через API)
    const registerForm = document.getElementById('registerFormElement');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const roleSelect = document.getElementById('registerRole');
            const role = roleSelect ? roleSelect.value || 'affiliate' : 'affiliate';
            var email = (document.getElementById('registerEmail') || {}).value || '';
            var password = (document.getElementById('registerPassword') || {}).value || '';
            var name = (document.getElementById('registerName') || {}).value || '';
            if (!email || !password) {
                alert('Введите email и пароль');
                return;
            }
            if (typeof window.RealCPA === 'undefined') {
                alert('Подключите api.js');
                return;
            }
            var data = { email: email.trim(), password: password, role: role, name: name || undefined };
            if (role === 'supplier') {
                data.companyName = (document.getElementById('companyName') || {}).value || undefined;
                data.legalEntity = data.companyName;
                data.inn = (document.getElementById('inn') || {}).value || undefined;
            } else {
                data.trafficSources = (document.getElementById('trafficSource') || {}).value || undefined;
            }
            window.RealCPA.auth.register(data)
                .then(function() {
                    var user = window.RealCPA.getUser();
                    if (user && user.role === 'supplier') {
                        window.location.href = 'dashboard-supplier.html';
                    } else {
                        window.location.href = 'dashboard-affiliate.html';
                    }
                })
                .catch(function(err) {
                    alert(err.message || err.payload?.error || 'Ошибка регистрации');
                });
        });
    }
});

// Графики для дашборда (демо)
document.addEventListener('DOMContentLoaded', function() {
    if (typeof Chart === 'undefined') return;
    const earningsChartCanvas = document.getElementById('earningsChart');
    if (earningsChartCanvas) {
        const ctx = earningsChartCanvas.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'],
                datasets: [{
                    label: 'Доходы (₽)',
                    data: [2400, 3100, 2800, 4500, 5200, 3800, 4100],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: true } },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }
});

// Графики для аналитики (демо-данные)
document.addEventListener('DOMContentLoaded', function() {
    if (typeof Chart === 'undefined') return;

    // Конверсии по офферам — столбчатая диаграмма
    const conversionsChartCanvas = document.getElementById('conversionsChart');
    if (conversionsChartCanvas) {
        const ctx = conversionsChartCanvas.getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Стройматериалы оптом', 'Продукты питания', 'Автозапчасти', 'Оборудование', 'Упаковка'],
                datasets: [{
                    label: 'Конверсия (%)',
                    data: [4.2, 3.8, 5.1, 2.9, 3.5],
                    backgroundColor: ['#2563eb', '#0ea5e9', '#06b6d4', '#6366f1', '#8b5cf6']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 6,
                        ticks: { callback: function(v) { return v + '%'; } }
                    }
                }
            }
        });
    }

    // Источники трафика — круговая диаграмма
    const trafficChartCanvas = document.getElementById('trafficChart');
    if (trafficChartCanvas) {
        const ctx = trafficChartCanvas.getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Контекстная реклама', 'Telegram / соцсети', 'SEO / сайт', 'Партнёрские площадки', 'Почтовая рассылка'],
                datasets: [{
                    data: [35, 28, 22, 10, 5],
                    backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#64748b']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
    }

    // Динамика доходов — линейный график
    const incomeChartCanvas = document.getElementById('incomeChart');
    if (incomeChartCanvas) {
        const ctx = incomeChartCanvas.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'],
                datasets: [{
                    label: 'Доход (₽)',
                    data: [12000, 18500, 22000, 19500, 31000, 28000, 35000, 42000, 38000, 45000, 52000, 48000],
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: function(v) { return v >= 1000 ? (v/1000) + 'k' : v; } }
                    }
                }
            }
        });
    }

    // Качество лидов — кольцевая диаграмма
    const leadsChartCanvas = document.getElementById('leadsChart');
    if (leadsChartCanvas) {
        const ctx = leadsChartCanvas.getContext('2d');
        new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Качественные (заказ оформлен)', 'Средние (в работе)', 'Низкие (отказ)'],
                datasets: [{
                    data: [62, 25, 13],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
    }
});

// Модалка «Детали оффера» — контент строится из объекта оффера (API), без хардкода
function buildOfferDetailsContent(offer) {
    if (!offer) return '';
    var cat = (offer.category && offer.category.name) ? offer.category.name : '—';
    var geo = offer.targetGeo || '—';
    var rate = offer.payoutAmount != null ? offer.payoutAmount + ' ' + (offer.currency || 'RUB') : '—';
    var model = (offer.payoutModel || 'CPA').toString();
    var desc = (offer.description || '').trim();
    var parts = [];
    if (desc) parts.push('<p><strong>Описание:</strong></p><p>' + escapeHtmlForModal(desc) + '</p>');
    parts.push('<p><strong>Условия:</strong></p><ul>' +
        '<li>Модель: ' + escapeHtmlForModal(model) + '</li>' +
        '<li>Ставка: ' + escapeHtmlForModal(String(rate)) + '</li>' +
        '<li>Гео: ' + escapeHtmlForModal(geo) + '</li>' +
        '<li>Категория: ' + escapeHtmlForModal(cat) + '</li>' +
        (offer.holdDays != null ? '<li>Холдинг: ' + escapeHtmlForModal(String(offer.holdDays)) + ' дн.</li>' : '') +
        (offer.capAmount != null ? '<li>Лимит бюджета: ' + escapeHtmlForModal(String(offer.capAmount)) + ' ₽</li>' : '') +
        (offer.capConversions != null ? '<li>Лимит конверсий: ' + escapeHtmlForModal(String(offer.capConversions)) + '</li>' : '') +
        '</ul>');
    if (offer.rules && String(offer.rules).trim()) parts.push('<p><strong>Правила:</strong></p><p>' + escapeHtmlForModal(offer.rules) + '</p>');
    if (offer.landingUrl) parts.push('<p><strong>Лендинг:</strong> <a href="' + escapeHtmlForModal(offer.landingUrl) + '" target="_blank" rel="noopener">' + escapeHtmlForModal(offer.landingUrl) + '</a></p>');
    parts.push('<p>Трекинг-ссылка выдаётся после одобрения заявки на подключение.</p>');
    return parts.join('');
}
function escapeHtmlForModal(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = String(s);
    return div.innerHTML;
}

function openOfferDetails(offer) {
    var modal = document.getElementById('offerModal');
    var titleEl = document.getElementById('modalOfferTitle');
    var contentEl = document.getElementById('modalOfferContent');
    if (!modal) return;
    window.__currentOfferForModal = offer || null;
    if (titleEl) titleEl.textContent = (offer && offer.title) ? offer.title : 'Детали оффера';
    if (contentEl) contentEl.innerHTML = (offer && offer.id) ? buildOfferDetailsContent(offer) : '<p>Трекинг-ссылка будет доступна после подключения к офферу.</p><p><strong>Правила:</strong></p><ul><li>Оплата за подтверждённые заказы</li><li>Минимальная сумма вывода: 1000 ₽</li><li>Выплаты еженедельно</li></ul>';
    modal.classList.add('active');
}

// Клик по кнопке «Детали» в карточке оффера: ищем оффер в списке с API и открываем модалку
document.addEventListener('click', function(e) {
    var btn = e.target && e.target.closest && e.target.closest('[data-open-offer-details]');
    if (!btn || !window.__lastOffersList) return;
    var id = btn.getAttribute('data-offer-id');
    if (!id) return;
    var offer = window.__lastOffersList.find(function(o) { return o.id === id; });
    if (offer) openOfferDetails(offer);
});

function closeOfferDetails() {
    const modal = document.getElementById('offerModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Закрытие модального окна при клике вне его
document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
});

// Подключение к офферу (из модалки, используем оффер из openOfferDetails)
function connectToOffer() {
    var offer = window.__currentOfferForModal;
    if (!offer || !offer.id) {
        alert('Сначала выберите оффер и откройте детали.');
        return;
    }
    if (typeof window.RealCPA === 'undefined' || !window.RealCPA.affiliate || !window.RealCPA.affiliate.joinOffer) {
        alert('Подключите api.js и войдите как партнёр.');
        closeOfferDetails();
        return;
    }
    if (!window.RealCPA.isLoggedIn() || window.RealCPA.getRole() !== 'affiliate') {
        alert('Войдите в кабинет партнёра, чтобы подключиться к офферу.');
        closeOfferDetails();
        return;
    }
    window.RealCPA.affiliate.joinOffer(offer.id)
        .then(function() {
            closeOfferDetails();
            alert('Заявка на подключение отправлена. После одобрения поставщиком трекинг-ссылка появится в разделе «Мои подключения».');
            if (window.location.pathname.indexOf('offers.html') !== -1) window.location.reload();
        })
        .catch(function(err) {
            alert(err.message || err.payload?.error || 'Ошибка при отправке заявки');
        });
}

// Вывод средств
document.addEventListener('DOMContentLoaded', function() {
    const withdrawBtn = document.getElementById('withdrawBtn');
    const withdrawModal = document.getElementById('withdrawModal');
    
    if (withdrawBtn && withdrawModal) {
        withdrawBtn.addEventListener('click', function() {
            withdrawModal.classList.add('active');
        });
    }

    // Обработка формы вывода — на странице payments.html (API)
});

// FAQ обрабатывается только inline-скриптом на странице support.html (избегаем двойного срабатывания)

function toggleFaq(element) {
    if (!element || !element.parentElement) return;
    var faqItem = element.parentElement;
    var isActive = faqItem.classList.contains('active');
    document.querySelectorAll('.faq-item').forEach(function(item) {
        item.classList.remove('active');
    });
    if (!isActive) faqItem.classList.add('active');
}

// Поиск по FAQ
document.addEventListener('DOMContentLoaded', function() {
    const faqSearch = document.getElementById('faqSearch');
    if (faqSearch) {
        faqSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const faqItems = document.querySelectorAll('.faq-item');
            
            faqItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    item.style.display = 'block';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }
});

// Чат-бот
function openChatbot() {
    const chatbotWindow = document.getElementById('chatbotWindow');
    if (chatbotWindow) {
        chatbotWindow.classList.add('active');
    }
}

function closeChatbot() {
    const chatbotWindow = document.getElementById('chatbotWindow');
    if (chatbotWindow) {
        chatbotWindow.classList.remove('active');
    }
}

function sendChatbotMessage() {
    const input = document.getElementById('chatbotInput');
    const messages = document.getElementById('chatbotMessages');
    
    if (input && input.value.trim() && messages) {
        // Добавляем сообщение пользователя
        const userMessage = document.createElement('div');
        userMessage.className = 'chatbot-message user';
        userMessage.innerHTML = '<p>' + input.value + '</p>';
        messages.appendChild(userMessage);
        
        // Очищаем поле ввода
        const message = input.value;
        input.value = '';
        
        // Имитация ответа бота
        setTimeout(() => {
            const botMessage = document.createElement('div');
            botMessage.className = 'chatbot-message bot';
            botMessage.innerHTML = '<p>Спасибо за ваше сообщение! Наш специалист свяжется с вами в ближайшее время.</p>';
            messages.appendChild(botMessage);
            messages.scrollTop = messages.scrollHeight;
        }, 1000);
        
        messages.scrollTop = messages.scrollHeight;
    }
}

// Отправка сообщения в чат-бот по Enter
document.addEventListener('DOMContentLoaded', function() {
    const chatbotInput = document.getElementById('chatbotInput');
    if (chatbotInput) {
        chatbotInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendChatbotMessage();
            }
        });
    }
});

// Обработка формы обратной связи
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Ваше сообщение отправлено! Мы свяжемся с вами в ближайшее время.');
            this.reset();
        });
    }
});

// Поиск офферов
document.addEventListener('DOMContentLoaded', function() {
    const offerSearch = document.getElementById('offerSearch');
    if (offerSearch) {
        offerSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const offerCards = document.querySelectorAll('.offer-card');
            
            offerCards.forEach(card => {
                const text = card.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }
});

// Фильтрация офферов
document.addEventListener('DOMContentLoaded', function() {
    const categoryFilter = document.getElementById('categoryFilter');
    const regionFilter = document.getElementById('regionFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    function applyFilters() {
        const category = categoryFilter ? categoryFilter.value : '';
        const region = regionFilter ? regionFilter.value : '';
        const offerCards = document.querySelectorAll('.offer-card');
        
        offerCards.forEach(card => {
            let show = true;
            
            if (category) {
                const cardCategory = card.querySelector('.offer-category').textContent.toLowerCase();
                const categoryMap = {
                    'products': 'продукты питания',
                    'construction': 'стройматериалы',
                    'auto': 'автозапчасти',
                    'electronics': 'электроника',
                    'clothing': 'одежда',
                    'other': 'другое'
                };
                const match = categoryMap[category] && cardCategory.includes(categoryMap[category]);
                if (!match) show = false;
            }
            
            if (show) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
    }
    
    if (categoryFilter) categoryFilter.addEventListener('change', applyFilters);
    if (regionFilter) regionFilter.addEventListener('change', applyFilters);
    if (sortFilter) sortFilter.addEventListener('change', applyFilters);
});

// Кнопка «Создать оффер» ведёт на create-offer.html

// Анимация при скролле (все страницы)
document.addEventListener('DOMContentLoaded', function() {
    var els = document.querySelectorAll('.animate-on-scroll');
    if (!els.length) return;
    var observer = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    els.forEach(function(el) { observer.observe(el); });
});

// Счётчик инфографики (только на главной)
document.addEventListener('DOMContentLoaded', function() {
    var numbers = document.querySelectorAll('.infographic-number[data-count]');
    if (!numbers.length) return;
    function countUp(el, target) {
        var from = 0;
        var step = Math.max(1, target / 35);
        var stepTime = 40;
        var timer = setInterval(function() {
            from += step;
            if (from >= target) {
                el.textContent = target;
                clearInterval(timer);
            } else {
                el.textContent = Math.floor(from);
            }
        }, stepTime);
    }
    numbers.forEach(function(el) {
        var target = parseInt(el.getAttribute('data-count'), 10);
        if (!target) return;
        var observer = new IntersectionObserver(function(entries) {
            if (entries[0].isIntersecting) {
                countUp(el, target);
                observer.disconnect();
            }
        }, { threshold: 0.5 });
        observer.observe(el.closest('.infographic-item'));
    });
});