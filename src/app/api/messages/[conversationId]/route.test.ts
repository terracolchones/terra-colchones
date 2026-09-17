import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const fixture = vi.hoisted(() => ({ auth: vi.fn(), conversation: vi.fn(), page: vi.fn(), insert: vi.fn(), update: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/dashboard-auth", () => ({ requireDashboardAuth: fixture.auth }));
vi.mock("@/lib/db", () => ({ getConversationById: fixture.conversation, getDashboardMessagePage: fixture.page, insertMessage: fixture.insert, updateMessageWaId: fixture.update }));
vi.mock("@/lib/meta/client", () => ({ sendTextMessage: fixture.send }));
import { GET, POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  fixture.auth.mockReturnValue(null);
  fixture.conversation.mockReturnValue({ id: 1, phone: "12025550100", mode: "HUMAN" });
  fixture.page.mockReturnValue({ messages: [], hasMore: false, nextCursor: null });
});

const context = { params: Promise.resolve({ conversationId: "1" }) };
describe("dashboard messages route", () => {
  it("requires authentication before querying history", async () => {
    fixture.auth.mockReturnValue(NextResponse.json({ error: "Autenticación requerida" }, { status: 401 }));
    expect((await GET(new NextRequest("http://localhost/api/messages/1"), context)).status).toBe(401);
    expect(fixture.page).not.toHaveBeenCalled();
    expect(fixture.conversation).not.toHaveBeenCalled();
  });
  it("keeps the existing response fields and supplies pagination without sending or writing", async () => {
    const response = await GET(new NextRequest("http://localhost/api/messages/1?before=1700000000.80"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ conversation: { id: 1 }, messages: [], hasMore: false });
    expect(fixture.page).toHaveBeenCalledWith(1, { before: { createdAt: 1700000000, id: 80 }, after: undefined });
    expect(fixture.insert).not.toHaveBeenCalled();
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it("rejects invalid and ambiguous cursors before reading", async () => {
    for (const query of ["before=bad", "before=1.1&after=1.2", "before=1.1&before=1.2", "after="]) {
      expect((await GET(new NextRequest(`http://localhost/api/messages/1?${query}`), context)).status).toBe(400);
    }
    expect(fixture.page).not.toHaveBeenCalled();
  });
  it("preserves the existing AI-mode send restriction", async () => {
    fixture.conversation.mockReturnValue({ id: 1, phone: "12025550100", mode: "AI" });
    const response = await POST(new NextRequest("http://localhost/api/messages/1", { method: "POST", body: JSON.stringify({ content: "Texto sintético" }) }), context);
    expect(response.status).toBe(409);
    expect(fixture.insert).not.toHaveBeenCalled();
    expect(fixture.send).not.toHaveBeenCalled();
  });
  it("preserves manual text sending in HUMAN mode with the existing transport", async () => {
    fixture.insert.mockReturnValue(11);
    fixture.send.mockResolvedValue({ wa_message_id: "synthetic-confirmed" });
    const response = await POST(new NextRequest("http://localhost/api/messages/1", { method: "POST", body: JSON.stringify({ content: "Texto sintético" }) }), context);
    expect(response.status).toBe(200);
    expect(fixture.send).toHaveBeenCalledWith("12025550100", "Texto sintético");
    expect(fixture.update).toHaveBeenCalledWith(11, "synthetic-confirmed");
  });
});
