/**
 * Отправка писем (nodemailer). Если SMTP не настроен — письма не отправляются, ошибок нет.
 */
const MAIL_HOST = process.env.MAIL_HOST;
const MAIL_PORT = Number(process.env.MAIL_PORT) || 587;
const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;
const MAIL_FROM = process.env.MAIL_FROM || process.env.MAIL_USER || 'noreply@realcpa.local';
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.API_BASE_URL || 'http://localhost:3000';
const baseUrl = FRONTEND_URL.replace(/\/api\/?$/, '');

function getTransporter(): { sendMail: (opts: { from?: string; to: string; subject: string; html: string; text?: string }) => Promise<unknown> } | null {
  if (!MAIL_HOST || !MAIL_USER || !MAIL_PASS) return null;
  try {
    const nodemailer = require('nodemailer');
    return nodemailer.createTransport({
      host: MAIL_HOST,
      port: MAIL_PORT,
      secure: MAIL_PORT === 465,
      auth: { user: MAIL_USER, pass: MAIL_PASS },
    });
  } catch {
    return null;
  }
}

export async function sendMail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) {
    if (process.env.NODE_ENV !== 'production') console.log('[email] (no SMTP) would send to', to, subject);
    return false;
  }
  try {
    await transport.sendMail({
      from: MAIL_FROM,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]+>/g, ''),
    });
    return true;
  } catch (e) {
    console.error('[email] send failed:', e);
    return false;
  }
}

export async function sendResetPassword(to: string, resetLink: string): Promise<boolean> {
  const subject = 'Сброс пароля — FactPay';
  const html = `
    <p>Здравствуйте.</p>
    <p>Вы запросили сброс пароля. Перейдите по ссылке для установки нового пароля:</p>
    <p><a href="${resetLink}">${resetLink}</a></p>
    <p>Ссылка действительна 1 час. Если вы не запрашивали сброс, проигнорируйте это письмо.</p>
    <p>— FactPay</p>
  `;
  return sendMail(to, subject, html);
}

export async function sendWelcome(to: string, name?: string): Promise<boolean> {
  const subject = 'Добро пожаловать в FactPay';
  const greeting = name ? `, ${name}` : '';
  const html = `
    <p>Здравствуйте${greeting}.</p>
    <p>Вы зарегистрировались в FactPay.</p>
    <p>Если вы ещё не подтвердили email, пожалуйста, перейдите по ссылке из письма для подтверждения.</p>
    <p><a href="${baseUrl}/login.html">Войти</a></p>
    <p>— FactPay</p>
  `;
  return sendMail(to, subject, html);
}

export async function sendEmailConfirmation(to: string, confirmLink: string): Promise<boolean> {
  const subject = 'Подтверждение email — FactPay';
  const html = `
    <p>Здравствуйте.</p>
    <p>Вы зарегистрировались в FactPay. Подтвердите email, перейдя по ссылке:</p>
    <p><a href="${confirmLink}">${confirmLink}</a></p>
    <p>Ссылка действует ограниченное время. Если вы не создавали аккаунт, просто проигнорируйте это письмо.</p>
    <p>— FactPay</p>
  `;
  return sendMail(to, subject, html);
}

export async function sendParticipationApproved(to: string, offerTitle: string, trackingUrl: string): Promise<boolean> {
  const subject = 'Заявка одобрена — ' + offerTitle;
  const html = `
    <p>Здравствуйте.</p>
    <p>Ваша заявка на подключение к офферу «${offerTitle}» одобрена.</p>
    <p>Трекинг-ссылка: <a href="${trackingUrl}">${trackingUrl}</a></p>
    <p>Используйте её в рекламе для учёта переходов и конверсий.</p>
    <p>— FactPay</p>
  `;
  return sendMail(to, subject, html);
}

export async function sendParticipationRejected(to: string, offerTitle: string): Promise<boolean> {
  const subject = 'Заявка отклонена — ' + offerTitle;
  const html = `
    <p>Здравствуйте.</p>
    <p>К сожалению, ваша заявка на подключение к офферу «${offerTitle}» отклонена.</p>
    <p>Вы можете выбрать другой оффер в каталоге или связаться с поддержкой.</p>
    <p>— FactPay</p>
  `;
  return sendMail(to, subject, html);
}

export async function sendPayoutPaid(to: string, amount: number, currency: string): Promise<boolean> {
  const subject = `Выплата ${amount} ${currency} выполнена — FactPay`;
  const html = `
    <p>Здравствуйте.</p>
    <p>Ваша заявка на вывод средств выполнена. Сумма: ${amount} ${currency}.</p>
    <p>— FactPay</p>
  `;
  return sendMail(to, subject, html);
}

export async function sendAdminPasswordReset(to: string, tempPassword: string): Promise<boolean> {
  const subject = 'Временный пароль — FactPay';
  const html = `
    <p>Здравствуйте.</p>
    <p>Администратор сбросил пароль вашей учётной записи.</p>
    <p><strong>Временный пароль:</strong> <code>${tempPassword}</code></p>
    <p>Войдите в систему и сразу смените пароль в профиле:</p>
    <p><a href="${baseUrl}/login.html">${baseUrl}/login.html</a></p>
    <p>Если вы не запрашивали смену пароля, обратитесь в поддержку.</p>
    <p>— FactPay</p>
  `;
  return sendMail(to, subject, html);
}

export function buildResetLink(token: string): string {
  return baseUrl + '/reset-password.html?token=' + encodeURIComponent(token);
}

export function buildEmailConfirmLink(token: string): string {
  return baseUrl + '/confirm-email.html?token=' + encodeURIComponent(token);
}
