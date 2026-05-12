import { SchoolEmailConnection } from '@prisma/client';
import {
  SchoolEmailConnectionResponseDto,
  TestEmailConnectionResponseDto,
} from '../dto/email-connection.dto';

export function presentEmailConnection(
  connection: SchoolEmailConnection | null,
): SchoolEmailConnectionResponseDto {
  if (!connection) {
    return {
      configured: false,
      providerType: null,
      fromName: null,
      fromEmail: null,
      replyToEmail: null,
      host: null,
      port: null,
      secure: null,
      username: null,
      hasPassword: false,
      hasApiKey: false,
      status: null,
      lastTestedAt: null,
      verifiedAt: null,
      failureReason: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    configured: true,
    providerType: connection.providerType,
    fromName: connection.fromName,
    fromEmail: connection.fromEmail,
    replyToEmail: connection.replyToEmail,
    host: connection.host,
    port: connection.port,
    secure: connection.secure,
    username: connection.username,
    hasPassword: Boolean(connection.encryptedPassword),
    hasApiKey: Boolean(connection.encryptedApiKey),
    status: connection.status,
    lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
    verifiedAt: connection.verifiedAt?.toISOString() ?? null,
    failureReason: connection.failureReason,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  };
}

export function presentEmailConnectionTestResult(
  connection: SchoolEmailConnection,
  testRecipient: string,
): TestEmailConnectionResponseDto {
  return {
    ...presentEmailConnection(connection),
    testRecipient,
    deliveryMode: 'configuration_validation',
    message:
      'SMTP configuration was validated. No bulk or credential email was sent.',
  };
}
