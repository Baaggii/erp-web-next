import nodemailer from 'nodemailer';
const transporter = nodemailer.createTransport({ /* SMTP config */ });
export async function sendEmail(to, subject, html) {
  return transporter.sendMail({ from: 'no-reply@erp', to, subject, html });
}