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
          setTokens(r.accessToken, r.refreshToken);
          setUser(r.user);
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
          setTokens(r.accessToken, null);
          return r.accessToken;
        });
      },
      forgotPassword: function (email) {
        return request('POST', '/api/auth/forgot-password', { email: email });
      },
      resetPassword: function (token, newPassword) {
        return request('POST', '/api/auth/reset-password', { token: token, newPassword: newPassword });
      }
    },

    me: function () {
      return request('GET', '/api/me');
    },
    patchMe: function (data) {
      return request('PATCH', '/api/me', data);
    },
    getAffiliateProfile: function () { return request('GET', '/api/me/affiliate-profile'); },
    patchAffiliateProfile: function (data) { return request('PATCH', '/api/me/affiliate-profile', data); },

    categories: function () {
      return request('GET', '/api/categories');
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

    supplier: {
      getOffers: function () { return request('GET', '/api/supplier/offers'); },
      createOffer: function (data) { return request('POST', '/api/supplier/offers', data); },
      updateOffer: function (id, data) { return request('PATCH', '/api/supplier/offers/' + id, data); },
      setOfferStatus: function (id, status) { return request('PATCH', '/api/supplier/offers/' + id + '/status', { status: status }); },
      getAffiliates: function (offerId) { return request('GET', '/api/supplier/offers/' + offerId + '/affiliates'); },
      setParticipation: function (participationId, status) { return request('PATCH', '/api/supplier/affiliate-participation/' + participationId, { status: status }); },
      stats: function () { return request('GET', '/api/supplier/stats'); },
      analytics: function (params) {
        var q = [];
        if (params && params.from) q.push('from=' + encodeURIComponent(params.from));
        if (params && params.to) q.push('to=' + encodeURIComponent(params.to));
        return request('GET', '/api/supplier/analytics' + (q.length ? '?' + q.join('&') : ''));
      }
    },
    affiliate: {
      joinOffer: function (offerId) { return request('POST', '/api/affiliate/offers/' + offerId + '/join'); },
      myOffers: function () { return request('GET', '/api/affiliate/my-offers'); },
      stats: function () { return request('GET', '/api/affiliate/stats'); },
      balance: function () { return request('GET', '/api/affiliate/balance'); },
      requestPayout: function (amount) { return request('POST', '/api/affiliate/payouts', { amount: amount }); },
      getPayouts: function () { return request('GET', '/api/affiliate/payouts'); },
      analytics: function (params) {
        var q = [];
        if (params && params.from) q.push('from=' + encodeURIComponent(params.from));
        if (params && params.to) q.push('to=' + encodeURIComponent(params.to));
        return request('GET', '/api/affiliate/analytics' + (q.length ? '?' + q.join('&') : ''));
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
        return request('GET', '/api/admin/users' + (q.length ? '?' + q.join('&') : ''));
      },
      offers: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        if (params && params.search) q.push('search=' + encodeURIComponent(params.search));
        return request('GET', '/api/admin/offers' + (q.length ? '?' + q.join('&') : ''));
      },
      setOfferStatus: function (offerId, status) {
        return request('PATCH', '/api/admin/offers/' + encodeURIComponent(offerId), { status: status });
      },
      moderationParticipations: function () { return request('GET', '/api/admin/moderation/participations'); },
      payouts: function (params) {
        var q = [];
        if (params && params.status) q.push('status=' + encodeURIComponent(params.status));
        return request('GET', '/api/admin/payouts' + (q.length ? '?' + q.join('&') : ''));
      },
      setPayoutStatus: function (payoutId, status) {
        return request('PATCH', '/api/admin/payouts/' + encodeURIComponent(payoutId), { status: status });
      }
    }
  };
})();
