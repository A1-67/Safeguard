
'use server';

import nodemailer from 'nodemailer';

// Secure credentials for Safe Guard Gmail Dispatch
const GMAIL_USER = 'safeguardapk@gmail.com';
const GMAIL_PASS = 'dvwj nlyf zwsv jusp'; // Verified App Password

export type EmergencyActionResult = 
  | { success: true; data: any }
  | { success: false; error: string };

/**
 * Sends a high-priority emergency email using your Gmail account.
 */
export async function sendEmergencyEmail(params: {
  to: string[];
  subject: string;
  text: string;
}): Promise<EmergencyActionResult> {
  const { to, subject, text } = params;

  if (!to || to.length === 0) {
    return { success: false, error: 'No recipients provided for emergency dispatch.' };
  }

  // Create transporter using Gmail SMTP
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from: `"Safe Guard Dispatch" <${GMAIL_USER}>`,
      to: to.join(', '),
      subject: subject,
      text: text,
      priority: 'high',
    });

    return { success: true, data: 'Email dispatched via Safe Guard Gmail Server' };
  } catch (err: any) {
    console.error('Nodemailer Error:', err);
    let errorMessage = err.message || 'Gmail dispatch failed.';
    
    // Check for common Gmail SMTP errors
    if (errorMessage.includes('Invalid login') || errorMessage.includes('Username and Password not accepted')) {
      errorMessage = 'Safe Guard Alert: Gmail authentication failed. Please verify credentials.';
    }

    return { success: false, error: errorMessage };
  }
}
