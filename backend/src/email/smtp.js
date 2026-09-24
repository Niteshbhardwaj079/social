import nodemailer from 'nodemailer';

// Bounds each phase of the handshake individually; emailSettingsService.js's verify() wraps the
// whole call in one hard overall deadline on top of these, since nodemailer doesn't do that itself.
const TRANSPORT_TIMEOUTS = { connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 15_000 };

const sanitize = (value) => String(value).replace(/["<>\r\n]/g, '');
const addressOf = (email, name) => (name ? `${sanitize(name)} <${email}>` : email);

function buildTransport(values) {
  return nodemailer.createTransport({
    host: values.host,
    port: Number(values.port),
    secure: Boolean(values.secure),
    auth: values.username ? { user: values.username, pass: values.password } : undefined,
    ...TRANSPORT_TIMEOUTS,
  });
}

export async function testConnection(values) {
  const transport = buildTransport(values);
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

export async function sendMail(values, { toEmail, toName, subject, html }) {
  const transport = buildTransport(values);
  try {
    await transport.sendMail({
      from: addressOf(values.fromEmail, values.fromName),
      to: addressOf(toEmail, toName),
      subject,
      html,
    });
  } finally {
    transport.close();
  }
}
