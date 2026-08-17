import type { Request } from 'express';
import type { TrustedClientIpResolver } from '../../../bootstrap/trusted-client-ip.resolver';
import { ApplicantPortalController } from './applicant-portal.controller';

const RESOLVED_CLIENT_IP = '2001:db8::41';
const REQUEST_ID = '00000000-0000-0000-0000-000000000201';
const DOCUMENT_ID = '00000000-0000-0000-0000-000000000301';

type ExecuteMock = jest.Mock<Promise<unknown>, unknown[]>;

interface UseCaseMocks {
  createAccount: ExecuteMock;
  getProfile: ExecuteMock;
  listSchools: ExecuteMock;
  getSchool: ExecuteMock;
  listRequiredDocuments: ExecuteMock;
  createRequest: ExecuteMock;
  listRequests: ExecuteMock;
  getRequest: ExecuteMock;
  submitRequest: ExecuteMock;
  uploadDocument: ExecuteMock;
  listDocuments: ExecuteMock;
  getDocument: ExecuteMock;
  downloadDocument: ExecuteMock;
  replaceDocument: ExecuteMock;
  deleteDocument: ExecuteMock;
}

describe('ApplicantPortalController trusted client IP boundary', () => {
  let useCases: UseCaseMocks;
  let controller: ApplicantPortalController;
  let request: Request;

  beforeEach(() => {
    useCases = useCaseMocks();
    controller = buildController(
      useCases,
      resolverReturning(RESOLVED_CLIENT_IP),
    );
    request = requestFixture();
  });

  it('passes the centralized value to account audit persistence', async () => {
    await controller.createAccount({} as never, request);

    expectResolvedIp(useCases.createAccount);
  });

  it('passes the centralized value to request creation audit persistence', async () => {
    await controller.createRequest({} as never, request);

    expectResolvedIp(useCases.createRequest);
  });

  it('passes the centralized value to request submission audit persistence', async () => {
    await controller.submitRequest(REQUEST_ID, request);

    expectResolvedIp(useCases.submitRequest);
  });

  it('passes the centralized value to document upload audit persistence', async () => {
    await controller.uploadDocument(
      REQUEST_ID,
      undefined,
      {} as never,
      request,
    );

    expectResolvedIp(useCases.uploadDocument);
  });

  it('passes the centralized value to document download audit persistence', async () => {
    await controller.downloadDocument(REQUEST_ID, DOCUMENT_ID, request);

    expectResolvedIp(useCases.downloadDocument);
  });

  it('passes the centralized value to document replacement audit persistence', async () => {
    await controller.replaceDocument(
      REQUEST_ID,
      DOCUMENT_ID,
      undefined,
      {} as never,
      request,
    );

    expectResolvedIp(useCases.replaceDocument);
  });

  it('passes the centralized value to document deletion audit persistence', async () => {
    await controller.deleteDocument(REQUEST_ID, DOCUMENT_ID, request);

    expectResolvedIp(useCases.deleteDocument);
  });
});

function useCaseMocks(): UseCaseMocks {
  const execute = (): ExecuteMock => jest.fn().mockResolvedValue({});
  return {
    createAccount: execute(),
    getProfile: execute(),
    listSchools: execute(),
    getSchool: execute(),
    listRequiredDocuments: execute(),
    createRequest: execute(),
    listRequests: execute(),
    getRequest: execute(),
    submitRequest: execute(),
    uploadDocument: execute(),
    listDocuments: execute(),
    getDocument: execute(),
    downloadDocument: jest
      .fn<Promise<unknown>, unknown[]>()
      .mockResolvedValue('https://storage.example.test/download'),
    replaceDocument: execute(),
    deleteDocument: jest.fn().mockResolvedValue(undefined),
  };
}

function buildController(
  useCases: UseCaseMocks,
  trustedClientIpResolver: TrustedClientIpResolver,
): ApplicantPortalController {
  return new ApplicantPortalController(
    { execute: useCases.createAccount } as never,
    { execute: useCases.getProfile } as never,
    { execute: useCases.listSchools } as never,
    { execute: useCases.getSchool } as never,
    { execute: useCases.listRequiredDocuments } as never,
    { execute: useCases.createRequest } as never,
    { execute: useCases.listRequests } as never,
    { execute: useCases.getRequest } as never,
    { execute: useCases.submitRequest } as never,
    { execute: useCases.uploadDocument } as never,
    { execute: useCases.listDocuments } as never,
    { execute: useCases.getDocument } as never,
    { execute: useCases.downloadDocument } as never,
    { execute: useCases.replaceDocument } as never,
    { execute: useCases.deleteDocument } as never,
    trustedClientIpResolver,
  );
}

function resolverReturning(value: string): TrustedClientIpResolver {
  return {
    resolve: jest.fn().mockReturnValue(value),
  } as unknown as TrustedClientIpResolver;
}

function requestFixture(): Request {
  return {
    ip: '127.0.0.1',
    rawHeaders: [],
    header: jest.fn().mockReturnValue('jest-agent'),
  } as unknown as Request;
}

function expectResolvedIp(execute: ExecuteMock): void {
  expect(execute).toHaveBeenCalledWith(
    expect.objectContaining({ ipAddress: RESOLVED_CLIENT_IP }),
  );
}
