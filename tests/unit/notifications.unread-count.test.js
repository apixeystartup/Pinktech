const express = require("express");
const request = require("supertest");
const Notification = require("../../services/notifications-service/src/models/notification.model");
const notificationsRouter = require("../../services/notifications-service/src/routes/notifications.route");

jest.mock("../../services/notifications-service/src/models/notification.model");

describe("notifications unread count", () => {
  const app = express().use("/", notificationsRouter);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("counts unread in-app notifications for the current recipient and legacy user id", async () => {
    Notification.countDocuments.mockResolvedValue(4);

    const response = await request(app)
      .get("/unread-count")
      .set("x-auth-user-id", "65a000000000000000000001")
      .set("x-auth-tenant-id", "65a000000000000000000002");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ unreadCount: 4 });
    expect(Notification.countDocuments).toHaveBeenCalledWith({
      channel: "IN_APP",
      readAt: null,
      $or: [
        { recipientUserId: "65a000000000000000000001" },
        { recipientUserId: null, userId: "65a000000000000000000001" },
      ],
    });
  });
});
