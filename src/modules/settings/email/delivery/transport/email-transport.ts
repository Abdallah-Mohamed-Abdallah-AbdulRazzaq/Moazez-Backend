import { SchoolEmailConnection } from '@prisma/client';

export const SCHOOL_EMAIL_TRANSPORT = Symbol('SCHOOL_EMAIL_TRANSPORT');

export type SchoolEmailTransportFailurePhase =
  | 'PRE_PROVIDER_ATTEMPT'
  | 'KNOWN_PROVIDER_REJECTION'
  | 'AMBIGUOUS_AFTER_PROVIDER_ATTEMPT';

export class SchoolEmailTransportFailure extends Error {
  constructor(
    readonly phase: SchoolEmailTransportFailurePhase,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'SchoolEmailTransportFailure';
  }
}

export interface SchoolEmailSendInput {
  messageId: string;
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
