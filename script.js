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

    // Переключатель языков (заглушка для будущего i18n)
    const langButtons = document.querySelectorAll('.lang-btn');
    langButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            langButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const lang = btn.dataset.lang;
            if (lang === 'en') {
                alert('Переключение языка и локализация интерфейса будут реализованы на этапе бэкенда / i18n.');
            }
        });
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

// Подробные описания офферов для модалки «Детали»
var offerDetails = {
    1: {
        title: 'Оффер: Стройматериалы оптом',
        content: '<p><strong>Кратко:</strong> Оплата 500 ₽ за подтверждённый оптовый заказ строительных материалов по всей РФ.</p>' +
            '<p><strong>Полное описание:</strong> Работаем с оптовыми поставками цемента, сухих смесей, пиломатериалов, кровли, отделочных материалов. Целевая аудитория — строительные компании, бригады, магазины стройматериалов. Минимальный заказ от 30 000 ₽, средний чек 80 000–150 000 ₽. Доставка по РФ, возможен самовывоз со складов в Москве и регионах.</p>' +
            '<p><strong>Условия:</strong></p><ul><li>CPA: 500 ₽ за заказ</li><li>Гео: Вся РФ</li><li>Холдинг: 14 дней</li><li>Разрешены: контекст, SEO, тематические площадки, Telegram B2B</li><li>Запрещены: брендовый контекст, incent</li></ul>' +
            '<p>Трекинг-ссылка и постбек выдаются после одобрения заявки на подключение.</p>'
    },
    2: {
        title: 'Оффер: Продукты питания оптом',
        content: '<p><strong>Кратко:</strong> 300 ₽ за заказ. Оптовые поставки продуктов питания для HoReCa и розницы.</p>' +
            '<p><strong>Полное описание:</strong> Поставки мяса, птицы, овощей, молочной продукции, бакалеи для ресторанов, кафе, магазинов и складов. Работаем по Москве, СПб и области. Минимальный заказ от 15 000 ₽, средний чек 40 000–70 000 ₽. Возможна регулярная доставка по графику.</p>' +
            '<p><strong>Условия:</strong></p><ul><li>CPA: 300 ₽ за заказ</li><li>Гео: Москва, Санкт-Петербург и области</li><li>Холдинг: 7 дней</li><li>Разрешены: контекст, соцсети, холодные звонки с переходом по ссылке</li></ul>' +
            '<p>Трекинг-ссылка будет доступна после подключения к офферу.</p>'
    },
    3: {
        title: 'Оффер: Автозапчасти от AutoPartsRU',
        content: '<p><strong>Кратко:</strong> 400 ₽ за заказ. Широкий ассортимент автозапчастей для всех марок, поставки для СТО и дилеров.</p>' +
            '<p><strong>Полное описание:</strong> Оригинальные и аналоговые запчасти, масла, расходники. Целевая аудитория — автосервисы, магазины автозапчастей, частные мастера. Работаем по всей РФ. Минимальный заказ от 5 000 ₽, средний чек 25 000–50 000 ₽. Быстрая отгрузка со складов в нескольких регионах.</p>' +
            '<p><strong>Условия:</strong></p><ul><li>CPA: 400 ₽ за заказ</li><li>Гео: Вся РФ</li><li>Холдинг: 14 дней</li><li>Разрешены: SEO, контекст, нишевые форумы, Telegram-каналы про авто</li><li>Запрещены: брендовый контекст, накрутка</li></ul>' +
            '<p><strong>Правила:</strong> Оплата только за подтверждённые заказы. Минимальная сумма вывода 1000 ₽. Выплаты еженедельно.</p>'
    }
};

function openOfferDetails(offerId) {
    var modal = document.getElementById('offerModal');
    var titleEl = document.getElementById('modalOfferTitle');
    var contentEl = document.getElementById('modalOfferContent');
    if (!modal) return;
    var details = offerDetails[offerId];
    if (details && titleEl && contentEl) {
        titleEl.textContent = details.title;
        contentEl.innerHTML = details.content;
    } else if (titleEl && contentEl) {
        titleEl.textContent = 'Детали оффера';
        contentEl.innerHTML = '<p>Трекинг-ссылка будет доступна после подключения к офферу.</p><p><strong>Правила:</strong></p><ul><li>Оплата за подтверждённые заказы</li><li>Минимальная сумма вывода: 1000 ₽</li><li>Выплаты еженедельно</li></ul>';
    }
    modal.classList.add('active');
}

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

// Подключение к офферу
function connectToOffer() {
    alert('Подключение к офферу будет реализовано на бэкенде');
    closeOfferDetails();
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

    const withdrawForm = document.getElementById('withdrawForm');
    if (withdrawForm) {
        withdrawForm.addEventListener('submit', function(e) {
            e.preventDefault();
            alert('Запрос на вывод средств будет обработан на бэкенде');
            closeModal('withdrawModal');
        });
    }
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
                    'food': 'продукты питания',
                    'construction': 'стройматериалы',
                    'auto': 'автозапчасти'
                };
                if (!cardCategory.includes(categoryMap[category])) {
                    show = false;
                }
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