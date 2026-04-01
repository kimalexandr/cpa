/**
 * Клиент API RealCPA Hub.
 * Базовый URL: window.REALCPA_API_URL или относительный (текущий хост) или http://localhost:3000 для локальной разработки
 */
(function () {
  var BASE;
  if (typeof window !== 'undefined' && window.REALCPA_API_URL) {
    BASE = window.REALCPA_API_URL;
  } else if (typeof window !== 'undefined' && window.location && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    BASE = ''; // тот же хост (Nginx проксирует /api/ на бэкенд)
  } else {
    BASE = 'http://localhost:3000';
  }
  var TOKEN_KEY = 'realcpa_access_token';
  var REFRESH_KEY = 'realcpa_refresh_token';
  var USER_KEY = 'realcpa_user';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setTokens(access, refresh) {
    try {
      if (access) localStorage.setItem(TOKEN_KEY, access);
      if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
    } catch (e) {}
  }
  function clearAuth() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) {}
  }
  function setUser(user) {
    try { localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch (e) {}
  }
  function getUser() {
    try {
      var s = localStorage.getItem(USER_KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function request(method, path, body, opts) {
    opts = opts || {};
    var url = BASE + path;
    var headers = { 'Content-Type': 'application/json' };
    var token = opts.token !== undefined ? opts.token : getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (opts.headers) for (var k in opts.headers) headers[k] = opts.headers[k];
    var init = { method: method, headers: headers };
    if (body != null && method !== 'GET') init.body = JSON.stringify(body);
    return fetch(url, init).then(function (res) {
      var contentType = res.headers.get('Content-Type') || '';
      var data = contentType.indexOf('application/json') !== -1 ? res.json() : res.text();
      return data.then(function (payload) {
        if (res.status === 401 && path.indexOf('/auth/') === -1) clearAuth();
        if (!res.ok) {
          var msg = 'Ошибка запроса';
          if (payload && typeof payload === 'object' && payload.error) msg = payload.error;
          if (res.status >= 502 && res.status <= 504) msg = 'Сервер временно недоступен. Попробуйте позже.';
          var err = new Error(msg);
          err.status = res.status;
          err.payload = payload;
          throw err;
        }
        return payload;
      });
    });
  }

  window.RealCPA = {
    getBase: function () { return BASE; },
    getToken: getToken,
    setTokens: setTokens,
    clearAuth: clearAuth,
    setUser: setUser,
    getUser: getUser,
    isLoggedIn: function () { return !!getToken(); },
    getRole: function () { var u = getUser(); return u && u.role ? u.role : null; },
    request: function (path, opts) {
      opts = opts || {};
      var method = opts.method || 'GET';
      return request(method, path, opts.body != null ? opts.body : null, opts);
    },
    statusCenter: function () {
      return request('GET', '/api/status-center');
    },
    onboardingProgress: function () {
      return request('GET', '/api/onboarding/progress');
    },
    integrationsHealth: function () {
      return request('GET', '/api/integrations/health');
    },
    realtimeStreamUrl: function () {
      var token = getToken();
      if (!token) return null;
      return BASE + '/api/realtime/stream?token=' + encodeURIComponent(token);
    },

    auth: {
      login: function (email, password) {
        return request('POST', '/api/auth/login', { email: email, password: password }).then(function (r) {
          setTokens(r.accessToken, r.refreshToken);
          setUser(r.user);
          return r;
        });
      },
      register: function (data) {
        return request('POST', '/api/auth/register', data).then(function (r) {
          if (r && r.accessToken && r.refreshToken && r.user) {
            setTokens(r.accessToken, r.refreshToken);
            setUser(r.user);
          }
          return r;
        });
      },
      logout: function () {
        clearAuth();
        return Promise.resolve();
      },
      refresh: function () {
        var refresh = null;
        try { refresh = localStorage.getItem(REFRESH_KEY); } catch (e) {}
        if (!refresh) return Promise.reject(new Error('Нет refresh-токена'));
        return request('POST', '/api/auth/refresh', { refreshToken: refresh }).then(function (r) {
          setTokens(r.accessToken, r.refreshToken || null);
          return r.accessToken;
        });
      },
      forgotPassword: function (email) {
        return request('POST', '/api/auth/forgot-password', { email: email });
      },
      resetPassword: function (token, newPassword) {
        return request('POST', '/api/auth/reset-password', { token: token, newPassword: newPassword });
      },
      confirmEmail: function (token) {
        return request('POST', '/api/auth/confirm-email', { token: token });
      },
      resendConfirmation: function (email) {
        return request('POST', '/api/auth/resend-confirmation', { email: email });
      }
    },

    me: function () {
      return request('GET', '/api/me');
    },
    patchMe: function (data) {
      return request('PATCH', '/api/me', data);
    },
    meSessions: function () {
      return request('GET', '/api/me/sessions');
    },
    revokeSession: function (sessionId) {
      return request('DELETE', '/api/me/sessions/' + encodeURIComponent(sessionId));
    },
    revokeAllSessions: function (includeCurrent) {
      return request('POST', '/api/me/sessions/revoke-all', { includeCurrent: !!includeCurrent });
    },
    createApiKey: function (days) {
      return request('POST', '/api/me/api-key', { days: days || 90 });
    },
    apiKeys: function () {
      return request('GET', '/api/me/api-keys');
    },
    revokeApiKey: function (id) {
      return request('PATCH', '/api/me/api-keys/' + encodeURIComponent(id) + '/revoke', {});
    },
    testWebhook: function (url, event, payload) {
      return request('POST', '/api/me/webhook/test', { url: url, event: event, payload: payload || { ping: true } });
    },
    createKycRequest: function (documentType, documentUrl) {
      return request('POST', '/api/me/kyc', { documentType: documentType, documentUrl: documentUrl });
    },
    apiDocs: function () {
      return request('GET', '/api/me/api-docs');
    },
    changePassword: function (currentPassword, newPassword) {
      return request('PATCH', '/api/me/password', { currentPassword: currentPassword, newPassword: newPassword });
    },
    getAffiliateProfile: function () { return request('GET', '/api/me/affiliate-profile'); },
    patchAffiliateProfile: function (data) { return request('PATCH', '/api/me/affiliate-profile', data); },

    getNotifications: function (params) {
      var q = [];
      if (params && params.limit != null) q.push('limit=' + encodeURIComponent(params.limit));
      if (params && params.offset != null) q.push('offset=' + encodeURIComponent(params.offset));
      if (params && params.unreadOnly) q.push('unreadOnly=true');
      return request('GET', '/api/me/notifications' + (q.length ? '?' + q.join('&') : ''));
    },
    markNotificationRead: function (id) { return request('PATCH', '/api/me/notifications/' + encodeURIComponent(id), {}); },
    markAllNotificationsRead: function () { return request('PATCH', '/api/me/notifications/read-all', {}); },

    categories: function (params) {
      var q = [];
      if (params && params.level != null) q.push('level=' + encodeURIComponent(params.level));
      if (params && params.active === false) q.push('active=false');
      return request('GET', '/api/categories' + (q.length ? '?' + q.join('&') : ''));
    },
    categoriesTree: function () {
      return request('GET', '/api/categories/tree');
    },
    offers: function (params) {
      var q = [];
      if (params && params.category) q.push('category=' + encodeURIComponent(params.category));
      if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
      if (params && params.search) q.push('search=' + encodeURIComponent(params.search));
      var path = '/api/offers' + (q.length ? '?' + q.join('&') : '');
      return request('GET', path);
    },
    offer: function (id) {
      return request('GET', '/api/offers/' + encodeURIComponent(id));
    },
    getLocationsTree: function () {
      return request('GET', '/api/locations/tree');
    },
    getOfferLocations: function (offerId) {
      return request('GET', '/api/offers/' + encodeURIComponent(offerId) + '/locations');
    },

    supplier: {
      getOffers: function () { return request('GET', '/api/supplier/offers'); },
      createOffer: function (data) { return request('POST', '/api/supplier/offers', data); },
      updateOffer: function (id, data) { return request('PATCH', '/api/supplier/offers/' + id, data); },
      setOfferStatus: function (id, status) { return request('PATCH', '/api/supplier/offers/' + id + '/status', { status: status }); },
      getAffiliates: function (offerId) { return request('GET', '/api/supplier/offers/' + offerId + '/affiliates'); },
      getOfferAudit: function (offerId) { return request('GET', '/api/supplier/offers/' + encodeURIComponent(offerId) + '/audit'); },
      getParticipations: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        if (params && params.page != null) q.push('page=' + encodeURIComponent(params.page));
        if (params && params.pageSize != null) q.push('pageSize=' + encodeURIComponent(params.pageSize));
        return request('GET', '/api/supplier/affiliate-participations' + (q.length ? '?' + q.join('&') : ''));
      },
      setOfferLocations: function (offerId, locationIds) {
        return request('POST', '/api/supplier/offers/' + encodeURIComponent(offerId) + '/locations', { locationIds: locationIds || [] });
      },
      setParticipation: function (participationId, status, reason) {
        var body = { status: status };
        if (reason != null) body.reason = reason;
        return request('PATCH', '/api/supplier/affiliate-participation/' + participationId, body);
      },
      getEvents: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        if (params && params.page != null) q.push('page=' + encodeURIComponent(params.page));
        if (params && params.pageSize != null) q.push('pageSize=' + encodeURIComponent(params.pageSize));
        return request('GET', '/api/supplier/events' + (q.length ? '?' + q.join('&') : ''));
      },
      setEventStatus: function (eventId, status, amount) {
        var body = { status: status };
        if (amount != null) body.amount = amount;
        return request('PATCH', '/api/supplier/events/' + encodeURIComponent(eventId), body);
      },
      stats: function () { return request('GET', '/api/supplier/stats'); },
      analytics: function (params) {
        var q = [];
        if (params && params.from) q.push('from=' + encodeURIComponent(params.from));
        if (params && params.to) q.push('to=' + encodeURIComponent(params.to));
        return request('GET', '/api/supplier/analytics' + (q.length ? '?' + q.join('&') : ''));
      },
      analyticsSources: function (params) {
        var q = [];
        if (params && params.from) q.push('from=' + encodeURIComponent(params.from));
        if (params && params.to) q.push('to=' + encodeURIComponent(params.to));
        return request('GET', '/api/supplier/analytics-sources' + (q.length ? '?' + q.join('&') : ''));
      }
    },
    affiliate: {
      joinOffer: function (offerId) { return request('POST', '/api/affiliate/offers/' + offerId + '/join'); },
      myOffers: function () { return request('GET', '/api/affiliate/my-offers'); },
      stats: function () { return request('GET', '/api/affiliate/stats'); },
      balance: function () { return request('GET', '/api/affiliate/balance'); },
      requestPayout: function (amount) { return request('POST', '/api/affiliate/payouts', { amount: amount }); },
      getPayouts: function () { return request('GET', '/api/affiliate/payouts'); },
      getEvents: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        if (params && params.externalId) q.push('externalId=' + encodeURIComponent(params.externalId));
        if (params && params.page != null) q.push('page=' + encodeURIComponent(params.page));
        if (params && params.pageSize != null) q.push('pageSize=' + encodeURIComponent(params.pageSize));
        return request('GET', '/api/affiliate/events' + (q.length ? '?' + q.join('&') : ''));
      },
      analytics: function (params) {
        var q = [];
        if (params && params.from) q.push('from=' + encodeURIComponent(params.from));
        if (params && params.to) q.push('to=' + encodeURIComponent(params.to));
        return request('GET', '/api/affiliate/analytics' + (q.length ? '?' + q.join('&') : ''));
      },
      analyticsSources: function (params) {
        var q = [];
        if (params && params.from) q.push('from=' + encodeURIComponent(params.from));
        if (params && params.to) q.push('to=' + encodeURIComponent(params.to));
        return request('GET', '/api/affiliate/analytics-sources' + (q.length ? '?' + q.join('&') : ''));
      }
    },

    page: function (slug) {
      return request('GET', '/api/pages/' + encodeURIComponent(slug));
    },

    admin: {
      dashboard: function () { return request('GET', '/api/admin/dashboard'); },
      users: function (params) {
        var q = [];
        if (params && params.role) q.push('role=' + encodeURIComponent(params.role));
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        if (params && params.search) q.push('search=' + encodeURIComponent(params.search));
        if (params && params.page != null) q.push('page=' + encodeURIComponent(params.page));
        if (params && params.pageSize != null) q.push('pageSize=' + encodeURIComponent(params.pageSize));
        return request('GET', '/api/admin/users' + (q.length ? '?' + q.join('&') : ''));
      },
      resetUserPassword: function (userId) {
        return request('POST', '/api/admin/users/' + encodeURIComponent(userId) + '/reset-password', {});
      },
      deleteUser: function (userId) {
        return request('DELETE', '/api/admin/users/' + encodeURIComponent(userId), {});
      },
      offers: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        if (params && params.search) q.push('search=' + encodeURIComponent(params.search));
        if (params && params.page != null) q.push('page=' + encodeURIComponent(params.page));
        if (params && params.pageSize != null) q.push('pageSize=' + encodeURIComponent(params.pageSize));
        return request('GET', '/api/admin/offers' + (q.length ? '?' + q.join('&') : ''));
      },
      setOfferStatus: function (offerId, status) {
        return request('PATCH', '/api/admin/offers/' + encodeURIComponent(offerId), { status: status });
      },
      updateOffer: function (offerId, data) {
        return request('PATCH', '/api/admin/offers/' + encodeURIComponent(offerId), data);
      },
      moderationParticipations: function () { return request('GET', '/api/admin/moderation/participations'); },
      setParticipationStatus: function (participationId, status, reason) {
        var body = { status: status };
        if (reason != null) body.reason = reason;
        return request('PATCH', '/api/admin/moderation/participations/' + encodeURIComponent(participationId), body);
      },
      getEvents: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        if (params && params.page != null) q.push('page=' + encodeURIComponent(params.page));
        if (params && params.pageSize != null) q.push('pageSize=' + encodeURIComponent(params.pageSize));
        return request('GET', '/api/admin/events' + (q.length ? '?' + q.join('&') : ''));
      },
      setEventStatus: function (eventId, status, amount) {
        var body = { status: status };
        if (amount != null) body.amount = amount;
        return request('PATCH', '/api/admin/events/' + encodeURIComponent(eventId), body);
      },
      payouts: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        return request('GET', '/api/admin/payouts' + (q.length ? '?' + q.join('&') : ''));
      },
      payoutsRegistry: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        return request('GET', '/api/admin/payouts/registry' + (q.length ? '?' + q.join('&') : ''));
      },
      payoutsExportCsvUrl: function (status) {
        var q = status ? ('?status=' + encodeURIComponent(status)) : '';
        return BASE + '/api/admin/payouts/export.csv' + q;
      },
      setPayoutsBulkStatus: function (ids, status) {
        return request('PATCH', '/api/admin/payouts/bulk-status', { ids: ids || [], status: status });
      },
      setPayoutStatus: function (payoutId, status) {
        return request('PATCH', '/api/admin/payouts/' + encodeURIComponent(payoutId), { status: status });
      },
      categories: function (params) {
        var q = [];
        if (params && params.activeOnly) q.push('activeOnly=true');
        if (params && params.level != null) q.push('level=' + encodeURIComponent(params.level));
        if (params && params.search) q.push('search=' + encodeURIComponent(params.search));
        return request('GET', '/api/admin/categories' + (q.length ? '?' + q.join('&') : ''));
      },
      categoriesTree: function () {
        return request('GET', '/api/admin/categories/tree');
      },
      categoriesExport: function () {
        return request('GET', '/api/admin/categories/export', null, { headers: {} }).then(function (r) { return r; });
      },
      categoriesImport: function (data) {
        return request('POST', '/api/admin/categories/import', Array.isArray(data) ? data : { items: data });
      },
      createCategory: function (data) {
        return request('POST', '/api/admin/categories', data);
      },
      updateCategory: function (id, data) {
        return request('PATCH', '/api/admin/categories/' + encodeURIComponent(id), data);
      },
      locations: function (params) {
        var q = [];
        if (params && params.level != null) q.push('level=' + encodeURIComponent(params.level));
        if (params && params.type) q.push('type=' + encodeURIComponent(params.type));
        if (params && params.search) q.push('search=' + encodeURIComponent(params.search));
        return request('GET', '/api/admin/locations' + (q.length ? '?' + q.join('&') : ''));
      },
      locationsTree: function () {
        return request('GET', '/api/admin/locations/tree');
      },
      createLocation: function (data) {
        return request('POST', '/api/admin/locations', data);
      },
      updateLocation: function (id, data) {
        return request('PATCH', '/api/admin/locations/' + encodeURIComponent(id), data);
      },
      locationsImport: function (data) {
        return request('POST', '/api/admin/locations/import', Array.isArray(data) ? data : { items: data });
      },
      setOfferLocations: function (offerId, locationIds) {
        return request('POST', '/api/admin/offers/' + encodeURIComponent(offerId) + '/locations', { locationIds: locationIds || [] });
      }
    }
  };
})();
