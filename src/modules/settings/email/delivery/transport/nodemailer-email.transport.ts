import { Injectable } from '@nestjs/common';
import { SchoolEmailProviderType } from '@prisma/client';
import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { EmailSecretCrypto } from '../../domain/email-secret-crypto';
import { EmailDeliverySendFailedException } from '../../domain/email.exceptions';
import {
  SchoolEmailSendInput,
  SchoolEmailSendResult,
  SchoolEmailTransport,
} from './email-transport';

@Injectable()
export class NodemailerEmailTransport implements SchoolEmailTransport {
  constructor(private readonly emailSecretCrypto: EmailSecretCrypto) {}

  async sendEmail(
    input: SchoolEmailSendInput,
  ): Promise<SchoolEmailSendResult> {
    if (input.connection.providerType !== SchoolEmailProviderType.SMTP) {
      throw new EmailDeliverySendFailedException('unsupported_provider');
    }

    if (
      !input.connection.host ||
      !input.connection.port ||
      !input.connection.username ||
      !input.connection.encryptedPassword
    ) {
      throw new EmailDeliverySendFailedException('smtp_configuration_invalid');
    }

    const password = this.emailSecretCrypto.decrypt(
      input.connection.encryptedPassword,
    );
    const transport = nodemailer.createTransport({
      host: input.connection.host,
      port: input.connection.port,
      secure: input.connection.secure,
      auth: {
        user: input.connection.username,
        pass: password,
      },
    } satisfies SMTPTransport.Options);

    const info = await transport.sendMail({
      from: {
        name: input.fromName,
        address: input.fromEmail,
      },
      replyTo: input.replyToEmail ?? undefined,
      to: input.toEmail,
      subject: input.subject,
      html: input.html,
      text: input.text ?? undefined,
    });

    return {
      providerMessageId:
        typeof info.messageId === 'string' ? info.messageId : null,
      accepted: normalizeAddressList(info.accepted),
      rejected: normalizeAddressList(info.rejected),
    };
  }
}

function normalizeAddressList(addresses: unknown): string[] {
  if (!Array.isArray(addresses)) return [];
  return addresses
    .map((address) =>
      typeof address === 'string'
        ? address
        : typeof address === 'object' &&
            address !== null &&
            'address' in address
          ? String((address as { address: unknown }).address)
          : null,
    )
    .filter((address): address is string => Boolean(address));
}
