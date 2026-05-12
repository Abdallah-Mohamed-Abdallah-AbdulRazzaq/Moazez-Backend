import { SchoolEmailConnection } from '@prisma/client';

export const SCHOOL_EMAIL_TRANSPORT = Symbol('SCHOOL_EMAIL_TRANSPORT');

export interface SchoolEmailSendInput {
  fromName: string;
  fromEmail: string;
  replyToEmail?: string | null;
  toEmail: string;
  subject: string;
  html: string;
  text?: string | null;
  connection: SchoolEmailConnection;
}

export interface SchoolEmailSendResult {
  providerMessageId?: string | null;
  accepted?: string[];
  rejected?: string[];
}

export interface SchoolEmailTransport {
  sendEmail(input: SchoolEmailSendInput): Promise<SchoolEmailSendResult>;
}
