const workflowRoutes = require("../../src/modules/workflows/workflows.route");
const formsRoutes = require("../../src/modules/forms/forms.route");
const kycRoutes = require("../../src/modules/kyc/kyc.route");
const signaturesRoutes = require("../../src/modules/signatures/signatures.route");
const documentsRoutes = require("../../src/modules/documents/documents.route");
const notificationsRoutes = require("../../src/modules/notifications/notifications.route");
const importsRoutes = require("../../src/modules/imports/imports.route");
const auditRoutes = require("../../src/modules/audit/audit.route");
const publicRoutes = require("../../src/modules/public/public.route");
const permissionsRoutes = require("../../src/modules/permissions/permissions.route");

jest.mock("../../src/models/workflow.model", () => ({ create: jest.fn(), find: jest.fn(), findOne: jest.fn() }));
jest.mock("../../src/models/formSubmission.model", () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock("../../src/models/approval.model", () => ({ create: jest.fn(), find: jest.fn() }));
jest.mock("../../src/models/form.model", () => ({ create: jest.fn(), find: jest.fn(), findOne: jest.fn(), findOneAndUpdate: jest.fn(), findById: jest.fn() }));
jest.mock("../../src/models/externalUser.model", () => ({ create: jest.fn(), findOne: jest.fn(), deleteOne: jest.fn() }));
jest.mock("../../src/models/publicFormToken.model", () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock("../../src/models/kycRecord.model", () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  deleteMany: jest.fn(),
  findById: jest.fn(),
}));
jest.mock("../../src/models/user.model", () => ({ find: jest.fn(), findById: jest.fn(), countDocuments: jest.fn() }));
jest.mock("../../src/modules/notifications/notification.adapter", () => ({ sendEmail: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../src/models/signature.model", () => ({ findOne: jest.fn(), create: jest.fn(), find: jest.fn() }));
jest.mock("../../src/models/document.model", () => ({ create: jest.fn(), findOne: jest.fn() }));
jest.mock("../../src/models/notification.model", () => ({ create: jest.fn(), find: jest.fn() }));
jest.mock("../../src/modules/notifications/notifications.service", () => ({
  getElevatedRecipientIdSet: jest.fn().mockResolvedValue(new Set(["507f1f77bcf86cd799439011"])),
  listEligibleRecipients: jest.fn().mockResolvedValue([]),
  listAllActiveUsers: jest.fn().mockResolvedValue([]),
  assertRecipientsInTenant: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../src/models/import.model", () => ({ create: jest.fn() }));
jest.mock("../../src/models/importError.model", () => ({ create: jest.fn() }));
jest.mock("../../src/models/auditLog.model", () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock("../../src/models/permission.model", () => ({ find: jest.fn() }));
jest.mock("../../src/middlewares/upload.middleware", () => ({ single: () => (_req, _res, next) => next() }));
jest.mock("../../src/services/audit.service", () => ({ writeAudit: jest.fn() }));

const Workflow = require("../../src/models/workflow.model");
const FormSubmission = require("../../src/models/formSubmission.model");
const Approval = require("../../src/models/approval.model");
const Form = require("../../src/models/form.model");
const ExternalUser = require("../../src/models/externalUser.model");
const PublicFormToken = require("../../src/models/publicFormToken.model");
const KycRecord = require("../../src/models/kycRecord.model");
const User = require("../../src/models/user.model");
const Signature = require("../../src/models/signature.model");
const Document = require("../../src/models/document.model");
const Notification = require("../../src/models/notification.model");
const Import = require("../../src/models/import.model");
const ImportError = require("../../src/models/importError.model");
const AuditLog = require("../../src/models/auditLog.model");
const Permission = require("../../src/models/permission.model");

function fakeRes() {
  return { status: jest.fn().mockReturnThis(), json: jest.fn() };
}

async function callRouteHandler(router, routePath, method, reqOverrides = {}) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method.toLowerCase()]
  );
  const handler = layer.route.stack[layer.route.stack.length - 1].handle;
  const req = {
    body: {},
    params: {},
    query: {},
    tenantId: "t1",
    auth: { userId: "u1", positionId: "p1" },
    file: { originalname: "test.xlsx" },
    ...reqOverrides,
  };
  const res = fakeRes();
  const next = jest.fn();
  await handler(req, res, next);
  return { req, res, next };
}

describe("route modules unit coverage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("covers workflow route handlers", async () => {
    Workflow.create.mockResolvedValue({ _id: "w1" });
    Workflow.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: "w1" }]) });
    Workflow.findOne.mockResolvedValue({ _id: "w1", steps: [{ positionId: "p1" }], status: "ACTIVE" });
    FormSubmission.create.mockResolvedValue({ _id: "s1" });
    FormSubmission.findOne.mockResolvedValue({ _id: "s1", status: "PENDING", currentStep: 0, save: jest.fn() });
    Approval.create.mockResolvedValue({ _id: "a1" });
    Approval.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: "a1" }]) });

    await callRouteHandler(workflowRoutes, "/", "POST", { body: { name: "W", steps: [{ order: 1, positionId: "p1" }] } });
    await callRouteHandler(workflowRoutes, "/", "GET");
    await callRouteHandler(workflowRoutes, "/submissions", "POST", { body: { formId: "f1", workflowId: "w1", data: {} } });
    await callRouteHandler(workflowRoutes, "/approvals/:submissionId/action", "POST", { params: { submissionId: "s1" }, body: { action: "APPROVE" } });
    await callRouteHandler(workflowRoutes, "/submissions/:submissionId", "GET", { params: { submissionId: "s1" } });

    // Validation/error branches
    const invalid = await callRouteHandler(workflowRoutes, "/", "POST", { body: { name: "" } });
    expect(invalid.next).toHaveBeenCalled();
    Workflow.findOne.mockResolvedValue(null);
    const missingWorkflow = await callRouteHandler(workflowRoutes, "/submissions", "POST", { body: { formId: "f1", workflowId: "missing" } });
    expect(missingWorkflow.next).toHaveBeenCalled();
    const invalidAction = await callRouteHandler(workflowRoutes, "/approvals/:submissionId/action", "POST", {
      params: { submissionId: "s1" },
      body: { action: "INVALID_ACTION" },
    });
    expect(invalidAction.next).toHaveBeenCalled();
    FormSubmission.findOne.mockResolvedValue(null);
    const missingSubmission = await callRouteHandler(workflowRoutes, "/submissions/:submissionId", "GET", { params: { submissionId: "s999" } });
    expect(missingSubmission.next).toHaveBeenCalled();
  });

  it("covers forms and public token handlers", async () => {
    Form.create.mockResolvedValue({ _id: "f1" });
    Form.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: "f1" }]) });
    Form.findOne.mockResolvedValue({ _id: "f1", status: "PUBLISHED" });
    Form.findOneAndUpdate.mockResolvedValue({ _id: "f1", status: "PUBLISHED" });
    Form.findById.mockResolvedValue({ _id: "f1" });
    Workflow.findOne.mockResolvedValue({ _id: "w1" });
    ExternalUser.create.mockResolvedValue({ _id: "e1" });
    PublicFormToken.create.mockResolvedValue({ token: "tkn", expiresAt: new Date(Date.now() + 10000) });
    PublicFormToken.findOne.mockResolvedValue({ token: "tkn", tenantId: "t1", formId: "f1", expiresAt: new Date(Date.now() + 10000), save: jest.fn() });
    FormSubmission.create.mockResolvedValue({ _id: "s1", status: "PENDING" });

    await callRouteHandler(formsRoutes, "/", "POST", { body: { title: "F", schema: {}, workflowId: "w1" } });
    await callRouteHandler(formsRoutes, "/", "GET");
    await callRouteHandler(formsRoutes, "/:formId/publish", "POST", { params: { formId: "f1" } });
    await callRouteHandler(formsRoutes, "/:formId/public-token", "POST", {
      params: { formId: "f1" },
      body: { externalType: "doctor", name: "Doc", email: "d@x.com" },
    });
    await callRouteHandler(formsRoutes, "/public/:token", "GET", { params: { token: "tkn" } });
    await callRouteHandler(formsRoutes, "/public/:token/submit", "POST", { params: { token: "tkn" }, body: { a: 1 } });
    await callRouteHandler(publicRoutes, "/form/:token", "GET", { params: { token: "tkn" } });

    PublicFormToken.findOne.mockResolvedValue(null);
    const invalidPublic = await callRouteHandler(publicRoutes, "/form/:token", "GET", { params: { token: "bad" } });
    expect(invalidPublic.next).toHaveBeenCalled();
    const invalidPublicSubmit = await callRouteHandler(publicRoutes, "/form/:token/submit", "POST", { params: { token: "bad" } });
    expect(invalidPublicSubmit.next).toHaveBeenCalled();
    Form.findOneAndUpdate.mockResolvedValue(null);
    const missingPublish = await callRouteHandler(formsRoutes, "/:formId/publish", "POST", { params: { formId: "missing" } });
    expect(missingPublish.next).toHaveBeenCalled();
  });

  it("covers kyc/signature/document/notification/import/audit handlers", async () => {
    const mockKycSave = jest.fn().mockResolvedValue(undefined);
    const mockKycRecord = {
      _id: "k1",
      status: "PENDING",
      refType: "EXTERNAL_USER",
      refId: "e1",
      tenantId: "t1",
      providerResponseMeta: {},
      save: mockKycSave,
      markModified: jest.fn(),
    };
    ExternalUser.findOne.mockResolvedValue({ _id: "e1", email: "x@x.com", name: "N", tenantId: "t1", createdByUserId: "u1" });
    KycRecord.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([]) });
    KycRecord.create.mockResolvedValue(mockKycRecord);
    KycRecord.findOne.mockResolvedValue({
      _id: "k1",
      tenantId: "t1",
      refType: "EXTERNAL_USER",
      refId: "e1",
      status: "PENDING",
      providerResponseMeta: {},
    });
    User.find.mockResolvedValue([]);
    User.findById.mockResolvedValue({ empCode: "E1", name: "Actor", email: "a@x.com" });
    Signature.findOne.mockReturnValue({ sort: jest.fn().mockResolvedValue(null) });
    Signature.create.mockResolvedValue({ _id: "sig1" });
    Signature.find.mockResolvedValue([]);
    Document.create.mockResolvedValue({ _id: "d1", pdfUrl: "https://x.pdf" });
    Document.findOne.mockResolvedValue({ _id: "d1" });
    Notification.create.mockResolvedValue({ _id: "n1", status: "PENDING", save: jest.fn() });
    Notification.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            limit: jest.fn().mockResolvedValue([{ _id: "n1" }]),
          }),
        }),
      }),
    });
    User.countDocuments.mockResolvedValue(1);
    Import.create.mockResolvedValue({ _id: "i1", save: jest.fn(), totalRows: 0, successRows: 0, failedRows: 0 });
    ImportError.create.mockResolvedValue({ _id: "ie1" });
    AuditLog.find.mockReturnValue({ sort: jest.fn().mockReturnValue({ skip: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([{ _id: "a1" }]) }) }) });
    AuditLog.countDocuments.mockResolvedValue(1);

    await callRouteHandler(kycRoutes, "/initiate", "POST", {
      body: {
        refType: "EXTERNAL_USER",
        refId: "e1",
        otpType: "AADHAAR",
        verifyBaseUrl: "https://example.com/public/kyc-verify",
      },
    });
    await callRouteHandler(kycRoutes, "/:kycId/status", "GET", { params: { kycId: "k1" } });
    await callRouteHandler(signaturesRoutes, "/", "POST", { body: { refId: "s1", type: "START", fileUrl: "https://x.png" } });
    await callRouteHandler(documentsRoutes, "/generate-pdf", "POST", { body: { refId: "s1" } });
    await callRouteHandler(documentsRoutes, "/:documentId", "GET", { params: { documentId: "d1" } });
    await callRouteHandler(notificationsRoutes, "/", "POST", {
      body: {
        channel: "EMAIL",
        message: "x",
        eventType: "E",
        to: "a@x.com",
        recipientUserIds: ["507f1f77bcf86cd799439011"],
      },
    });
    await callRouteHandler(notificationsRoutes, "/", "GET");
    await callRouteHandler(importsRoutes, "/employees", "POST", { body: { rows: [] } });
    await callRouteHandler(auditRoutes, "/logs", "GET");

    const badPublicKyc = await callRouteHandler(publicRoutes, "/kyc/verify", "POST", { body: {} });
    expect(badPublicKyc.next).toHaveBeenCalled();
    Document.findOne.mockResolvedValue(null);
    const missingDocument = await callRouteHandler(documentsRoutes, "/:documentId", "GET", { params: { documentId: "none" } });
    expect(missingDocument.next).toHaveBeenCalled();
    const missingFile = await callRouteHandler(importsRoutes, "/employees", "POST", { file: null, body: {} });
    expect(missingFile.next).toHaveBeenCalled();
  });

  it("covers permissions route branches", async () => {
    Permission.find.mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: "p1" }]) });
    await callRouteHandler(permissionsRoutes, "/", "GET");
    Permission.find.mockImplementation(() => {
      throw new Error("permissions failed");
    });
    const failure = await callRouteHandler(permissionsRoutes, "/", "GET");
    expect(failure.next).toHaveBeenCalled();
  });
});
